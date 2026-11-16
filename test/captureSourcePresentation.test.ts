import { expect, it } from 'vitest'
import {
  captureStep,
  sessionViewForProtocol,
  sourcePresentationProtocol,
  sourcePhotoNamesForCapture,
  capturedFaceMessageForCapture,
  captureWarningForProtocol,
} from '../src/client/capture/captureFlow'
import { captureProtocol } from '../src/client/capture/guidedCaptureProtocol'
import { diagnoseForProtocol } from '../src/core/capture/CaptureDiagnosis.gen'
import { describeCenterIssueForProtocol } from '../src/core/capture/CaptureSteps.gen'
import { summarizeMeta } from '../src/core/capture/FixtureZip.gen'
import type { FaceCaptureData } from '../src/client/capture/captureTypes'
const v1 = 'sides-then-top-bottom/v1',
  v2 = 'sides-then-top-bottom/v2'
function photo(step: number, protocol?: string): FaceCaptureData {
  return {
    colors: Array.from({ length: 3 }, () => ['W', 'W', 'W']),
    confidence: 1,
    timestamp: 0,
    ...(protocol
      ? { captureGuide: { step, protocol, mirrored: true, displayedArrow: 0 } }
      : {}),
  }
}
for (const [protocol, cap5, cap6] of [
  [v1, 'Top', 'Bottom'],
  [v2, 'Bottom', 'Top'],
] as const) {
  it(`labels partial ${protocol} source messages and warnings without claiming a complete state`, () => {
    const faces = { L: photo(4, protocol) }
    expect(sourcePresentationProtocol(faces, null)).toBe(protocol)
    expect(sourcePhotoNamesForCapture(faces, null).slice(4)).toEqual([
      cap5,
      cap6,
    ])
    expect(capturedFaceMessageForCapture(faces, 'L', 1, false, null)).toContain(
      `✓ ${cap5} captured`,
    )
    expect(capturedFaceMessageForCapture(faces, 'B', 1, false, null)).toContain(
      `✓ ${cap6} captured`,
    )
    expect(
      captureWarningForProtocol(faces, [[4, 5]], 3, [], null)!.text,
    ).toContain(`${cap6} and ${cap5}`)
    expect(captureProtocol(faces, protocol)).toBeNull()
    const poor = diagnoseForProtocol(
      2,
      [],
      [undefined, undefined, undefined, undefined, 20],
      false,
      protocol,
    )
    expect(poor.cause).toContain(`the ${cap5} photo is poor`)
  })
}
it('uses neutral names for unknown and mixed records and preserves explicit legacy retake naming', () => {
  for (const faces of [
    { L: photo(4) },
    { L: photo(4, v1), B: photo(5, v2) },
  ] as Record<string, FaceCaptureData>[]) {
    expect(sourcePresentationProtocol(faces, null)).toBeNull()
    expect(sourcePhotoNamesForCapture(faces, null).slice(4)).toEqual([
      'Photo 5',
      'Photo 6',
    ])
    expect(capturedFaceMessageForCapture(faces, 'L', 1, false, null)).toContain(
      'Photo 5 captured',
    )
    expect(
      captureWarningForProtocol(faces, [[4, 5]], 3, [], null)!.text,
    ).toContain('Photo 6 and Photo 5')
  }
  expect(
    sourcePhotoNamesForCapture({ L: photo(4, 'retake/v1') }, v1).slice(4),
  ).toEqual(['Top', 'Bottom'])
  expect(sourcePhotoNamesForCapture({ L: photo(4) }, v1).slice(4)).toEqual([
    'Top',
    'Bottom',
  ])
  expect(sourcePresentationProtocol({ L: photo(4, v1) }, v2)).toBeNull()
})

it('uses the shared source names in fixture summaries including poor-cap-photo causes', () => {
  for (const [protocol, cap] of [
    [v1, 'Top'],
    [v2, 'Bottom'],
    [null, 'Photo 5'],
  ] as const) {
    const guide = protocol ? photo(4, protocol).captureGuide : undefined
    const meta = {
      gridSize: 2,
      faces: {
        l: {
          readings: Array.from({ length: 4 }, () => [10, 20, 30]),
          confidences: [20, 20, 20, 20],
          captureGuide: guide,
        },
      },
      capture: { protocol },
    }
    const summary = summarizeMeta(meta)
    expect(summary.rows.find(([key]) => key === 'Likely cause')![1]).toContain(
      `the ${cap} photo is poor`,
    )
  }
})

it('carries known legacy context through production retake messages and session warnings without persisting label context', () => {
  const faces = { L: photo(4) }
  const result = captureStep(
    faces,
    'L',
    {
      colors: faces.L.colors,
      confidence: 1,
      captureGuide: {
        step: 4,
        protocol: 'retake/v1',
        mirrored: false,
        displayedArrow: null,
      },
    },
    'camera',
    undefined,
    undefined,
    3,
    false,
    1,
    v1,
  )
  if (!result.ok) throw new Error(result.message)
  expect(result.message).toContain('Top captured')
  expect(result.faces.L.captureGuide!.protocol).toBe('retake/v1')
  expect(result.faces.L).not.toHaveProperty('sourceLabelProtocol')
  expect(
    sessionViewForProtocol(result.faces, 'B', 3, [], v1).predictedCenter,
  ).toBeDefined()
})

it('uses versioned names for center warnings and explicit fresh-camera presentation without a state claim', () => {
  const issue = {
    kind: 'not-opposite' as const,
    photos: [4, 5] as [number, number],
  }
  expect(describeCenterIssueForProtocol(issue, v1)).toContain('Top and Bottom')
  expect(describeCenterIssueForProtocol(issue, v2)).toContain('Bottom and Top')
  expect(describeCenterIssueForProtocol(issue, null)).toContain(
    'Photo 5 and Photo 6',
  )
  expect(sourcePhotoNamesForCapture({}, v2).slice(4)).toEqual(['Bottom', 'Top'])
  expect(captureProtocol({}, v2)).toBeNull()
})

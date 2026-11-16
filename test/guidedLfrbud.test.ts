import { reviewNetLayout } from '../src/client/capture/approvalPhotos'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { readFixtureColors } from '../src/client/fixtures/fixtureFormat'
import { expect, it } from 'vitest'
import {
  rotateCube,
  rotateGrid,
  solvedCubeFaces,
  turnFace,
  type Faces,
} from '../src/cube/cubeGeometry'
import { standardOrientation } from '../src/cube/CubeAssembly.gen'
import { recordGuide } from '../src/client/capture/captureRecovery'
import { captureStep, sessionView } from '../src/client/capture/captureFlow'
import {
  captureProtocol,
  reviewProtocol,
  currentMapping,
  mirroredMapping,
} from '../src/client/capture/guidedCaptureProtocol'
import type { FaceCaptureData } from '../src/client/capture/captureTypes'
import { generateForProtocol } from '../src/client/capture/spatialOrientationWizard'
const protocol = 'left-front-right-back-up-down/v3'
const mirroredProtocol = 'right-back-left-front-up-down/v3'
const slots = ['U', 'R', 'F', 'D', 'L', 'B']
const targets = ['L', 'F', 'R', 'B', 'U', 'D'] as const
function photograph(original: Faces, mirrored = false) {
  let held = rotateCube(original, 'y', mirrored ? 1 : -1)
  return Object.fromEntries(
    slots.map((slot, step) => {
      if (step > 0 && step < 4) held = rotateCube(held, 'y', 1)
      if (step === 4) held = rotateCube(held, 'x', -1)
      if (step === 5) held = rotateCube(held, 'x', 2)
      return [slot, held.F]
    }),
  )
}
it('records the new LFRBUD convention without rewriting physical v2', () => {
  expect(recordGuide('U', false, false)?.protocol).toBe(protocol)
  expect(recordGuide('U', true, false)?.protocol).toBe(mirroredProtocol)
})
it('derives all six source photo orientations from the physical five transitions', () => {
  const labels = Object.fromEntries(
    slots.map((face) => [
      face,
      Array.from({ length: 3 }, (_, r) =>
        Array.from({ length: 3 }, (_, c) => `${face}${r * 3 + c}`),
      ),
    ]),
  ) as Faces
  for (const mirrored of [false, true]) {
    const photos = photograph(labels, mirrored)
    const faces = mirrored ? (['R', 'B', 'L', 'F', 'U', 'D'] as const) : targets
    const mapping = mirrored ? mirroredMapping : currentMapping
    for (const [i, slot] of slots.entries()) {
      const turns = i < 4 || mirrored ? 0 : 2
      expect(photos[slot]).toEqual(rotateGrid(labels[faces[i]], turns))
      expect(mapping[i]).toEqual({
        slot,
        target: faces[i],
        quarterTurns: turns,
      })
    }
  }
})
for (const size of [2, 3, 4, 7])
  for (const mirror of [false, true])
    it(`keeps the exact LFRBUD scanned state at size=${size}, mirror=${mirror}`, () => {
      let original = solvedCubeFaces(size, {
        U: 'W',
        R: 'R',
        F: 'G',
        D: 'Y',
        L: 'O',
        B: 'B',
      })
      for (const [face, q] of [
        ['R', 1],
        ['U', 3],
        ['F', 2],
        ['L', 1],
      ] as const)
        original = turnFace(original, face, q)
      const photos = photograph(original, mirror)
      const before = JSON.stringify(photos)
      for (const slot of slots)
        expect(recordGuide(slot, mirror, false)?.mirrored).toBe(mirror)
      const result = generateForProtocol(
        photos,
        size,
        mirror ? mirroredProtocol : protocol,
      )
      expect(result.baselineStatus).toBe('checked')
      expect(result.baseline?.faces).toEqual(
        standardOrientation(original).faces,
      )
      expect(result.session.candidates).toHaveLength(1)
      expect(JSON.stringify(photos)).toBe(before)
    })

for (const size of [3, 5, 7])
  for (const mirrored of [false, true])
    it(`routes real LFRBUD source steps without center reassignment at size=${size}, mirror=${mirrored}`, () => {
      const original = turnFace(
        solvedCubeFaces(size, {
          U: 'W',
          R: 'R',
          F: 'G',
          D: 'Y',
          L: 'O',
          B: 'B',
        }),
        'R',
        1,
      )
      const photos = photograph(original, mirrored)
      let captured: Record<string, FaceCaptureData> = {}
      let requested: string | null = 'U'
      for (const [step, slot] of slots.entries()) {
        expect(requested).toBe(slot)
        const guide = recordGuide(slot, mirrored, false)!
        if (step >= 2)
          expect(sessionView(captured, slot, size, []).predictedCenter).toBe(
            photos[slot][Math.floor(size / 2)][Math.floor(size / 2)],
          )
        const result = captureStep(
          captured,
          slot,
          { colors: photos[slot], confidence: 1, captureGuide: guide },
          'camera',
          undefined,
          undefined,
          size,
          false,
          step,
        )
        expect(result.ok).toBe(true)
        if (!result.ok) throw new Error(result.message)
        expect(result.assignedFace).toBe(slot)
        expect(result.faces[slot].captureGuide).toEqual(guide)
        captured = result.faces
        requested = result.nextFace
      }
      expect(captureProtocol(captured, null)).toBe(
        mirrored ? mirroredProtocol : protocol,
      )
      expect(
        generateForProtocol(
          photos,
          size,
          mirrored ? mirroredProtocol : protocol,
        ).baseline?.faces,
      ).toEqual(standardOrientation(original).faces)
    })

it('does not reinterpret mixed or contradictory v3 observations as a legacy proposal', () => {
  const photos = photograph(
    solvedCubeFaces(3, { U: 'W', R: 'R', F: 'G', D: 'Y', L: 'O', B: 'B' }),
  )
  const captured = Object.fromEntries(
    slots.map((slot) => [
      slot,
      {
        colors: photos[slot],
        confidence: 1,
        timestamp: 0,
        captureGuide: recordGuide(slot, false, false)!,
      },
    ]),
  )
  for (const guide of [
    recordGuide('R', true, false)!,
    { ...recordGuide('R', false, false)!, mirrored: true },
    recordGuide('R', false, true)!,
  ]) {
    const mixed = { ...captured, R: { ...captured.R, captureGuide: guide } }
    expect(captureProtocol(mixed, null)).toBeNull()
    const found = generateForProtocol(
      photos,
      3,
      reviewProtocol(mixed, null, true),
    )
    expect(found.baselineStatus).toBe('conflict')
    expect(found.session.candidates).toHaveLength(0)
  }
})

it('retains the original camera metadata while checking its explicitly confirmed Up/Down interpretation', () => {
  const bytes = readFileSync(
    'test/fixtures/cube-4x4-2026-11-16T19-08-19.assembly.json',
  )
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(
    'f76e61a0aa8bafd12db3b378b033d910853267e3ddea5d7387d19482bfc5f65c',
  )
  const meta = JSON.parse(bytes.toString())
  expect(meta.capture.protocol).toBe('sides-then-top-bottom/v2')
  expect(meta.capture.assembledURFDLB).toBeNull()
  const colors = readFixtureColors(meta)!.colors
  const historical = generateForProtocol(colors, 4, 'sides-then-top-bottom/v2')
  expect(historical.baselineStatus).toBe('conflict')
  // This is an explicit interpretation test, not an upgrade of the recording.
  for (const frame of [protocol, mirroredProtocol])
    expect(generateForProtocol(colors, 4, frame).baselineStatus).toBe('checked')
  expect(meta.capture.protocol).toBe('sides-then-top-bottom/v2')
})

for (const mirrored of [false, true])
  it(`uses the recorded v3 mapping in both review nets, mirror=${mirrored}`, () => {
    const original = turnFace(
      solvedCubeFaces(4, { U: 'W', R: 'R', F: 'G', D: 'Y', L: 'O', B: 'B' }),
      'R',
      1,
    )
    const photos = photograph(original, mirrored)
    const captured = Object.fromEntries(
      slots.map((slot) => [
        slot,
        {
          colors: photos[slot],
          confidence: 1,
          timestamp: 0,
          captureGuide: recordGuide(slot, mirrored, false)!,
        },
      ]),
    )
    const expected = generateForProtocol(
      photos,
      4,
      mirrored ? mirroredProtocol : protocol,
    ).baseline!
    const layout = reviewNetLayout(captured, slots)!
    for (const entry of expected.mapping)
      expect(layout[entry.target]).toEqual({
        slot: slots.indexOf(entry.slot),
        colors: expected.faces[entry.target],
        turns: entry.quarterTurns,
      })
    const mixed = {
      ...captured,
      R: { ...captured.R, captureGuide: recordGuide('R', !mirrored, false)! },
    }
    expect(reviewNetLayout(mixed, slots)).toBeNull()
  })

for (const declared of [protocol, mirroredProtocol])
  for (const kind of ['all-retakes', 'all-missing'])
    it(`keeps declared ${declared} uncertain with ${kind}`, () => {
      const photos = photograph(
        solvedCubeFaces(3, { U: 'W', R: 'R', F: 'G', D: 'Y', L: 'O', B: 'B' }),
      )
      const captured = Object.fromEntries(
        slots.map((slot) => [
          slot,
          {
            colors: photos[slot],
            confidence: 1,
            timestamp: 0,
            captureGuide:
              kind === 'all-retakes'
                ? recordGuide(slot, declared === mirroredProtocol, true)!
                : undefined,
          },
        ]),
      )
      expect(captureProtocol(captured, declared)).toBeNull()
      for (const guided of [false, true]) {
        const found = generateForProtocol(
          photos,
          3,
          reviewProtocol(captured, declared, guided),
        )
        expect(found.baselineStatus).toBe('conflict')
        expect(found.session.candidates).toHaveLength(0)
      }
    })


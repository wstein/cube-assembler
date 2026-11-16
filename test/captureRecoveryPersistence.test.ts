import { describe, expect, it } from 'vitest'
import {
  captureFrame,
  validateMapping,
  type FaceMapping,
} from '../src/client/capture/captureFaceMapping'
import {
  readRecovery,
  type CaptureRecovery,
} from '../src/client/capture/captureRecovery'
import {
  buildCaptureFixture,
  type CaptureFixtureInput,
} from '../src/client/capture/captureFixture'
import { readFixtureColors } from '../src/client/fixtures/fixtureFormat'
import { assembleCubeFromFaces } from '../src/cube/cubeAssembly'
import { rotateGrid, turnFace, type Faces } from '../src/cube/cubeGeometry'

const KEYS = ['U', 'R', 'F', 'D', 'L', 'B'] as const
const COLORS = ['W', 'R', 'G', 'Y', 'O', 'B']
const setup = (n: number) => {
  const solved = Object.fromEntries(
    KEYS.map((f, i) => [
      f,
      Array.from({ length: n }, () => Array<string>(n).fill(COLORS[i])),
    ]),
  ) as Faces
  const faces = turnFace(turnFace(solved, 'R', 1), 'U', 1)
  const mapping: FaceMapping = KEYS.map((slot, i) => ({
    slot,
    target: KEYS[(i + 2) % 6],
    quarterTurns: i % 4,
  }))
  const raw = Object.fromEntries(
    mapping.map((p) => [p.slot, rotateGrid(faces[p.target], -p.quarterTurns)]),
  )
  const pose = captureFrame(raw, mapping, 'U', 'L')!
  const record: CaptureRecovery = {
    stateRelation: 'capture',
    version: 1,
    transformConvention: 'cube-geometry-orientations/v1',
    mapping,
    view: 'capture',
    captureFrame: {
      frontSlot: 'U',
      upSlot: 'L',
      confirmed: true,
      displayTransform: pose.displayTransform,
      canonicalTransform: pose.canonicalTransform,
      photoTransforms: pose.mapping,
      protocol: 'sides-then-top-bottom/v1',
      mirrored: true,
      turnDirection: 'right',
      capOrder: 'bottom-top',
      displayedArrows: [],
      guideObservations: [],
    },
  }
  return { raw, faces, record }
}

describe('versioned exact face recovery', () => {
  for (const n of [2, 3, 4, 5, 6, 7, 8])
    it(`retains explicit slots, all rotations and capture pose for ${n}x${n}`, () => {
      const { raw, faces, record } = setup(n)
      const before = JSON.stringify(raw)
      expect(validateMapping(raw, record.mapping, n).valid).toBe(true)
      const imported = readRecovery(JSON.parse(JSON.stringify(record)))!
      expect(imported).toEqual(record)
      expect(validateMapping(raw, imported.mapping, n).faces).toEqual(faces)
      expect(JSON.stringify(raw)).toBe(before)
      const input: CaptureFixtureInput = {
        capturedFaces: Object.fromEntries(
          KEYS.map((slot) => [
            slot,
            {
              colors: raw[slot],
              detectedColors: raw[slot],
              croppedImage: 'data:image/jpeg;base64,AAAA',
              confidence: 1,
              timestamp: 0,
              source: 'fixture',
            },
          ]),
        ),
        puzzleSize: n,
        version: 'test',
        commit: '8ac10f5',
        userAgent: 'test',
        devicePixelRatio: 1,
        mirrored: true,
        faceRecovery: imported,
        cameraInfo: null,
        captureProfile: null,
        resolvedColorProfile: null,
        automaticResolution: null,
        resolvedColorReference: null,
        guided: true,
        cube: assembleCubeFromFaces(faces, n),
        appliedBackgroundGains: null,
        sampling: { stickerCore: 0.6 },
        calibrationApplied: false,
        learnedPalette: null,
      }
      const fixture = buildCaptureFixture(input)
      const meta = JSON.parse(
        new TextDecoder().decode(fixture.files['meta.json']),
      )
      expect(readRecovery(meta.capture.faceRecovery)).toEqual(record)
      expect(readFixtureColors(meta)!.colors).toEqual(raw)
      expect(meta.capture.mirrored).toBe(true)
      expect(meta.capture.assemblyValidation.status).toBe('checks-passed')
      if (n >= 4)
        expect(meta.capture.assemblyValidation.fullNxNReachability).toBe(
          'unverified',
        )
      expect(meta.capture.faceRecovery.captureFrame.photoTransforms).toEqual(
        record.captureFrame.photoTransforms,
      )
    })

  it('rejects malformed, future, reflected or non-bijective records instead of repairing them', () => {
    const { record } = setup(3)
    const invalid = [
      { ...record, version: 2 },
      { ...record, view: 'nonsense' },
      {
        ...record,
        captureFrame: { ...record.captureFrame, turnDirection: 'nonsense' },
      },
      {
        ...record,
        captureFrame: {
          ...record.captureFrame,
          canonicalTransform: (record.captureFrame.canonicalTransform + 1) % 24,
        },
      },
      {
        ...record,
        captureFrame: {
          ...record.captureFrame,
          guideObservations: [
            {
              slot: 'U',
              step: 6,
              mirrored: true,
              displayedArrow: null,
              protocol: 'retake/v1',
            },
          ],
        },
      },
      { ...record, transformConvention: 'unknown' },
      {
        ...record,
        mapping: record.mapping.map((p) => ({ ...p, target: 'U' })),
      },
      {
        ...record,
        mapping: record.mapping.map((p) => ({ ...p, quarterTurns: 4 })),
      },
      {
        ...record,
        captureFrame: { ...record.captureFrame, canonicalTransform: 99 },
      },
      {
        ...record,
        captureFrame: {
          ...record.captureFrame,
          displayedArrows: [270, 270, 270, 0, 0, 'bad'],
        },
      },
    ]
    for (const value of invalid) expect(readRecovery(value)).toBeNull()
    expect(readRecovery(undefined)).toBeNull()
    expect(readRecovery(null)).toBeNull()
  })
})

it('keeps a checked later viewer state separate from the initial photo mapping', async () => {
  const { raw, faces, record } = setup(3)
  const { restoredCandidate } = await import(
    '../src/client/capture/captureRecovery'
  )
  const after = turnFace(faces, 'F', 1)
  const later: CaptureRecovery = {
    ...record,
    stateRelation: 'after-viewer-moves',
  }
  expect(restoredCandidate(later, raw, 3, after)?.faces).toEqual(after)
  expect(restoredCandidate(later, raw, 3, null)).toBeNull()
  expect(restoredCandidate(record, raw, 3, after)).toBeNull()
  expect(validateMapping(raw, later.mapping, 3).faces).toEqual(faces)
  const invalid = structuredClone(after)
  invalid.U[0][0] = 'R'
  expect(restoredCandidate(later, raw, 3, invalid)).toBeNull()
})

it('records retake prompts without inventing a sixth step or an unshown turn arrow', async () => {
  const { recordGuide } = await import('../src/client/capture/captureRecovery')
  expect(recordGuide('U', true, true)).toEqual({
    step: 0,
    mirrored: true,
    protocol: 'retake/v1',
    displayedArrow: null,
  })
  expect(recordGuide('B', false, true)).toEqual({
    step: 5,
    mirrored: false,
    protocol: 'retake/v1',
    displayedArrow: null,
  })
  expect(recordGuide('R', true, false)).toEqual({
    step: 1,
    mirrored: true,
    protocol: 'sides-then-top-bottom/v2',
    displayedArrow: 270,
  })
  expect(recordGuide('BAD', false, false)).toBeNull()
})

it('retains nonempty per-photo guide records and replaces only a retaken photo', async () => {
  const { recordGuide, mergeGuideObservations } = await import(
    '../src/client/capture/captureRecovery'
  )
  const { record } = setup(3)
  const previous = KEYS.map((slot, i) => ({
    slot,
    ...recordGuide(slot, i % 2 === 0, false)!,
  }))
  const captured = {
    B: {
      colors: [['B']],
      confidence: 1,
      timestamp: 1,
      captureGuide: recordGuide('B', false, true)!,
    },
  }
  const next = mergeGuideObservations(previous, captured)
  expect(next).toHaveLength(6)
  expect(next.slice(0, 5)).toEqual(previous.slice(0, 5))
  expect(next[5]).toEqual({
    slot: 'B',
    step: 5,
    mirrored: false,
    protocol: 'retake/v1',
    displayedArrow: null,
  })
  const saved = {
    ...record,
    captureFrame: { ...record.captureFrame, guideObservations: next },
  }
  expect(readRecovery(JSON.parse(JSON.stringify(saved)))).toEqual(saved)
  expect(
    readRecovery({
      ...saved,
      captureFrame: {
        ...saved.captureFrame,
        guideObservations: [next[0], next[0]],
      },
    }),
  ).toBeNull()
})

it('rejects an improper fixed-center frame in a claimed later saved state', async () => {
  const { raw, faces, record } = setup(3)
  const { restoredCandidate } = await import(
    '../src/client/capture/captureRecovery'
  )
  const invalid = structuredClone(faces)
  const value = invalid.R[1][1]
  invalid.R[1][1] = invalid.L[1][1]
  invalid.L[1][1] = value
  expect(
    restoredCandidate(
      { ...record, stateRelation: 'after-viewer-moves' },
      raw,
      3,
      invalid,
    ),
  ).toBeNull()
})

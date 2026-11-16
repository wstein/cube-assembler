import { readFileSync } from 'node:fs'
import { strFromU8, unzipSync } from 'fflate'
import { expect, it } from 'vitest'
import {
  allOrientations,
  rotateCube,
  rotateGrid,
  solvedCubeFaces,
  turnFace,
  type Faces,
} from '../src/cube/cubeGeometry'
import { standardOrientation } from '../src/cube/CubeAssembly.gen'
import {
  physicalMapping,
  physicalProtocol,
  legacyProtocol,
  physicalSeed,
  captureProtocol,
} from '../src/client/capture/guidedCaptureProtocol'
import {
  generateForProtocol,
  knownAlternatives,
} from '../src/client/capture/spatialOrientationWizard'
import { captureFrame } from '../src/client/capture/captureFaceMapping'
import {
  readRecovery,
  recordGuide,
} from '../src/client/capture/captureRecovery'
import { readFixtureColors } from '../src/client/fixtures/fixtureFormat'
const slots = ['U', 'R', 'F', 'D', 'L', 'B']
const sourceFaces = ['F', 'R', 'B', 'L', 'D', 'U'] as const
function photograph(initial: Faces): Record<string, string[][]> {
  let held = initial
  return Object.fromEntries(
    slots.map((slot, i) => {
      if (i > 0 && i < 4) held = rotateCube(held, 'y', 1)
      if (i === 4) held = rotateCube(held, 'x', 1)
      if (i === 5) held = rotateCube(held, 'x', 2)
      return [slot, held.F]
    }),
  )
}
it('independently derives every source and pixel orientation from the physical 3D rotation sequence', () => {
  const labeled = Object.fromEntries(
    slots.map((face) => [
      face,
      Array.from({ length: 3 }, (_, row) =>
        Array.from({ length: 3 }, (_, col) => `${face}${row * 3 + col}`),
      ),
    ]),
  ) as Faces
  const photos = photograph(labeled)
  for (const [i, slot] of slots.entries()) {
    expect(photos[slot]).toEqual(
      rotateGrid(labeled[sourceFaces[i]], [0, 0, 0, 0, 1, 3][i]),
    )
    expect(physicalMapping[i]).toEqual({
      slot,
      target: sourceFaces[i],
      quarterTurns: [0, 0, 0, 0, 3, 1][i],
    })
  }
})
for (const size of [2, 3, 4, 5, 6, 7])
  for (const mirrored of [false, true]) {
    it(`preserves the exact physical ${size}×${size} assembly with mirror=${mirrored}`, () => {
      let original = solvedCubeFaces(size, {
        U: 'W',
        R: 'R',
        F: 'G',
        D: 'Y',
        L: 'O',
        B: 'B',
      })
      for (const [face, turns] of [
        ['F', 1],
        ['R', 2],
        ['U', 3],
        ['L', 1],
        ['D', 2],
        ['B', 3],
      ] as const)
        original = turnFace(original, face, turns)
      const photos = photograph(original)
      const before = JSON.stringify(photos)
      for (const slot of slots) {
        const observation = recordGuide(slot, mirrored, false)!
        expect(observation.protocol).toBe(physicalProtocol)
        expect(observation.mirrored).toBe(mirrored)
      }
      const seed = physicalSeed(photos, size)
      expect(seed.validation.valid).toBe(true)
      expect(seed.validation.faces).toEqual(standardOrientation(original).faces)
      const found = generateForProtocol(photos, size, physicalProtocol)
      expect(found.baselineStatus).toBe('checked')
      expect(found.baseline!.mapping).toEqual(seed.mapping)
      expect(found.baseline!.faces).toEqual(standardOrientation(original).faces)
      expect(JSON.stringify(photos)).toBe(before)
    })
  }
it('keeps legacy fixture protocols ambiguous and never retroactively declares the physical v2 baseline', () => {
  const zip = unzipSync(
    readFileSync('test/fixtures/orientation-recovery-7x7.zip'),
  )
  const key = Object.keys(zip).find((key) => key.endsWith('/meta.json'))!
  const old = readFixtureColors(JSON.parse(strFromU8(zip[key])))!.colors
  const found = generateForProtocol(old, 7, legacyProtocol)
  expect(found.baseline).toBeNull()
  expect(found.baselineStatus).toBe('legacy')
  expect(found.session.candidates.length).toBeGreaterThan(0)
})
it('reports conflict for an invalid physical seed without choosing an opposite heuristic baseline', () => {
  const photos = photograph(
    solvedCubeFaces(3, { U: 'W', R: 'R', F: 'G', D: 'Y', L: 'O', B: 'B' }),
  )
  photos.U[0][0] = '?'
  const found = generateForProtocol(photos, 3, physicalProtocol)
  expect(found.baseline).toBeNull()
  expect(found.baselineStatus).toBe('conflict')
  expect(found.issues.join(' ')).toContain('no alternative physical state')
})

it('requires six consistent original shot records before recognizing physical v2', () => {
  const photos = Object.fromEntries(
    slots.map((slot) => [
      slot,
      {
        colors: [['W']],
        confidence: 1,
        timestamp: 0,
        captureGuide: recordGuide(slot, false, false)!,
      },
    ]),
  )
  expect(captureProtocol(photos, null)).toBe(physicalProtocol)
  expect(
    captureProtocol(
      {
        ...photos,
        R: { ...photos.R, captureGuide: recordGuide('R', false, true)! },
      },
      physicalProtocol,
    ),
  ).toBeNull()
  const absent = Object.fromEntries(
    slots.map((slot) => [
      slot,
      { colors: [['W']], confidence: 1, timestamp: 0 },
    ]),
  )
  expect(
    captureProtocol(
      {
        ...photos,
        R: {
          ...photos.R,
          captureGuide: { ...photos.R.captureGuide, protocol: legacyProtocol },
        },
      },
      physicalProtocol,
    ),
  ).toBeNull()
  expect(
    captureProtocol({ ...photos, R: absent.R }, physicalProtocol),
  ).toBeNull()
  expect(captureProtocol(absent, physicalProtocol)).toBeNull()
  expect(captureProtocol(absent, legacyProtocol)).toBe(legacyProtocol)
})

it('preserves physical source rotations for symmetric grids instead of rematching identical content', () => {
  const photos = photograph(
    solvedCubeFaces(3, { U: 'W', R: 'R', F: 'G', D: 'Y', L: 'O', B: 'B' }),
  )
  const seed = physicalSeed(photos, 3)
  for (const expected of physicalMapping)
    expect(seed.mapping.find((entry) => entry.slot === expected.slot)).toEqual(
      expected,
    )
  const frame = captureFrame(photos, seed.mapping, 'U', 'B')!
  const observations = slots.map((slot) => ({
    slot,
    ...recordGuide(slot, true, false)!,
  }))
  const restored = readRecovery({
    stateRelation: 'capture',
    version: 1,
    transformConvention: 'cube-geometry-orientations/v1',
    mapping: seed.mapping,
    view: 'canonical',
    captureFrame: {
      guideObservations: observations,
      frontSlot: 'U',
      upSlot: 'B',
      confirmed: true,
      displayTransform: frame.displayTransform,
      canonicalTransform: frame.canonicalTransform,
      photoTransforms: frame.mapping,
      protocol: physicalProtocol,
      mirrored: true,
      turnDirection: 'left',
      capOrder: 'bottom-top',
      displayedArrows: [270, 270, 270, 0, 0],
    },
  })
  expect(restored).not.toBeNull()
  expect(restored!.captureFrame.guideObservations).toEqual(observations)
  expect(restored!.mapping).toEqual(seed.mapping)
})

it('retains exact source identity through canonicalization for every initial global pose', () => {
  const solved = solvedCubeFaces(3, {
    U: 'W',
    R: 'R',
    F: 'G',
    D: 'Y',
    L: 'O',
    B: 'B',
  })
  const original = turnFace(turnFace(solved, 'R', 1), 'F', 3)
  const canonical = standardOrientation(original).faces
  const indices = new Set<number>()
  for (const initial of allOrientations(original)) {
    const photos = photograph(initial)
    const seed = physicalSeed(photos, 3)
    expect(seed.validation.valid).toBe(true)
    expect(seed.validation.faces).toEqual(canonical)
    expect(seed.canonicalTransform).toBe(standardOrientation(initial).index)
    indices.add(seed.canonicalTransform!)
    for (const placement of seed.mapping)
      expect(
        rotateGrid(photos[placement.slot], placement.quarterTurns),
      ).toEqual(canonical[placement.target])
  }
  expect(indices.size).toBe(24)
})

it('offers only the checked physical baseline for proven v2 capture metadata', () => {
  const photos = photograph(
    solvedCubeFaces(3, { U: 'W', R: 'R', F: 'G', D: 'Y', L: 'O', B: 'B' }),
  )
  const found = generateForProtocol(photos, 3, physicalProtocol)
  expect(found.baselineStatus).toBe('checked')
  expect(found.session.candidates).toEqual([found.baseline])
  expect(knownAlternatives(found.session, found.baseline!.mapping)).toBe(0)
})
it('does not reinterpret a conflicting v2 capture using otherwise feasible legacy alternatives', () => {
  const archive = unzipSync(
    readFileSync('test/fixtures/orientation-recovery-7x7.zip'),
  )
  const key = Object.keys(archive).find((key) => key.endsWith('/meta.json'))!
  const photos = readFixtureColors(JSON.parse(strFromU8(archive[key])))!.colors
  expect(
    generateForProtocol(photos, 7, legacyProtocol).session.candidates.length,
  ).toBeGreaterThan(0)
  const strict = generateForProtocol(photos, 7, physicalProtocol)
  expect(strict.baselineStatus).toBe('conflict')
  expect(strict.baseline).toBeNull()
  expect(strict.session.candidates).toEqual([])
  expect(strict.issues.join(' ')).toContain('no alternative physical state')
})

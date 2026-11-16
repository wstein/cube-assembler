import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import {
  generateForProtocol,
  knownAlternatives,
} from '../src/client/capture/spatialOrientationWizard'
import {
  allOrientations,
  rotateCube,
  solvedCubeFaces,
  turnFace,
  type Faces,
} from '../src/cube/cubeGeometry'
import type { FaceKey } from '../src/cube/cubeAssembly'
interface Case {
  name: string
  sequence: { face: FaceKey; quarterTurns: number; depth: number }[]
  captured: Faces
  groundTruth: Faces
  legacyAlternatives: number
  legacyRetained: number
  truncated: boolean
}
const fixture = JSON.parse(
  readFileSync('test/fixtures/guided-4x4-acceptance.json', 'utf8'),
) as { cases: Case[] }
for (const saved of fixture.cases) {
  it(`reproduces the legal 4×4 ${saved.name} case with ${saved.legacyAlternatives} legacy alternatives`, () => {
    let cube = solvedCubeFaces(4, {
      U: 'W',
      R: 'R',
      F: 'G',
      D: 'Y',
      L: 'O',
      B: 'B',
    })
    for (const move of saved.sequence)
      cube = turnFace(cube, move.face, move.quarterTurns, move.depth)
    expect(allOrientations(cube)).toContainEqual(saved.groundTruth)
    let held = cube
    const captured = Object.fromEntries(
      ['U', 'R', 'F', 'D', 'L', 'B'].map((slot, step) => {
        if (step > 0 && step < 4) held = rotateCube(held, 'y', 1)
        if (step === 4) held = rotateCube(held, 'x', 1)
        if (step === 5) held = rotateCube(held, 'x', 2)
        return [slot, held.F]
      }),
    )
    expect(captured).toEqual(saved.captured)
    const legacy = generateForProtocol(captured, 4, 'sides-then-top-bottom/v1')
    expect(legacy.baseline).toBeNull()
    expect(legacy.session.candidates).toHaveLength(saved.legacyRetained)
    expect(
      knownAlternatives(legacy.session, legacy.session.candidates[0].mapping),
    ).toBe(saved.legacyAlternatives)
    expect(legacy.session.truncated).toBe(saved.truncated)
    expect(
      legacy.session.candidates.map((candidate) => candidate.faces),
    ).toContainEqual(saved.groundTruth)
    const physical = generateForProtocol(
      captured,
      4,
      'sides-then-top-bottom/v2',
    )
    expect(physical.baselineStatus).toBe('checked')
    expect(physical.baseline!.faces).toEqual(saved.groundTruth)
    expect(physical.session.candidates).toHaveLength(1)
    expect(
      knownAlternatives(physical.session, physical.baseline!.mapping),
    ).toBe(0)
    expect(physical.baseline!.fullCubeValidityKnown).toBe(false)
  })
}

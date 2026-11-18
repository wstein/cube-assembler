import { describe, expect, it } from 'vitest'
import { parityStatus } from '../src/client/capture/captureFlow'
import { buildCubeMesh } from '../src/client/view3d/cubeMesh'
import { NEUTRAL_GAINS } from '../src/client/vision/colorMath'
import { extractColorsFromImageData } from '../src/client/vision/faceDetection'
import { DEFAULT_SAMPLING } from '../src/client/vision/stickerColorGeometry'
import { renderFace } from '../src/client/vision/syntheticFace'
import {
  solveFaceOrientations,
  solveGuidedCapture,
} from '../src/cube/cubeAssembly'
import { solvedCubeFaces, turnFace } from '../src/cube/cubeGeometry'
import { generateScrambleMoves } from '../src/cube/cubeMoves'
import {
  fromURFFacelets,
  fromWRGFacelets,
  toURFFacelets,
  toWRGFacelets,
} from '../src/cube/notation/NotationOutput.gen'
import {
  decodeOrbit64V2Facelets,
  encodeOrbit64V2Facelets,
} from '../src/cube/notation/orbit64V2Facelets'
import { orbit64V2Entries } from '../src/cube/notation/orbit64V2'
import { randomCube } from '../src/cube/randomState'

// Time budgets for the largest size, 15x15x15. Each budget is 10 to 150 times
// the median measured on a busy 10-core machine (see the pull request), so a
// loaded runner does not fail the test but a step that turns quadratic or
// cubic in the size does. The steps are the ones a 15x15 capture and its 3D
// view run: building the cube, notation, parity, the token, the mesh, the
// detection of a photo and the face search.
const SIZE = 15

// Median of three runs, in ms.
function time(run: () => unknown): number {
  const runs: number[] = []
  for (let i = 0; i < 3; i++) {
    const start = performance.now()
    run()
    runs.push(performance.now() - start)
  }
  return runs.sort((a, b) => a - b)[1]
}

const cube = randomCube(SIZE, 3)
const entry = orbit64V2Entries.find(
  (e) => e.n === SIZE && e.model === 'Color' && e.pose === 'Canonical',
)!
const facelets = toURFFacelets(cube)

describe('15x15 budgets', () => {
  const budgets: Array<[string, number, () => unknown]> = [
    ['random cube', 500, () => randomCube(SIZE, 4)],
    ['scramble moves', 100, () => generateScrambleMoves(SIZE)],
    [
      'WRG and URF facelets round trip',
      200,
      () => {
        fromWRGFacelets(toWRGFacelets(cube))
        fromURFFacelets(toURFFacelets(cube))
      },
    ],
    ['full parity report', 500, () => parityStatus(cube, SIZE)],
    [
      'Orbit64 V2 token write and read',
      500,
      () => {
        const written = encodeOrbit64V2Facelets(entry.id, facelets)
        if (written.TAG === 'Error') throw new Error(written._0)
        const read = decodeOrbit64V2Facelets(written._0)
        if (read.TAG === 'Error') throw new Error(read._0)
      },
    ],
    // The adapter defaults to stickerless; the stickered mesh needs `false`.
    ['stickered mesh', 3000, () => buildCubeMesh(cube, SIZE, undefined, false)],
    [
      'stickerless mesh',
      3000,
      () => buildCubeMesh(cube, SIZE, undefined, true),
    ],
  ]
  for (const [name, budget, run] of budgets)
    it(`${name} in under ${budget} ms`, () => {
      expect(time(run)).toBeLessThan(budget)
    })

  it('reads a 600 px photo in under 3000 ms', () => {
    const grid = Array.from({ length: SIZE }, (_, r) =>
      Array.from({ length: SIZE }, (_, c) => 'WYORGB'[(r * 2 + c * 3) % 6]),
    )
    const pixels = renderFace(grid, 'clean', 1, 600)
    expect(time(() => renderFace(grid, 'clean', 1, 600))).toBeLessThan(3000)
    expect(
      time(() =>
        extractColorsFromImageData(
          pixels,
          600,
          600,
          SIZE,
          NEUTRAL_GAINS,
          DEFAULT_SAMPLING,
        ),
      ),
    ).toBeLessThan(2000)
  })

  it('orients the six faces of a scrambled cube in under 2000 ms', () => {
    const faces = solvedCubeFaces(SIZE, {
      U: 'W',
      R: 'R',
      F: 'G',
      D: 'Y',
      L: 'O',
      B: 'B',
    })
    let scrambled = faces
    for (let i = 0; i < 40; i++)
      scrambled = turnFace(
        scrambled,
        (['U', 'R', 'F', 'D', 'L', 'B'] as const)[i % 6],
        1 + (i % 3),
        1 + (i % 7),
      )
    expect(time(() => solveFaceOrientations(scrambled))).toBeLessThan(2000)
    // The guided search takes four side photos and two caps.
    const capture = {
      sides: [scrambled.F, scrambled.R, scrambled.B, scrambled.L],
      caps: [scrambled.U, scrambled.D],
    } as Parameters<typeof solveGuidedCapture>[0]
    expect(time(() => solveGuidedCapture(capture))).toBeLessThan(10_000)
  }, 60_000)
})

/**
 * test/cubeGeometry.test.ts
 * The 3D sticker model (src/client/cubeGeometry.ts): face turns and
 * whole-cube rotations. Scrambles built with it must read as valid cubes
 * to the existing orientation solver - which catches any sticker placed
 * on the wrong spot or read back mirrored.
 *
 * Run: npx vitest run test/cubeGeometry.test.ts
 */
import { describe, it, expect } from 'vitest'
import { rotateCube, turnFace, allOrientations, solvedCubeFaces, type Faces } from '../src/client/cubeGeometry'
import { solveFaceOrientations, type FaceKey } from '../src/client/cubeAssembly'

const WCA: Record<FaceKey, string> = { U: 'W', R: 'R', F: 'G', D: 'Y', L: 'O', B: 'B' }
const FACES: FaceKey[] = ['U', 'R', 'F', 'D', 'L', 'B']

// Small deterministic PRNG so failures reproduce.
function rng(seed: number) {
  let s = seed
  return () => (s = (s * 16807) % 2147483647) / 2147483647
}

export function scramble(n: number, moves: number, seed: number): Faces {
  const rand = rng(seed)
  let faces = solvedCubeFaces(n, WCA)
  for (let i = 0; i < moves; i++) {
    const face = FACES[Math.floor(rand() * 6)]
    const depth = 1 + Math.floor(rand() * Math.floor(n / 2))
    faces = turnFace(faces, face, 1 + Math.floor(rand() * 3), depth)
  }
  return faces
}

const column = (grid: string[][], c: number) => grid.map((row) => row[c])

describe('turnFace', () => {
  const solved = solvedCubeFaces(3, WCA)

  it('R carries the front up to the top', () => {
    const r = turnFace(solved, 'R', 1)
    expect(column(r.U, 2)).toEqual(['G', 'G', 'G'])
    expect(column(r.F, 2)).toEqual(['Y', 'Y', 'Y'])
    expect(column(r.U, 0)).toEqual(['W', 'W', 'W'])
  })

  it('U brings the right face to the front', () => {
    expect(turnFace(solved, 'U', 1).F[0]).toEqual(['R', 'R', 'R'])
  })

  it('F carries the left face up to the top', () => {
    expect(turnFace(solved, 'F', 1).U[2]).toEqual(['O', 'O', 'O'])
  })

  it('L and D and B turn the opposite way round their axes', () => {
    expect(column(turnFace(solved, 'L', 1).F, 0)).toEqual(['W', 'W', 'W'])
    expect(turnFace(solved, 'D', 1).F[2]).toEqual(['O', 'O', 'O'])
    expect(turnFace(solved, 'B', 1).U[0]).toEqual(['R', 'R', 'R'])
  })

  it('four quarter turns, or a turn and its inverse, change nothing', () => {
    const cube = scramble(4, 20, 1)
    expect(turnFace(cube, 'F', 4, 2)).toEqual(cube)
    expect(turnFace(turnFace(cube, 'L', 1), 'L', 3)).toEqual(cube)
  })
})

describe('rotateCube', () => {
  it('y moves the front face to the left like a U turn, keeping U and D in place', () => {
    const cube = scramble(3, 25, 2)
    const turned = rotateCube(cube, 'y', 1)
    expect(turned.L).toEqual(cube.F)
    expect(turned.F).toEqual(cube.R)
    expect(turned.U[1][1]).toBe(cube.U[1][1])
  })

  it('gives 24 distinct orientations of a scrambled cube', () => {
    const cube = scramble(3, 25, 3)
    const keys = allOrientations(cube).map((f) => JSON.stringify(f))
    expect(new Set(keys).size).toBe(24)
    expect(keys[0]).toBe(JSON.stringify(cube))
  })
})

describe('scrambles read as valid cubes', () => {
  for (const n of [2, 3, 4, 5, 6, 7]) {
    it(`${n}x${n}`, () => {
      for (let seed = 1; seed <= 5; seed++) {
        const cube = scramble(n, 30, seed * 31 + n)
        const solved = solveFaceOrientations(cube)!
        expect(solved.fullyValid, `seed ${seed}`).toBe(true)
      }
    })
  }
})

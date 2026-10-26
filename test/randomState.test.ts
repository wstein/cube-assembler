import { describe, expect, it } from 'vitest'
import { parityStatus } from '../src/client/capture/captureFlow'
import { createSolvedCube, type CubeState } from '../src/cube/cubeAssembly'
import { randomCube } from '../src/cube/randomState'

const SIZES = [2, 3, 4, 5, 6, 7]
const FACES = ['u', 'r', 'f', 'd', 'l', 'b'] as const
const SOLVED = { u: 'W', r: 'R', f: 'G', d: 'Y', l: 'O', b: 'B' }

const seeds = (count: number) => Array.from({ length: count }, (_, i) => i + 1)

describe('a random cube state', () => {
  it.each(SIZES)('is a valid cube at size %i for every seed', (n) => {
    for (const seed of seeds(60)) {
      const cube = randomCube(n, seed)
      const verdict = parityStatus(cube, n)
      expect(verdict.valid, `${n}x${n} seed ${seed}: ${verdict.result}`).toBe(
        true,
      )
    }
  })

  it.each(SIZES)('has every color on n*n stickers at size %i', (n) => {
    for (const seed of seeds(20)) {
      const cube = randomCube(n, seed)
      const counts: Record<string, number> = {}
      for (const face of FACES)
        for (const color of cube[face]) counts[color] = (counts[color] ?? 0) + 1
      expect(Object.values(counts).sort(), `${n}x${n} seed ${seed}`).toEqual(
        Array(6).fill(n * n),
      )
    }
  })

  it('is the same cube for the same seed and another one for another seed', () => {
    expect(randomCube(4, 7)).toEqual(randomCube(4, 7))
    expect(randomCube(4, 7)).not.toEqual(randomCube(4, 8))
    expect(randomCube(3, 0)).not.toEqual(createSolvedCube(3))
  })

  it('keeps the centers of an odd cube where they were', () => {
    for (const n of [3, 5, 7])
      for (const seed of seeds(10)) {
        const cube = randomCube(n, seed)
        for (const face of FACES)
          expect(cube[face][(n * n - 1) / 2], `${n}x${n} ${face}`).toBe(
            SOLVED[face],
          )
      }
  })

  it('keeps the down-back-left corner of an even cube where it was', () => {
    // The frame an even cube is turned in: nothing else pins it down.
    for (const n of [2, 4, 6])
      for (const seed of seeds(20)) {
        const cube = randomCube(n, seed)
        expect(cube.d[n * (n - 1)], `${n}x${n} D`).toBe('Y')
        expect(cube.b[n * n - 1], `${n}x${n} B`).toBe('B')
        expect(cube.l[n * (n - 1)], `${n}x${n} L`).toBe('O')
      }
  })

  it.each(SIZES)('mixes nearly every sticker at size %i', (n) => {
    let moved = 0
    let total = 0
    for (const seed of seeds(30)) {
      const cube = randomCube(n, seed)
      for (const face of FACES)
        for (const color of cube[face]) {
          total++
          if (color !== SOLVED[face]) moved++
        }
    }
    // A sticker keeps its color one time in six by chance.
    expect(moved / total).toBeGreaterThan(0.7)
  })

  it('puts each corner in the first corner slot about equally often', () => {
    const n = 3
    const counts: Record<string, number> = {}
    for (const seed of seeds(800)) {
      const cube: CubeState = randomCube(n, seed)
      // The corner at the top right front: its three colors, as a set.
      const piece = [cube.u[n * n - 1], cube.r[0], cube.f[n - 1]].sort().join()
      counts[piece] = (counts[piece] ?? 0) + 1
    }
    expect(Object.keys(counts)).toHaveLength(8)
    // 100 each by chance; allow for the spread of 800 draws.
    for (const [piece, count] of Object.entries(counts))
      expect(count, piece).toBeGreaterThan(65)
    for (const [piece, count] of Object.entries(counts))
      expect(count, piece).toBeLessThan(140)
  })

  it('twists the corners every way about equally often', () => {
    const n = 3
    const upColorOnTop: number[] = [0, 0, 0]
    // The sticker of the top right front corner on the U face: where the
    // corner's white or yellow sticker sits says how it is twisted.
    for (const seed of seeds(900)) {
      const cube = randomCube(n, seed)
      const colors = [cube.u[n * n - 1], cube.r[0], cube.f[n - 1]]
      const at = colors.findIndex((c) => c === 'W' || c === 'Y')
      if (at >= 0) upColorOnTop[at]++
    }
    // Pieces with a white or yellow sticker: 2 of 8 slots' worth of draws.
    for (const count of upColorOnTop) expect(count).toBeGreaterThan(50)
  })

  it('moves the wings and the centers of a 4x4 and a 5x5 around', () => {
    for (const n of [4, 5]) {
      const centersOffColor = (seed: number) => {
        const cube = randomCube(n, seed)
        let off = 0
        for (const face of FACES)
          for (let r = 1; r < n - 1; r++)
            for (let c = 1; c < n - 1; c++)
              if (cube[face][r * n + c] !== SOLVED[face]) off++
        return off
      }
      const average =
        seeds(30).reduce((sum, seed) => sum + centersOffColor(seed), 0) / 30
      // Of 24 (4x4) or 48 (5x5, minus 6 fixed) center stickers, most are off.
      expect(average).toBeGreaterThan(n === 4 ? 14 : 30)
    }
  })
})

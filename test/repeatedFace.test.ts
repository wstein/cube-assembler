import { describe, expect, it } from 'vitest'
import {
  faceDistance,
  findRepeatShots,
} from '../src/core/color/RepeatedFace.gen'

type Rgb = { r: number; g: number; b: number }

// A face of `size`x`size` stickers whose colors depend on `seed`.
function face(size: number, seed: number, noise = 0): Rgb[][] {
  return Array.from({ length: size }, (_, r) =>
    Array.from({ length: size }, (_, c) => {
      const base = (seed * 53 + r * 37 + c * 91) % 200
      return {
        r: base + 20 + noise,
        g: (base * 3) % 220,
        b: (base * 7 + seed * 11) % 230,
      }
    }),
  )
}

const turn = (grid: Rgb[][]) =>
  grid.map((row, r) => row.map((_, c) => grid[grid.length - 1 - c][r]))

describe('repeated face shots', () => {
  it('measures a face against itself as zero, however it is turned', () => {
    const a = face(5, 1)
    expect(faceDistance(a, a)).toBe(0)
    expect(faceDistance(a, turn(turn(a)))).toBe(0)
    expect(faceDistance(a, face(5, 2))).toBeGreaterThan(40)
  })

  it('finds a face shot twice on an odd cube', () => {
    const a = face(5, 1)
    const faces = [a, face(5, 2), face(5, 3), face(5, 4), face(5, 5), a].map(
      (grid, i) => (i === 5 ? face(5, 1, 6) : grid),
    )
    expect(findRepeatShots(faces)).toEqual([[0, 5]])
  })

  it('finds nothing among distinct faces', () => {
    const faces = [1, 2, 3, 4, 5, 6].map((seed) => face(5, seed))
    expect(findRepeatShots(faces)).toEqual([])
  })

  it('ignores missing faces', () => {
    const faces = [face(3, 1), undefined, face(3, 1), undefined]
    expect(findRepeatShots(faces)).toEqual([[0, 2]])
  })

  it('never calls two faces of an even cube a repeat: twins are legitimate', () => {
    const a = face(4, 1)
    expect(findRepeatShots([a, a, undefined])).toEqual([])
    const b = face(2, 1)
    expect(findRepeatShots([b, b, undefined])).toEqual([])
  })
})

describe('learning colors from a set with a repeated face', () => {
  it('skips the learned palette on an odd cube when a face was shot twice', async () => {
    const { classifyAcrossFaces } = await import(
      '../src/client/capture/captureRecalibration'
    )
    const detection = (seed: number) => {
      const cellColors = face(3, seed)
      return {
        colors: cellColors.map((row) => row.map(() => 'W')),
        confidence: 0.9,
        cellConfidences: cellColors.map((row) => row.map(() => 0.9)),
        cellColors,
      }
    }
    const distinct = Object.fromEntries(
      ['u', 'r', 'f', 'd', 'l', 'b'].map((k, i) => [k, detection(i + 1)]),
    )
    const repeated = { ...distinct, l: detection(4) }
    expect(classifyAcrossFaces(repeated).applied).toBe(false)
    expect(classifyAcrossFaces(repeated).glare).toEqual([])
  })
})

describe('the saved capture with a repeated face', () => {
  it('finds the second shot of the blue face in slot L', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const meta = JSON.parse(
      readFileSync(
        join(__dirname, 'fixtures/cube-5x5-2026-10-26T00-18-58/meta.json'),
        'utf8',
      ),
    ) as { faces: Record<string, { readings: number[][] }> }
    const faces = ['u', 'r', 'f', 'd', 'l', 'b'].map((key) => {
      const { readings } = meta.faces[key]
      return Array.from({ length: 5 }, (_, r) =>
        readings.slice(r * 5, r * 5 + 5).map(([r, g, b]) => ({ r, g, b })),
      )
    })
    expect(findRepeatShots(faces)).toEqual([[3, 4]])
  })
})

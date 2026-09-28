import { describe, expect, it } from 'vitest'
import { computeColorStats } from '../src/client/colorStats'

describe('capture color stats', () => {
  it('counts each color against the stickers expected per color', () => {
    const face = (color: string) => ({
      colors: [
        [color, color],
        [color, color],
      ],
    })
    const stats = computeColorStats(
      { U: face('W'), R: face('R'), F: face('G'), D: face('Y'), L: face('O') },
      2,
    )
    expect(stats.W).toMatchObject({ count: 4, expected: 4, hue: null })
    expect(stats.B.count).toBe(0)
  })

  it('flags colors whose measured hues overlap', () => {
    const red = { r: 200, g: 40, b: 40 }
    const orange = { r: 230, g: 90, b: 30 }
    const stats = computeColorStats(
      {
        U: {
          colors: [['R', 'O']],
          cellColors: [[red, orange]],
        },
        R: {
          colors: [['R', 'O']],
          cellColors: [[orange, red]],
        },
      },
      1,
    )
    expect(stats.R.hueOverlapsWith).toEqual(['O'])
    expect(stats.O.hueOverlapsWith).toEqual(['R'])
    expect(stats.R.lightness).not.toBeNull()
  })
})

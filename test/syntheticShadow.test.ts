import { describe, expect, it } from 'vitest'
import {
  renderFace,
  type SyntheticOptions,
} from '../src/client/vision/syntheticFace'

const SIZE = 240
const N = 9
const white = Array.from({ length: N }, () => Array<string>(N).fill('W'))
const MARGIN = Math.round(SIZE * 0.035)
const CELL = (SIZE - 2 * MARGIN) / N

// How much each sticker center is dimmed by the shadow, as a share of
// the unshadowed light, row by row: 1 is untouched, 0.85 is 15 percent dimmer.
function dimming(preset: string, options: SyntheticOptions) {
  const clean = renderFace(white, 'clean', 1, SIZE)
  const shadow = renderFace(white, preset, 1, SIZE, options)
  const ratios: number[][] = []
  for (let row = 0; row < N; row++) {
    ratios.push([])
    for (let col = 0; col < N; col++) {
      const x = Math.floor(MARGIN + (col + 0.5) * CELL)
      const y = Math.floor(MARGIN + (row + 0.5) * CELL)
      const i = (y * SIZE + x) * 4
      ratios[row].push(shadow[i] / clean[i])
    }
  }
  return ratios
}
const flat = (ratios: number[][]) => ratios.flat()
const darkest = (ratios: number[][]) => Math.min(...flat(ratios))

describe('the shadow', () => {
  it('dims by the given strength, 15 percent by default', () => {
    expect(darkest(dimming('shadow', {}))).toBeCloseTo(0.85, 1)
    for (const strength of [0.2, 0.25, 0.3])
      expect(
        darkest(dimming('shadow', { shadow: { strength } })),
        `strength ${strength}`,
      ).toBeCloseTo(1 - strength, 1)
  })

  it('has four shapes, each dark in its own place', () => {
    const at = (ratios: number[][], row: number, col: number) =>
      ratios[row][col]
    const strong = { strength: 0.4, softness: 0.03 }
    // A band across the diagonal: the middle is dark, both corners are not.
    const band = dimming('shadow', { shadow: { ...strong, shape: 'band' } })
    expect(at(band, 4, 4)).toBeLessThan(0.7)
    expect(at(band, 0, 0)).toBeGreaterThan(0.97)
    expect(at(band, 8, 8)).toBeGreaterThan(0.97)
    // Half the face: the lower right is dark, the upper left is not.
    const half = dimming('shadow', { shadow: { ...strong, shape: 'half' } })
    expect(at(half, 8, 8)).toBeLessThan(0.7)
    // Its edge runs through the middle of the face: the middle sticker is
    // dimmed by half the strength.
    const middle = dimming('shadow', {
      shadow: { shape: 'half', strength: 0.4, softness: 0.2 },
    })
    expect(at(middle, 4, 4)).toBeGreaterThan(0.75)
    expect(at(middle, 4, 4)).toBeLessThan(0.85)
    expect(at(half, 0, 0)).toBeGreaterThan(0.97)
    // A spot toward the upper right.
    const spot = dimming('shadow', { shadow: { ...strong, shape: 'spot' } })
    expect(at(spot, 3, 6)).toBeLessThan(0.7)
    expect(at(spot, 8, 0)).toBeGreaterThan(0.97)
    expect(at(spot, 0, 0)).toBeGreaterThan(0.97)
    // A corner: dark toward the lower right.
    const corner = dimming('shadow', { shadow: { ...strong, shape: 'corner' } })
    expect(at(corner, 8, 8)).toBeLessThan(0.7)
    expect(at(corner, 0, 0)).toBeGreaterThan(0.97)
  })

  it('has a harder or softer edge', () => {
    // Stickers in the edge: neither untouched nor fully dimmed.
    const inEdge = (softness: number) => {
      const ratios = flat(
        dimming('shadow', {
          shadow: { shape: 'half', strength: 0.4, softness },
        }),
      )
      return ratios.filter((r) => r > 0.62 && r < 0.98).length
    }
    expect(inEdge(0.3)).toBeGreaterThan(inEdge(0.02) + 8)
  })

  it('applies to any preset when given, once for the shadow preset', () => {
    const options = { shadow: { shape: 'half', strength: 0.3 } }
    expect(darkest(dimming('clean', options))).toBeCloseTo(0.7, 1)
    expect(darkest(dimming('shadow', options))).toBeCloseTo(0.7, 1)
    expect(darkest(dimming('clean', {}))).toBeCloseTo(1, 2)
  })

  it('rejects an unknown shape', () => {
    expect(() =>
      renderFace(white, 'shadow', 1, 64, { shadow: { shape: 'ring' } }),
    ).toThrow(/shadow shape/i)
  })
})

import { describe, expect, it } from 'vitest'
import {
  hueAxis,
  hueScatter,
  colorDelta,
  meansByLabel,
  NEUTRAL_CHROMA,
} from '../src/client/capture/hueScatter'
import { rgbToOKLCH } from '../src/client/vision/colorMath'

const rgb = (r: number, g: number, b: number) => ({ r, g, b })

describe('the hue scatter', () => {
  it('cuts the hue circle between blue and red, so red is not split', () => {
    // Deep reds sit on both sides of 0 degrees; all stay before orange.
    expect(hueAxis(359.9)).toBeLessThan(hueAxis(0.3))
    expect(hueAxis(0.3)).toBeLessThan(hueAxis(25))
    expect(hueAxis(25)).toBeLessThan(hueAxis(40))
    expect(hueAxis(264)).toBeGreaterThan(hueAxis(145))
    for (const hue of [0, 90, 180, 270, 339.9, 340, 359.9]) {
      expect(hueAxis(hue)).toBeGreaterThanOrEqual(0)
      expect(hueAxis(hue)).toBeLessThan(360)
    }
  })

  it('has one point per sticker, with its lightness and final color', () => {
    const red = rgb(200, 30, 40)
    const points = hueScatter([
      { rgb: red, label: 'O' },
      { rgb: rgb(245, 245, 240), label: 'W' },
    ])
    expect(points).toHaveLength(2)
    expect(points[0].label).toBe('O')
    expect(points[0].l).toBeCloseTo(rgbToOKLCH(red).l, 10)
    expect(points[0].neutral).toBe(false)
    expect(points[0].hue).toBeCloseTo(hueAxis(rgbToOKLCH(red).h), 10)
  })

  it('draws the line between gray and colored where production stops trusting hue', () => {
    expect(NEUTRAL_CHROMA).toBe(0.07)
  })

  it('carries the sticker chroma, so a washed-out color can look washed out', () => {
    const vivid = rgb(200, 30, 40)
    const dull = rgb(150, 110, 115)
    const [a, b] = hueScatter([
      { rgb: vivid, label: 'R' },
      { rgb: dull, label: 'R' },
    ])
    expect(a.chroma).toBeCloseTo(rgbToOKLCH(vivid).c, 10)
    expect(a.chroma).toBeGreaterThan(b.chroma)
  })

  it('flags a sticker that sits with another color than its own', () => {
    const orange = (g: number) => rgb(235, g, 40)
    const red = (g: number) => rgb(190, g, 45)
    const points = hueScatter([
      ...[100, 105, 110, 115, 120, 125].map((g) => ({
        rgb: orange(g),
        label: 'O',
      })),
      ...[20, 25, 30, 35, 40, 45].map((g) => ({ rgb: red(g), label: 'R' })),
      // Orange in the picture, red in the final colors.
      { rgb: orange(112), label: 'R' },
    ])
    expect(points.map((p) => p.misplaced)).toEqual([
      ...Array(12).fill(false),
      true,
    ])
  })

  it('flags a gray sticker that is not white, and a colored white', () => {
    const points = hueScatter([
      { rgb: rgb(245, 245, 240), label: 'W' },
      { rgb: rgb(128, 128, 128), label: 'R' },
      { rgb: rgb(200, 30, 40), label: 'W' },
      { rgb: rgb(190, 40, 45), label: 'R' },
    ])
    expect(points.map((p) => p.misplaced)).toEqual([false, true, true, false])
  })

  it('marks a gray as neutral and a vivid color as not', () => {
    expect(rgbToOKLCH(rgb(128, 128, 128)).c).toBeLessThan(NEUTRAL_CHROMA)
    expect(rgbToOKLCH(rgb(200, 30, 40)).c).toBeGreaterThan(NEUTRAL_CHROMA)
    const [gray] = hueScatter([{ rgb: rgb(128, 128, 128), label: 'W' }])
    expect(gray.neutral).toBe(true)
  })
})

describe('the final colors', () => {
  it('averages the stickers of each final color', () => {
    const means = meansByLabel([
      { rgb: rgb(200, 20, 30), label: 'R' },
      { rgb: rgb(220, 40, 50), label: 'R' },
      { rgb: rgb(10, 20, 200), label: 'B' },
    ])
    expect(means).toEqual({
      R: { r: 210, g: 30, b: 40 },
      B: { r: 10, g: 20, b: 200 },
    })
  })

  it('has no entry for a color without stickers', () => {
    expect(Object.keys(meansByLabel([]))).toEqual([])
  })
})

describe('the color delta', () => {
  it('is zero for the same color and symmetric otherwise', () => {
    const a = rgb(200, 30, 40)
    const b = rgb(30, 60, 200)
    expect(colorDelta(a, a)).toBe(0)
    expect(colorDelta(a, b)).toBeCloseTo(colorDelta(b, a), 10)
  })

  it('grows with the difference: a shade is small, another color is large', () => {
    const red = rgb(200, 30, 40)
    expect(colorDelta(red, rgb(205, 32, 42))).toBeLessThan(3)
    expect(colorDelta(red, rgb(30, 60, 200))).toBeGreaterThan(30)
  })
})

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

  it('puts every white in the gray column, however colorful it looks', () => {
    const [white, gray, red] = hueScatter([
      { rgb: rgb(170, 200, 250), label: 'W' },
      { rgb: rgb(128, 128, 128), label: 'R' },
      { rgb: rgb(200, 30, 40), label: 'R' },
    ])
    expect(rgbToOKLCH(rgb(170, 200, 250)).c).toBeGreaterThan(NEUTRAL_CHROMA)
    expect(white.neutral).toBe(true)
    // A dull sticker of another color has no hue to place either.
    expect(gray.neutral).toBe(true)
    expect(red.neutral).toBe(false)
  })

  describe('the whites are the least saturated stickers, as many as a color has', () => {
    // One sticker per color (a 1x1 cube): the least saturated one is white.
    const vivid = [
      { rgb: rgb(200, 30, 40), label: 'R' },
      { rgb: rgb(240, 120, 20), label: 'O' },
      { rgb: rgb(230, 210, 30), label: 'Y' },
      { rgb: rgb(20, 150, 70), label: 'G' },
      { rgb: rgb(30, 70, 200), label: 'B' },
    ]

    it('takes a tinted white that a fixed chroma limit would call a color', () => {
      const tinted = rgb(170, 200, 250)
      expect(rgbToOKLCH(tinted).c).toBeGreaterThan(NEUTRAL_CHROMA)
      const points = hueScatter([...vivid, { rgb: tinted, label: 'W' }])
      expect(points.map((p) => p.neutral)).toEqual([
        false,
        false,
        false,
        false,
        false,
        true,
      ])
    })

    it('leaves a pale yellow among the colors while a paler white is there', () => {
      const pale = rgb(192, 186, 142)
      expect(rgbToOKLCH(pale).c).toBeLessThan(NEUTRAL_CHROMA)
      const points = hueScatter([
        { rgb: pale, label: 'Y' },
        ...vivid.filter((p) => p.label !== 'Y'),
        { rgb: rgb(235, 235, 228), label: 'W' },
      ])
      expect(points[0].neutral).toBe(false)
      expect(points[5].neutral).toBe(true)
    })
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

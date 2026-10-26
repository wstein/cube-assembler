import { describe, expect, it } from 'vitest'
import {
  hueBin,
  hueHistogram,
  meansByLabel,
  NEUTRAL_CHROMA,
} from '../src/client/capture/hueHistogram'
import { rgbToOKLCH } from '../src/client/vision/colorMath'

const rgb = (r: number, g: number, b: number) => ({ r, g, b })

describe('the sticker hue histogram', () => {
  it('counts every sticker once, whites apart from the hues', () => {
    const histogram = hueHistogram(
      [
        { rgb: rgb(200, 30, 40), label: 'R' },
        { rgb: rgb(205, 35, 45), label: 'R' },
        { rgb: rgb(30, 60, 200), label: 'B' },
        { rgb: rgb(245, 245, 240), label: 'W' },
      ],
      36,
    )
    const hued = histogram.bins.flatMap((bin) => Object.values(bin))
    expect(hued.reduce((a, b) => a + b, 0)).toBe(3)
    expect(histogram.neutral).toEqual({ W: 1 })
    expect(histogram.bins).toHaveLength(36)
  })

  it('puts a sticker in the bin of its hue, labeled as the review has it', () => {
    const red = rgb(200, 30, 40)
    const histogram = hueHistogram([{ rgb: red, label: 'O' }], 36)
    const bin = hueBin(red, 36)
    expect(histogram.bins[bin]).toEqual({ O: 1 })
    expect(hueBin(rgb(30, 60, 200), 36)).not.toBe(bin)
  })

  it('treats a gray as neutral and a vivid color as not', () => {
    expect(rgbToOKLCH(rgb(128, 128, 128)).c).toBeLessThan(NEUTRAL_CHROMA)
    expect(rgbToOKLCH(rgb(200, 30, 40)).c).toBeGreaterThan(NEUTRAL_CHROMA)
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

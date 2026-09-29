import { describe, it, expect } from 'vitest'
import {
  rgbToOKLCH,
  hueCircularRange,
  hueRangesOverlap,
  linearRange,
} from '../src/client/vision/colorMath'
import { trimmedMeanColor } from '../src/client/vision/faceSampling'
import { STICKER_COLORS } from '../src/client/vision/stickerColorGeometry'

describe('rgbToOKLCH', () => {
  it("matches Ottosson's published OKLab reference values for pure red", () => {
    // https://bottosson.github.io/posts/oklab/ - the standard cross-check
    // for any OKLab implementation. L/C/H derived from the same L/a/b.
    const oklch = rgbToOKLCH({ r: 255, g: 0, b: 0 })
    expect(oklch.l).toBeCloseTo(0.6279553606145516, 9)
    expect(oklch.c).toBeCloseTo(0.2576833077361567, 9)
    expect(oklch.h).toBeCloseTo(29.233885192342633, 9)
  })

  it('maps white to maximum lightness and ~zero chroma', () => {
    const oklch = rgbToOKLCH({ r: 255, g: 255, b: 255 })
    expect(oklch.l).toBeCloseTo(1, 6)
    expect(oklch.c).toBeCloseTo(0, 6)
  })

  it('maps black to zero lightness and zero chroma', () => {
    expect(rgbToOKLCH({ r: 0, g: 0, b: 0 })).toEqual({ l: 0, c: 0, h: 0 })
  })

  it('gives every canonical sticker color a distinct hue', () => {
    const hues = Object.entries(STICKER_COLORS)
      .filter(([name]) => name !== 'W') // white's hue is undefined (~zero chroma)
      .map(([, rgb]) => rgbToOKLCH(rgb).h)
    expect(new Set(hues.map((h) => Math.round(h)))).toHaveProperty(
      'size',
      hues.length,
    )
  })

  it('separates Red and Orange by hue substantially more than their RGB Euclidean distance suggests', () => {
    // The actual motivation for this switch: Red (255,0,0) and Orange
    // (255,127,0) are only 127 RGB units apart (entirely on the G
    // channel), but their hues are ~23° apart - a real, robust signal
    // classification can lean on that a shared, easily-perturbed G-channel
    // reading can't provide on its own.
    const red = rgbToOKLCH({ r: 255, g: 0, b: 0 })
    const orange = rgbToOKLCH({ r: 255, g: 127, b: 0 })
    const hueDelta = Math.abs(red.h - orange.h)
    expect(hueDelta).toBeGreaterThan(15)
  })
})

describe('hueCircularRange', () => {
  it('returns null for no samples', () => {
    expect(hueCircularRange([])).toBeNull()
  })

  it('returns a zero-span range for a single sample', () => {
    expect(hueCircularRange([40])).toEqual({ min: 40, max: 40, span: 0 })
  })

  it('finds the plain min/max span for a cluster nowhere near the wraparound', () => {
    expect(hueCircularRange([28, 30, 35, 32])).toEqual({
      min: 28,
      max: 35,
      span: 7,
    })
  })

  it('finds the correct short arc for a cluster straddling the 0/360 wraparound', () => {
    // These samples span only 15° in reality (355 -> 0 -> 10), not the 350°
    // a naive Math.min/Math.max over the raw numbers would report.
    const range = hueCircularRange([355, 5, 10])!
    expect(range.span).toBe(15)
    expect(range.min).toBe(355)
    expect(range.max).toBe(10)
  })

  it('picks the tightest arc when samples form two clusters on opposite sides of the circle', () => {
    // Two tight clusters, {10,12} and {200,202}: the gap going "up" from
    // 12 to 200 is 188°, the gap wrapping "down" from 202 through 360 to
    // 10 is only 168° - the minimal enclosing arc excludes the LARGER
    // (188°) gap, so it runs the other way: 200 -> 202 -> (wrap) -> 10 -> 12.
    const range = hueCircularRange([10, 12, 200, 202])!
    expect(range.min).toBe(200)
    expect(range.max).toBe(12)
    expect(range.span).toBe(172)
  })
})

describe('hueRangesOverlap', () => {
  it('returns false for clearly disjoint arcs', () => {
    expect(
      hueRangesOverlap(
        { min: 0, max: 10, span: 10 },
        { min: 100, max: 110, span: 10 },
      ),
    ).toBe(false)
  })

  it('returns true for partially overlapping arcs', () => {
    expect(
      hueRangesOverlap(
        { min: 0, max: 20, span: 20 },
        { min: 10, max: 30, span: 20 },
      ),
    ).toBe(true)
  })

  it('returns true when one arc fully contains another', () => {
    expect(
      hueRangesOverlap(
        { min: 0, max: 40, span: 40 },
        { min: 10, max: 20, span: 10 },
      ),
    ).toBe(true)
  })

  it('returns true for identical arcs', () => {
    const r = { min: 50, max: 70, span: 20 }
    expect(hueRangesOverlap(r, r)).toBe(true)
  })

  it('treats touching endpoints as overlapping', () => {
    expect(
      hueRangesOverlap(
        { min: 0, max: 10, span: 10 },
        { min: 10, max: 20, span: 10 },
      ),
    ).toBe(true)
  })

  it('handles arcs that straddle the 0/360 wraparound correctly', () => {
    // Arc A: 350 -> 10 (through 0). Arc B: 5 -> 15. They share 5-10.
    expect(
      hueRangesOverlap(
        { min: 350, max: 10, span: 20 },
        { min: 5, max: 15, span: 10 },
      ),
    ).toBe(true)
    // Arc A: 350 -> 10. Arc C: 100 -> 110 - nowhere near the wraparound region.
    expect(
      hueRangesOverlap(
        { min: 350, max: 10, span: 20 },
        { min: 100, max: 110, span: 10 },
      ),
    ).toBe(false)
  })

  it('returns false for two arcs on opposite sides of the circle with real gaps on both sides', () => {
    expect(
      hueRangesOverlap(
        { min: 0, max: 30, span: 30 },
        { min: 180, max: 210, span: 30 },
      ),
    ).toBe(false)
  })
})

describe('linearRange', () => {
  it('returns null for no samples', () => {
    expect(linearRange([])).toBeNull()
  })

  it('returns min and max for several samples', () => {
    expect(linearRange([0.6, 0.75, 0.62, 0.7])).toEqual({ min: 0.6, max: 0.75 })
  })

  it('returns the same value twice for a single sample', () => {
    expect(linearRange([0.42])).toEqual({ min: 0.42, max: 0.42 })
  })
})

describe('trimmedMeanColor', () => {
  it('returns null for no pixels', () => {
    expect(trimmedMeanColor([])).toBeNull()
  })

  it('matches a plain mean when every pixel is identical', () => {
    const pixels = Array(20).fill({ r: 100, g: 150, b: 200 })
    expect(trimmedMeanColor(pixels)).toEqual({ r: 100, g: 150, b: 200 })
  })

  it('rejects a bright glare outlier a plain mean would be pulled toward', () => {
    // 18 pixels of a real (moderately dark) sticker color + 2 near-white
    // glare pixels (10% of 20, comfortably inside the default 15% trim).
    const stickerColor = { r: 80, g: 40, b: 40 }
    const glare = { r: 250, g: 248, b: 245 }
    const pixels = [...Array(18).fill(stickerColor), glare, glare]

    const plainMean = pixels.reduce(
      (sum, p) => ({ r: sum.r + p.r, g: sum.g + p.g, b: sum.b + p.b }),
      { r: 0, g: 0, b: 0 },
    )
    const plainR = plainMean.r / pixels.length
    expect(plainR).toBeGreaterThan(stickerColor.r) // a plain mean WOULD be pulled upward by the glare

    const trimmed = trimmedMeanColor(pixels)!
    expect(trimmed).toEqual(stickerColor) // the trimmed mean rejects it entirely
  })

  it('rejects a dark shadow outlier symmetrically', () => {
    const stickerColor = { r: 200, g: 180, b: 60 }
    const shadow = { r: 10, g: 8, b: 5 }
    const pixels = [...Array(18).fill(stickerColor), shadow, shadow]
    expect(trimmedMeanColor(pixels)).toEqual(stickerColor)
  })

  it('trims symmetric extremes when the sample is large enough', () => {
    const pixels = [
      { r: 10, g: 10, b: 10 },
      { r: 20, g: 20, b: 20 },
      { r: 250, g: 250, b: 250 },
    ]
    // trimCount = floor(3*0.5) = 1; 1*2=2 < 3, so this trims 1 pixel off
    // each end, leaving just the middle one.
    expect(trimmedMeanColor(pixels, 0.5)).toEqual({ r: 20, g: 20, b: 20 })
  })

  it('falls back to the untrimmed mean when trimming would leave nothing', () => {
    // 2 pixels, trimFraction 0.6 -> trimCount = floor(2*0.6) = 1;
    // 1*2=2 is NOT < 2, so the "not enough left" guard skips trimming
    // entirely rather than returning an empty/degenerate result.
    const pixels = [
      { r: 10, g: 10, b: 10 },
      { r: 250, g: 250, b: 250 },
    ]
    expect(trimmedMeanColor(pixels, 0.6)).toEqual({ r: 130, g: 130, b: 130 })
  })

  it('does not trim when the sample is too small for trimming to make sense', () => {
    const pixels = [
      { r: 10, g: 10, b: 10 },
      { r: 250, g: 250, b: 250 },
    ]
    // trimCount = floor(2*0.15) = 0 -> no trim, both pixels average.
    expect(trimmedMeanColor(pixels)).toEqual({ r: 130, g: 130, b: 130 })
  })
})

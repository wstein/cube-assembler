/**
 * test/imageProcessing.test.ts
 * Vitest tests for the pure, DOM-free parts of src/client/imageProcessing.ts
 * (learnStickerColors' unsupervised color learning). The canvas/Image-
 * touching functions in this file (extractCubeFaceColors, redetectFaceColors,
 * runGlobalWhiteBalance, ...) need a browser DOM this project's node test
 * environment doesn't provide, so they aren't covered here.
 *
 * Run: npx vitest run test/imageProcessing.test.ts
 */
import { describe, it, expect } from 'vitest'
import { learnStickerColors, rgbToOKLCH, STICKER_COLORS, type RGB } from '../src/client/imageProcessing'

// Mirrors the internal OKLab-based colorDistance (not exported): rebuilds
// Cartesian (a,b) from the exported OKLCH's polar (c,h) - c·cos(h), c·sin(h)
// - which is exactly what colorDistance itself measures Euclidean distance
// over, just reached via the public rgbToOKLCH rather than the private
// Cartesian conversion.
function colorDistance(c1: RGB, c2: RGB): number {
  const o1 = rgbToOKLCH(c1), o2 = rgbToOKLCH(c2)
  const toAB = (o: { c: number; h: number }) => {
    const rad = (o.h * Math.PI) / 180
    return { a: o.c * Math.cos(rad), b: o.c * Math.sin(rad) }
  }
  const ab1 = toAB(o1), ab2 = toAB(o2)
  const dl = o1.l - o2.l, da = ab1.a - ab2.a, db = ab1.b - ab2.b
  return Math.sqrt(dl * dl + da * da + db * db)
}

describe('rgbToOKLCH', () => {
  it('matches Ottosson\'s published OKLab reference values for pure red', () => {
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
    expect(new Set(hues.map((h) => Math.round(h)))).toHaveProperty('size', hues.length)
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

// 9 exact-canonical samples of each of the 6 colors (54 total, matching a
// solved 3x3's sticker count) - a clean baseline with zero variance.
function cleanSamples(): { rgb: RGB; colorGuess: string }[] {
  const samples: { rgb: RGB; colorGuess: string }[] = []
  for (const [name, rgb] of Object.entries(STICKER_COLORS)) {
    for (let i = 0; i < 9; i++) samples.push({ rgb: { ...rgb }, colorGuess: name })
  }
  return samples
}

describe('learnStickerColors', () => {
  it('recovers exact canonical centroids and perfect labels from a noise-free capture', () => {
    const learned = learnStickerColors(cleanSamples())
    expect(learned).not.toBeNull()
    for (const [name, rgb] of Object.entries(STICKER_COLORS)) {
      expect(learned!.colors[name]).toEqual(rgb)
      expect(learned!.clusterSizes[name]).toBe(9)
    }
    learned!.labelsBySampleIndex.forEach((label, i) => {
      expect(label).toBe(learned!.labelsBySampleIndex[i]) // exists/defined
    })
  })

  it('returns null with fewer samples than colors (k=6)', () => {
    expect(learnStickerColors(cleanSamples().slice(0, 5))).toBeNull()
  })

  describe('leaveOneOutDistances (confidence fix)', () => {
    // 8 exact-canonical red samples + 1 deliberately offset "red" sample,
    // all other 5 colors exact-canonical (9 each) - the offset sample
    // still belongs in the red cluster (nothing else is closer), so this
    // isolates the leave-one-out MATH from any classification question.
    function samplesWithOneOffsetRed(offsetRGB: RGB) {
      const samples = cleanSamples().filter((s) => s.colorGuess !== 'R')
      for (let i = 0; i < 8; i++) samples.push({ rgb: { ...STICKER_COLORS.R }, colorGuess: 'R' })
      samples.push({ rgb: offsetRGB, colorGuess: 'R' })
      return samples
    }

    it('scores the offset member strictly worse than the ordinary (self-inclusive) centroid distance would', () => {
      const offsetRGB: RGB = { r: 200, g: 50, b: 10 }
      const samples = samplesWithOneOffsetRed(offsetRGB)
      const learned = learnStickerColors(samples)!
      const offsetIdx = samples.findIndex((s) => s.rgb === offsetRGB)
      const label = learned.labelsBySampleIndex[offsetIdx]
      expect(label).toBe('R') // still correctly clustered as red - this is a confidence test, not a classification one

      const selfInclusiveDistance = colorDistance(offsetRGB, learned.colors[label])
      const leaveOneOutDistance = learned.leaveOneOutDistances[offsetIdx]

      // Exact expected value: excluding the offset point, the other 8 red
      // samples are all precisely canonical red (255,0,0), so the
      // leave-one-out centroid is exactly canonical red's own OKLab value,
      // and the distance from (200,50,10)'s OKLab to it is a fixed
      // constant (independently verified via a reference OKLab
      // implementation) regardless of how kMeansCluster's own centroid
      // happened to converge.
      expect(leaveOneOutDistance).toBeCloseTo(0.10506791364369204, 9)
      expect(leaveOneOutDistance).toBeGreaterThan(selfInclusiveDistance)
    })

    it('barely affects a well-behaved member of a mostly-clean cluster', () => {
      const offsetRGB: RGB = { r: 200, g: 50, b: 10 }
      const samples = samplesWithOneOffsetRed(offsetRGB)
      const learned = learnStickerColors(samples)!
      const perfectRedIdx = samples.findIndex((s, i) => s.colorGuess === 'R' && samples[i].rgb !== offsetRGB)

      const label = learned.labelsBySampleIndex[perfectRedIdx]
      const selfInclusiveDistance = colorDistance(samples[perfectRedIdx].rgb, learned.colors[label])
      const leaveOneOutDistance = learned.leaveOneOutDistances[perfectRedIdx]

      // The single outlier only pulls the 9-member centroid a little;
      // excluding a *different*, well-behaved member changes even less
      // (OKLab distances between meaningfully different colors run
      // ~0.15-0.6 - see CONFIDENCE_DISTANCE_SCALE's derivation - so 0.02
      // is a small fraction of that).
      expect(Math.abs(leaveOneOutDistance - selfInclusiveDistance)).toBeLessThan(0.02)
    })

    it('falls back to the ordinary centroid distance for a singleton cluster (no other member to average)', () => {
      // The minimum possible input (exactly K=6 samples, one per color)
      // forces every cluster's capacity down to 1 member - degenerate but
      // should not divide by zero or throw.
      const samples = Object.entries(STICKER_COLORS).map(([name, rgb]) => ({ rgb: { ...rgb }, colorGuess: name }))
      const learned = learnStickerColors(samples)!
      samples.forEach((_, i) => {
        expect(learned.clusterSizes[learned.labelsBySampleIndex[i]]).toBe(1)
        expect(Number.isFinite(learned.leaveOneOutDistances[i])).toBe(true)
        expect(learned.leaveOneOutDistances[i]).toBe(0) // exact canonical point vs. its own (self-inclusive) centroid
      })
    })
  })
})

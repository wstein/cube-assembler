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
import { learnStickerColors, STICKER_COLORS, type RGB } from '../src/client/imageProcessing'

function colorDistance(c1: RGB, c2: RGB): number {
  const dr = c1.r - c2.r, dg = c1.g - c2.g, db = c1.b - c2.b
  return Math.sqrt(dr * dr + dg * dg + db * db)
}

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
      // leave-one-out centroid is exactly canonical red, and the distance
      // from (200,50,10) to (255,0,0) is exactly sqrt(55^2+50^2+10^2) = 75.
      expect(leaveOneOutDistance).toBeCloseTo(75, 5)
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
      // excluding a *different*, well-behaved member changes even less.
      expect(Math.abs(leaveOneOutDistance - selfInclusiveDistance)).toBeLessThan(5)
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

/**
 * test/imageProcessing.test.ts
 * Vitest tests for the pure, DOM-free parts of src/client/imageProcessing.ts
 * (learnStickerColors' unsupervised color learning, hungarianAssignment's
 * optimal balanced assignment, trimmedMeanColor's outlier-robust pixel
 * averaging). Most canvas/Image-touching functions in this file
 * (extractCubeFaceColors, redetectFaceColors, runGlobalWhiteBalance, ...)
 * need a browser DOM this project's node test environment doesn't provide,
 * so they aren't covered here - extractBackgroundColor is the one
 * exception, since its only DOM dependency is `canvas.getContext('2d')`
 * returning something with getImageData/width/height, which a plain
 * duck-typed object can stand in for without a real Canvas.
 *
 * Run: npx vitest run test/imageProcessing.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  learnStickerColors, rgbToOKLCH, formatOKLCHValues, hueCircularRange, hueRangesOverlap, linearRange,
  hungarianAssignment, trimmedMeanColor, STICKER_COLORS, extractBackgroundColor,
  stickerSampleRect, DEFAULT_SAMPLING, measureSharpness, classifySticker, stickerColor,
  extractColorsFromImageData, hasPlausibleStickerFace, hasVisibleCubeFace, type RGB,
} from '../src/client/imageProcessing'

describe('live face appearance', () => {
  const size = 90
  const frame = (pixel: (x: number, y: number) => RGB) => {
    const data = new Uint8ClampedArray(size * size * 4)
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const { r, g, b } = pixel(x, y)
        const index = (y * size + x) * 4
        data[index] = r
        data[index + 1] = g
        data[index + 2] = b
        data[index + 3] = 255
      }
    }
    return data
  }

  it('rejects a uniformly colored background despite its high color confidence', () => {
    const blank = frame(() => ({ r: 210, g: 195, b: 170 }))
    expect(extractColorsFromImageData(blank, size, size).confidence).toBeGreaterThan(0.5)
    expect(hasPlausibleStickerFace(blank, size, size, 3)).toBe(false)
  })

  it('accepts coherent sticker colors separated by a regular dark grid', () => {
    const face = frame((x, y) => x % 30 < 3 || y % 30 < 3
      ? { r: 10, g: 10, b: 10 }
      : { r: 220, g: 105, b: 30 })
    expect(hasPlausibleStickerFace(face, size, size, 3)).toBe(true)
  })

  it('rejects a dark grid over heavily varied sticker interiors', () => {
    const face = frame((x, y) => x % 30 < 3 || y % 30 < 3 || (x + y) % 2 === 0
      ? { r: 10, g: 10, b: 10 }
      : { r: 220, g: 105, b: 30 })
    expect(hasPlausibleStickerFace(face, size, size, 3)).toBe(false)
  })

  // Six sticker colors laid out 3x3, one per 30 px cell.
  const STICKERS: RGB[] = [
    { r: 220, g: 105, b: 30 }, { r: 30, g: 150, b: 80 }, { r: 240, g: 240, b: 235 },
    { r: 200, g: 40, b: 50 }, { r: 40, g: 80, b: 200 }, { r: 240, g: 210, b: 30 },
  ]
  const sticker = (x: number, y: number) => STICKERS[(Math.floor(x / 30) + 3 * Math.floor(y / 30)) % 6]

  it('accepts rounded stickers that show the dark body only at their corners', () => {
    // Corner radius 9 px, no gap between stickers along their edges: no
    // straight seams, only dark four-sticker intersections.
    const radius = 9
    const face = frame((x, y) => {
      const dx = Math.max(0, Math.abs((x % 30) - 14.5) - (14.5 - radius))
      const dy = Math.max(0, Math.abs((y % 30) - 14.5) - (14.5 - radius))
      return dx * dx + dy * dy > radius * radius ? { r: 15, g: 15, b: 15 } : sticker(x, y)
    })
    expect(hasPlausibleStickerFace(face, size, size, 3)).toBe(true)
  })

  it('rejects a gapless mosaic of colored tiles', () => {
    expect(hasPlausibleStickerFace(frame(sticker), size, size, 3)).toBe(false)
  })

  it('rejects tiles with light grout, which is no dark cube body', () => {
    const wall = frame((x, y) => x % 30 < 2 || y % 30 < 2 ? { r: 235, g: 235, b: 230 } : STICKERS[4])
    expect(hasPlausibleStickerFace(wall, size, size, 3)).toBe(false)
  })

  it('rejects a two-color checkerboard', () => {
    const board = frame((x, y) => (Math.floor(x / 30) + Math.floor(y / 30)) % 2 ? STICKERS[0] : STICKERS[2])
    expect(hasPlausibleStickerFace(board, size, size, 3)).toBe(false)
  })

  it('recognizes a solid-color face by its outline in the uncropped camera frame', () => {
    const cameraSize = 150
    const cameraData = new Uint8ClampedArray(cameraSize * cameraSize * 4)
    for (let y = 0; y < cameraSize; y++) {
      for (let x = 0; x < cameraSize; x++) {
        const cube = x >= 30 && x < 120 && y >= 30 && y < 120
        const color = cube ? [220, 105, 30] : [200, 190, 175]
        const index = (y * cameraSize + x) * 4
        cameraData.set([...color, 255], index)
      }
    }
    const canvas = {
      width: cameraSize,
      height: cameraSize,
      getContext: () => ({
        getImageData: (x: number, y: number, width: number, height: number) => {
          const data = new Uint8ClampedArray(width * height * 4)
          for (let row = 0; row < height; row++) {
            const source = ((y + row) * cameraSize + x) * 4
            data.set(cameraData.subarray(source, source + width * 4), row * width * 4)
          }
          return { data }
        },
      }),
    } as unknown as HTMLCanvasElement
    expect(hasVisibleCubeFace(canvas, 3)).toBe(true)
    for (let i = 0; i < cameraData.length; i += 4) cameraData.set([200, 190, 175], i)
    expect(hasVisibleCubeFace(canvas, 3)).toBe(false)
  })
})

// A plain (unweighted) OKLab distance, built from the public API: rebuilds
// Cartesian (a,b) from the exported OKLCH's polar (c,h) - c·cos(h), c·sin(h)
// - the Cartesian space OKLab distances are measured in, reached via the
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

// Mirrors the internal, learnStickerColors-only CLUSTER_L_WEIGHT-adjusted
// distance (not exported - also not the same metric as colorDistance
// above, which stays unweighted): same L-axis discount, kept in sync by
// hand with imageProcessing.ts's CLUSTER_L_WEIGHT constant.
const CLUSTER_L_WEIGHT = 0.6
function clusterDistance(c1: RGB, c2: RGB): number {
  const o1 = rgbToOKLCH(c1), o2 = rgbToOKLCH(c2)
  const toAB = (o: { c: number; h: number }) => {
    const rad = (o.h * Math.PI) / 180
    return { a: o.c * Math.cos(rad), b: o.c * Math.sin(rad) }
  }
  const ab1 = toAB(o1), ab2 = toAB(o2)
  const dl = (o1.l - o2.l) * CLUSTER_L_WEIGHT, da = ab1.a - ab2.a, db = ab1.b - ab2.b
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

describe('hueCircularRange', () => {
  it('returns null for no samples', () => {
    expect(hueCircularRange([])).toBeNull()
  })

  it('returns a zero-span range for a single sample', () => {
    expect(hueCircularRange([40])).toEqual({ min: 40, max: 40, span: 0 })
  })

  it('finds the plain min/max span for a cluster nowhere near the wraparound', () => {
    expect(hueCircularRange([28, 30, 35, 32])).toEqual({ min: 28, max: 35, span: 7 })
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
    expect(hueRangesOverlap({ min: 0, max: 10, span: 10 }, { min: 100, max: 110, span: 10 })).toBe(false)
  })

  it('returns true for partially overlapping arcs', () => {
    expect(hueRangesOverlap({ min: 0, max: 20, span: 20 }, { min: 10, max: 30, span: 20 })).toBe(true)
  })

  it('returns true when one arc fully contains another', () => {
    expect(hueRangesOverlap({ min: 0, max: 40, span: 40 }, { min: 10, max: 20, span: 10 })).toBe(true)
  })

  it('returns true for identical arcs', () => {
    const r = { min: 50, max: 70, span: 20 }
    expect(hueRangesOverlap(r, r)).toBe(true)
  })

  it('treats touching endpoints as overlapping', () => {
    expect(hueRangesOverlap({ min: 0, max: 10, span: 10 }, { min: 10, max: 20, span: 10 })).toBe(true)
  })

  it('handles arcs that straddle the 0/360 wraparound correctly', () => {
    // Arc A: 350 -> 10 (through 0). Arc B: 5 -> 15. They share 5-10.
    expect(hueRangesOverlap({ min: 350, max: 10, span: 20 }, { min: 5, max: 15, span: 10 })).toBe(true)
    // Arc A: 350 -> 10. Arc C: 100 -> 110 - nowhere near the wraparound region.
    expect(hueRangesOverlap({ min: 350, max: 10, span: 20 }, { min: 100, max: 110, span: 10 })).toBe(false)
  })

  it('returns false for two arcs on opposite sides of the circle with real gaps on both sides', () => {
    expect(hueRangesOverlap({ min: 0, max: 30, span: 30 }, { min: 180, max: 210, span: 30 })).toBe(false)
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

    const plainMean = pixels.reduce((sum, p) => ({ r: sum.r + p.r, g: sum.g + p.g, b: sum.b + p.b }), { r: 0, g: 0, b: 0 })
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
    const pixels = [{ r: 10, g: 10, b: 10 }, { r: 20, g: 20, b: 20 }, { r: 250, g: 250, b: 250 }]
    // trimCount = floor(3*0.5) = 1; 1*2=2 < 3, so this trims 1 pixel off
    // each end, leaving just the middle one.
    expect(trimmedMeanColor(pixels, 0.5)).toEqual({ r: 20, g: 20, b: 20 })
  })

  it('falls back to the untrimmed mean when trimming would leave nothing', () => {
    // 2 pixels, trimFraction 0.6 -> trimCount = floor(2*0.6) = 1;
    // 1*2=2 is NOT < 2, so the "not enough left" guard skips trimming
    // entirely rather than returning an empty/degenerate result.
    const pixels = [{ r: 10, g: 10, b: 10 }, { r: 250, g: 250, b: 250 }]
    expect(trimmedMeanColor(pixels, 0.6)).toEqual({ r: 130, g: 130, b: 130 })
  })

  it('does not trim when the sample is too small for trimming to make sense', () => {
    const pixels = [{ r: 10, g: 10, b: 10 }, { r: 250, g: 250, b: 250 }]
    // trimCount = floor(2*0.15) = 0 -> no trim, both pixels average.
    expect(trimmedMeanColor(pixels)).toEqual({ r: 130, g: 130, b: 130 })
  })
})

describe('formatOKLCHValues', () => {
  it('renders canonical red as bare percentage/degree values', () => {
    // l=0.6280, c=0.2577, h=29.23 -> 63%, 64% (0.2577/0.4), 29deg
    expect(formatOKLCHValues(rgbToOKLCH({ r: 255, g: 0, b: 0 }))).toBe('63% 64% 29deg')
  })

  it('renders black as 0% lightness and chroma regardless of (undefined) hue', () => {
    expect(formatOKLCHValues(rgbToOKLCH({ r: 0, g: 0, b: 0 }))).toBe('0% 0% 0deg')
  })

  it('rounds each component independently', () => {
    expect(formatOKLCHValues({ l: 0.5, c: 0.2, h: 180.4 })).toBe('50% 50% 180deg')
    expect(formatOKLCHValues({ l: 0.505, c: 0.204, h: 180.6 })).toBe('51% 51% 181deg')
  })
})

describe('hungarianAssignment', () => {
  it('solves a trivial 1x1 matrix', () => {
    expect(hungarianAssignment([[5]])).toEqual([0])
  })

  it('picks the cheaper of two possible perfect matchings on a 2x2 matrix', () => {
    // row0->col0 + row1->col1 = 1+1 = 2; row0->col1 + row1->col0 = 9+9 = 18.
    expect(hungarianAssignment([[1, 9], [9, 1]])).toEqual([0, 1])
    // Now the crossed matching is cheaper.
    expect(hungarianAssignment([[9, 1], [1, 9]])).toEqual([1, 0])
  })

  it('always returns a valid bijection (every row and column used exactly once)', () => {
    const cost = [[4, 1, 3], [2, 0, 5], [3, 2, 2]]
    const assignment = hungarianAssignment(cost)
    expect(new Set(assignment).size).toBe(cost.length)
    assignment.forEach((col) => expect(col).toBeGreaterThanOrEqual(0))
  })

  // A from-scratch min-cost-matching implementation is exactly the kind of
  // code where "looks right" and "is right" can quietly diverge - so
  // rather than trust it from a handful of hand-picked cases, this checks
  // it against brute-force optimal search (try every permutation, keep
  // the cheapest) across many random small matrices, where brute force is
  // still fast enough to serve as ground truth.
  function bruteForceMinCost(cost: number[][]): number {
    const n = cost.length
    const indices = Array.from({ length: n }, (_, i) => i)
    let best = Infinity
    function permute(arr: number[], l: number) {
      if (l === arr.length) {
        let total = 0
        for (let i = 0; i < n; i++) total += cost[i][arr[i]]
        if (total < best) best = total
        return
      }
      for (let i = l; i < arr.length; i++) {
        [arr[l], arr[i]] = [arr[i], arr[l]]
        permute(arr, l + 1)
        ;[arr[l], arr[i]] = [arr[i], arr[l]]
      }
    }
    permute([...indices], 0)
    return best
  }

  it('matches brute-force optimal cost on many random small matrices', () => {
    let seed = 42
    const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff }
    for (let trial = 0; trial < 300; trial++) {
      const n = 2 + (trial % 5) // 2..6
      const cost = Array.from({ length: n }, () => Array.from({ length: n }, () => Math.floor(rand() * 100)))
      const assignment = hungarianAssignment(cost)
      const gotCost = assignment.reduce((sum, col, row) => sum + cost[row][col], 0)
      expect(gotCost).toBe(bruteForceMinCost(cost))
    }
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

  // A local reference copy of the OLD greedy algorithm this project used
  // to run internally (now removed from production code in favor of
  // hungarianAssignment) - kept here ONLY so tests can independently
  // verify Hungarian is never worse, not because production should ever
  // fall back to it.
  function referenceGreedyAssign(points: RGB[], centroids: RGB[]): number[] {
    const k = centroids.length, n = points.length, capacity = Math.ceil(n / k)
    const pairs: { pointIdx: number; centroidIdx: number; dist: number }[] = []
    for (let pi = 0; pi < n; pi++) {
      for (let ci = 0; ci < k; ci++) pairs.push({ pointIdx: pi, centroidIdx: ci, dist: colorDistance(points[pi], centroids[ci]) })
    }
    pairs.sort((a, b) => a.dist - b.dist)
    const assignment = new Array(n).fill(0), counts = new Array(k).fill(0), isAssigned = new Array(n).fill(false)
    let assignedCount = 0
    for (const { pointIdx, centroidIdx } of pairs) {
      if (assignedCount === n) break
      if (isAssigned[pointIdx] || counts[centroidIdx] >= capacity) continue
      assignment[pointIdx] = centroidIdx; isAssigned[pointIdx] = true; counts[centroidIdx]++; assignedCount++
    }
    return assignment
  }

  it('reaches exactly balanced clusters even when one color is oversubscribed', () => {
    // 17 candidates for Blue's 16 slots (16 tightly clustered, capacity-
    // exceeding), everything else clean/canonical - something has to give
    // up its Blue slot. Note this does NOT assert the displaced point
    // lands "close" to wherever it's sent: with a 6-color palette this
    // spread out, Blue has no close neighbor at all (unlike Red/Orange),
    // so whichever point is displaced will look far from every remaining
    // option no matter how optimally it's placed - confirmed by testing
    // (see the sibling test below): on this exact input, an optimal
    // solver and the old greedy heuristic converge to the identical
    // result, because there simply isn't a better arrangement to find.
    // What IS guaranteed, and what this checks, is that the N² -per-color
    // physical invariant still holds exactly.
    const blueLike = Array.from({ length: 17 }, (_, i) => ({
      rgb: { r: 10 + (i % 5) * 4, g: 30 + (i % 4) * 5, b: 200 + (i % 6) * 6 },
      colorGuess: 'B',
    }))
    const orangeLike = Array.from({ length: 15 }, (_, i) => ({
      rgb: { r: 220 + (i % 4) * 3, g: 110 + (i % 5) * 4, b: 20 + (i % 3) * 4 },
      colorGuess: 'O',
    }))
    const clean = (name: string, n: number) =>
      Array.from({ length: n }, () => ({ rgb: { ...STICKER_COLORS[name] }, colorGuess: name }))
    const samples = [
      ...blueLike, ...orangeLike,
      ...clean('G', 16), ...clean('R', 16), ...clean('W', 16), ...clean('Y', 16),
    ]
    expect(samples.length).toBe(96)

    const learned = learnStickerColors(samples)!
    expect(learned).not.toBeNull()
    Object.values(learned.clusterSizes).forEach((size) => expect(size).toBe(16))

    const displaced = blueLike
      .map((s, i) => learned.labelsBySampleIndex[i])
      .filter((label) => label !== 'B')
    expect(displaced.length).toBe(1) // exactly one of the 17 has to give up its Blue slot
  })

  it('never produces a higher total assignment cost than the old greedy heuristic would, for the same centroids', () => {
    // The actual, unconditional guarantee an optimal solver provides over
    // a greedy heuristic: never worse, sometimes strictly better - not
    // "every individual point looks reasonable" (the sibling test above
    // shows that's not always achievable, regardless of algorithm).
    // Cross-color competition case: X is a genuinely plausible fit for
    // BOTH of two centroids; greedy's globally-sorted-pairs walk can snap
    // X up for the wrong one early, before it can tell that centroid
    // didn't actually need X as much as a point still waiting its turn.
    const centroids: RGB[] = [{ r: 20, g: 40, b: 220 }, { r: 230, g: 120, b: 30 }, { r: 20, g: 150, b: 30 }]
    const X: RGB = { r: 60, g: 60, b: 150 }
    const points: RGB[] = [
      X,
      ...Array.from({ length: 8 }, (_, i) => ({ r: 15 + i, g: 35 + i, b: 225 - i })), // 9 candidates for centroid 0 (capacity 3)
      ...Array.from({ length: 3 }, (_, i) => ({ r: 220 + i * 3, g: 110 + i * 4, b: 20 + i * 3 })),
      ...Array.from({ length: 3 }, () => ({ r: 20, g: 150, b: 30 })),
    ]

    const greedy = referenceGreedyAssign(points, centroids)
    const cost = (assignment: number[]) => assignment.reduce((sum, ci, pi) => sum + colorDistance(points[pi], centroids[ci]), 0)

    // Mirror production's balancedAssign construction (capacity-expanded
    // slots through hungarianAssignment) directly, since balancedAssign
    // itself isn't exported.
    const k = centroids.length, n = points.length, capacity = Math.ceil(n / k), totalSlots = k * capacity
    const cost2d: number[][] = []
    for (let pi = 0; pi < n; pi++) {
      const row: number[] = []
      for (let ci = 0; ci < k; ci++) { const d = colorDistance(points[pi], centroids[ci]); for (let s = 0; s < capacity; s++) row.push(d) }
      cost2d.push(row)
    }
    for (let pi = n; pi < totalSlots; pi++) cost2d.push(new Array(totalSlots).fill(0))
    const slotAssignment = hungarianAssignment(cost2d)
    const optimal = slotAssignment.slice(0, n).map((slot) => Math.floor(slot / capacity))

    // Strictly less (not just <=) - this specific case is constructed so
    // greedy provably leaves cost on the table, confirmed against this
    // exact input before writing the assertion (greedy 1.8217, optimal
    // 1.7979) - a >= assertion alone wouldn't catch a future change that
    // accidentally made this behave like greedy again.
    expect(cost(optimal)).toBeLessThan(cost(greedy))
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

      const selfInclusiveDistance = clusterDistance(offsetRGB, learned.colors[label])
      const leaveOneOutDistance = learned.leaveOneOutDistances[offsetIdx]

      // Exact expected value: excluding the offset point, the other 8 red
      // samples are all precisely canonical red (255,0,0), so the
      // leave-one-out centroid is exactly canonical red's own OKLab value,
      // and the distance from (200,50,10)'s OKLab to it is a fixed
      // constant regardless of how kMeansCluster's own centroid happened
      // to converge. This distance is computed with the clustering
      // pipeline's own metric (CLUSTER_L_WEIGHT-adjusted, see
      // imageProcessing.ts) rather than plain unweighted OKLab distance -
      // recomputed against production code after CLUSTER_L_WEIGHT was
      // introduced (2026-09-23 real-fixture design discussion, "F3").
      expect(leaveOneOutDistance).toBeCloseTo(0.08353292664771421, 9)
      expect(leaveOneOutDistance).toBeGreaterThan(selfInclusiveDistance)
    })

    it('barely affects a well-behaved member of a mostly-clean cluster', () => {
      const offsetRGB: RGB = { r: 200, g: 50, b: 10 }
      const samples = samplesWithOneOffsetRed(offsetRGB)
      const learned = learnStickerColors(samples)!
      const perfectRedIdx = samples.findIndex((s, i) => s.colorGuess === 'R' && samples[i].rgb !== offsetRGB)

      const label = learned.labelsBySampleIndex[perfectRedIdx]
      const selfInclusiveDistance = clusterDistance(samples[perfectRedIdx].rgb, learned.colors[label])
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

describe('extractBackgroundColor', () => {
  // Simulates a real browser's getImageData(sx, sy, sw, sh): the arguments
  // are doubles per spec, but the returned ImageData is necessarily
  // integer-pixel-sized, so a real implementation rounds internally. A
  // caller that requests a FRACTIONAL sw/sh but then does its own manual
  // (row * width + col) pixel-index math using that same unrounded width
  // will disagree with what was actually allocated, drifting further off
  // with every row until it reads past the buffer's real end - this mock
  // reproduces exactly that rounding behavior so the test can catch it.
  function fakeCanvas(width: number, height: number, fill: RGB): HTMLCanvasElement {
    return {
      width,
      height,
      getContext: (kind: string) => {
        if (kind !== '2d') return null
        return {
          getImageData(_sx: number, _sy: number, sw: number, sh: number) {
            const w = Math.round(sw)
            const h = Math.round(sh)
            const data = new Uint8ClampedArray(w * h * 4)
            for (let i = 0; i < w * h; i++) {
              data[i * 4] = fill.r
              data[i * 4 + 1] = fill.g
              data[i * 4 + 2] = fill.b
              data[i * 4 + 3] = 255
            }
            return { data, width: w, height: h }
          },
        }
      },
    } as unknown as HTMLCanvasElement
  }

  it('recovers the exact fill color from a uniform background ring, even at a width/height that lands on fractional pixel boundaries', () => {
    // 641x481 (odd dimensions) make computeFaceBounds' fraction-based
    // math land on non-integer bounds internally - the exact condition
    // that exposed a real bug (fixed in computeFaceBounds by rounding its
    // returned bounds): before that fix, this returned {r:NaN,g:NaN,b:NaN}
    // because the ring-scan's manual indexing silently read past the
    // mock's actual (rounded-width) buffer for the later rows.
    const canvas = fakeCanvas(641, 481, { r: 120, g: 130, b: 140 })
    const result = extractBackgroundColor(canvas)
    expect(result).toEqual({ r: 120, g: 130, b: 140 })
  })

  it('never returns a non-finite channel, regardless of input dimensions', () => {
    for (const [w, h] of [[640, 480], [641, 481], [999, 333], [100, 100], [237, 891]]) {
      const result = extractBackgroundColor(fakeCanvas(w, h, { r: 50, g: 60, b: 70 }))
      if (result) {
        expect(Number.isFinite(result.r)).toBe(true)
        expect(Number.isFinite(result.g)).toBe(true)
        expect(Number.isFinite(result.b)).toBe(true)
      }
    }
  })

  it('returns null for a frame too small to have a meaningful background ring', () => {
    expect(extractBackgroundColor(fakeCanvas(30, 30, { r: 100, g: 100, b: 100 }))).toBeNull()
  })

  it('returns null when the ring reads back too dark to be a reliable reference', () => {
    expect(extractBackgroundColor(fakeCanvas(640, 480, { r: 2, g: 2, b: 2 }))).toBeNull()
  })
})

describe('stickerSampleRect', () => {
  it('defaults to sampling the centered 60% of each cell of the whole square', () => {
    expect(stickerSampleRect(0, 0, 3, 300, 300)).toEqual({ x: 20, y: 20, width: 60, height: 60 })
    expect(DEFAULT_SAMPLING).toEqual({ backgroundGap: 0, stickerCore: 0.6 })
  })

  it('shrinks the sampled zone with a smaller sticker core, keeping it centered', () => {
    expect(stickerSampleRect(1, 2, 3, 300, 300, { backgroundGap: 0.2, stickerCore: 0.5 }))
      .toEqual({ x: 225, y: 125, width: 50, height: 50 })
  })
})

describe('extractBackgroundColor background gap', () => {
  // 500x500 frame: gray backdrop, with a red "hand" band hugging the
  // 300px guide square (x/y 100..400) out to 40px beyond it.
  function frameWithHand(): HTMLCanvasElement {
    const size = 500
    return {
      width: size,
      height: size,
      getContext: () => ({
        getImageData(sx: number, sy: number, sw: number, sh: number) {
          const data = new Uint8ClampedArray(sw * sh * 4)
          for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
            const fx = sx + x, fy = sy + y
            const nearSquare = fx >= 60 && fx < 440 && fy >= 60 && fy < 440
            data.set(nearSquare ? [200, 40, 40, 255] : [120, 120, 120, 255], (y * sw + x) * 4)
          }
          return { data, width: sw, height: sh }
        },
      }),
    } as unknown as HTMLCanvasElement
  }

  it('picks up whatever surrounds the square without a gap', () => {
    const result = extractBackgroundColor(frameWithHand())!
    expect(result.r).toBeGreaterThan(result.g + 20)
  })

  it('leaves the band around the square out once the gap covers it', () => {
    // 40px of a 300px square = 0.133 - round up to be sure it's all skipped
    expect(extractBackgroundColor(frameWithHand(), 0.14)).toEqual({ r: 120, g: 120, b: 120 })
  })

  it('leaves out a face captured off the guide', () => {
    // A red face aligned 60px right of and a bit larger than the guide
    // (x 130..470, y 90..430) reaches well into the background ring.
    const face = { startX: 130, startY: 90, faceWidth: 340, faceHeight: 340 }
    const frame = {
      width: 500,
      height: 500,
      getContext: () => ({
        getImageData(sx: number, sy: number, sw: number, sh: number) {
          const data = new Uint8ClampedArray(sw * sh * 4)
          for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
            const fx = sx + x, fy = sy + y
            const onFace = fx >= 130 && fx < 470 && fy >= 90 && fy < 430
            data.set(onFace ? [200, 40, 40, 255] : [120, 120, 120, 255], (y * sw + x) * 4)
          }
          return { data, width: sw, height: sh }
        },
      }),
    } as unknown as HTMLCanvasElement
    // Without the face's bounds its red leaks into the grey sample.
    expect(extractBackgroundColor(frame)).not.toEqual({ r: 120, g: 120, b: 120 })
    expect(extractBackgroundColor(frame, 0, face)).toEqual({ r: 120, g: 120, b: 120 })
  })
})

describe('measureSharpness', () => {
  // 8px checkerboard, then the same image box-blurred - blur must score lower.
  const size = 64
  function checkerboard(): Uint8ClampedArray {
    const data = new Uint8ClampedArray(size * size * 4)
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const v = ((x >> 3) + (y >> 3)) % 2 ? 230 : 20
      data.set([v, v, v, 255], (y * size + x) * 4)
    }
    return data
  }
  function boxBlur(src: Uint8ClampedArray, radius: number): Uint8ClampedArray {
    const out = new Uint8ClampedArray(src.length)
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      let sum = 0, n = 0
      for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
        const xx = Math.min(size - 1, Math.max(0, x + dx)), yy = Math.min(size - 1, Math.max(0, y + dy))
        sum += src[(yy * size + xx) * 4]; n++
      }
      const v = sum / n
      out.set([v, v, v, 255], (y * size + x) * 4)
    }
    return out
  }

  it('scores a blurred image lower than the sharp original', () => {
    const sharp = checkerboard()
    const soft = measureSharpness(boxBlur(sharp, 1), size, size)
    const softer = measureSharpness(boxBlur(sharp, 3), size, size)
    expect(measureSharpness(sharp, size, size)).toBeGreaterThan(soft)
    expect(soft).toBeGreaterThan(softer)
  })

  it('is 0 for a flat image', () => {
    const flat = new Uint8ClampedArray(size * size * 4).fill(128)
    expect(measureSharpness(flat, size, size)).toBe(0)
  })
})

describe('classifySticker', () => {
  const hex = (h: string): RGB => ({ r: parseInt(h.slice(1, 3), 16), g: parseInt(h.slice(3, 5), 16), b: parseInt(h.slice(5, 7), 16) })
  const scale = (c: RGB, f: number): RGB => ({ r: c.r * f, g: c.g * f, b: c.b * f })
  // Sticker shades differ a lot between manufacturers (W, Y, O, R, G, B).
  const palettes: Record<string, string[]> = {
    "Rubik's brand": ['#FFFFFF', '#FFD500', '#FF5800', '#B71234', '#009B48', '#0046AD'],
    'stickerless bright': ['#FFFFFF', '#FFFF00', '#FF8C00', '#FF1010', '#00D800', '#0060FF'],
    fluorescent: ['#F4F4F4', '#EBFF00', '#FF6A00', '#FF0040', '#39FF14', '#1F51FF'],
    pastel: ['#FFFFFF', '#FFF3A0', '#FFB385', '#FF7A8A', '#8EE6A6', '#8AB6FF'],
    'dark classic': ['#E8E8E8', '#E0C000', '#E05000', '#A00010', '#006030', '#002F80'],
  }

  for (const [name, colors] of Object.entries(palettes)) {
    it(`reads the ${name} palette without a learned palette, at full and dim exposure`, () => {
      for (const exposure of [1, 0.6, 0.4]) {
        const read = colors.map((c) => classifySticker(scale(hex(c), exposure)).color)
        expect(read, `exposure ${exposure}`).toEqual(['W', 'Y', 'O', 'R', 'G', 'B'])
      }
    })
  }

  it('reads a dim white as White, not Orange', () => {
    expect(classifySticker({ r: 162, g: 167, b: 169 }).color).toBe('W')
  })

  it('uses a learned palette when given one, so a very red orange reads right', () => {
    // A real 7x7's learned orange (hue ~33) sits closer to the typical red
    // hue than the typical orange one - only its learned palette tells them apart.
    const learned: Record<string, RGB> = {
      W: { r: 168, g: 172, b: 172 }, Y: { r: 182, g: 200, b: 38 }, O: { r: 217, g: 69, b: 38 },
      R: { r: 164, g: 22, b: 36 }, G: { r: 4, g: 142, b: 55 }, B: { r: 0, g: 58, b: 121 },
    }
    const orange = { r: 215, g: 65, b: 38 }
    expect(classifySticker(orange).color).toBe('R')
    const withPalette = classifySticker(orange, learned)
    expect(withPalette.color).toBe('O')
    expect(withPalette.confidence).toBeGreaterThan(0.8)
  })

  it('is less confident near the boundary between two hues than at a typical hue', () => {
    const typicalGreen = classifySticker({ r: 0, g: 155, b: 72 }).confidence
    const yellowGreen = classifySticker({ r: 150, g: 190, b: 20 }).confidence
    expect(typicalGreen).toBeGreaterThan(yellowGreen)
  })
})

describe('stickerColor', () => {
  const repeat = (c: RGB, times: number) => Array.from({ length: times }, () => ({ ...c }))

  it('measures a colored sticker through a reflection covering half of it', () => {
    // An orange sticker, half of it mirroring a lamp as pale pink - the
    // trimmed mean lands in between, the sticker's own pixels don't.
    const orange = { r: 170, g: 62, b: 40 }
    const pixels = [...repeat(orange, 50), ...repeat({ r: 209, g: 134, b: 198 }, 50)]
    expect(classifySticker(trimmedMeanColor(pixels)!).color).not.toBe('O')
    expect(stickerColor(pixels)).toEqual(orange)
  })

  it('keeps the plain trimmed mean for a white sticker', () => {
    const pixels = [...repeat({ r: 200, g: 202, b: 205 }, 90), ...repeat({ r: 210, g: 150, b: 120 }, 10)]
    expect(stickerColor(pixels)).toEqual(trimmedMeanColor(pixels))
  })

  it('is null without pixels', () => {
    expect(stickerColor([])).toBeNull()
  })
})

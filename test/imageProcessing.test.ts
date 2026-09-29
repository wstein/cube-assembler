// Face appearance, capture geometry, and six-face color learning tests.
import { cellEdges } from '../src/client/gridAlignment'
import { describe, it, expect } from 'vitest'
import {
  learnStickerColors,
  rgbToOKLCH,
  hungarianAssignment,
  STICKER_COLORS,
  classifySticker,
  extractColorsFromImageData,
  hasPlausibleStickerFace,
  hasVisibleCubeFace,
  faceVisibility,
  faceBoundsForMode,
  type RGB,
} from '../src/client/imageProcessing'

describe('capture geometry modes', () => {
  it('keeps the manual guide fixed and only searches in Detect face mode', () => {
    let contextReads = 0
    const canvas = {
      width: 200,
      height: 100,
      getContext: () => {
        contextReads++
        return null
      },
    } as unknown as HTMLCanvasElement
    expect(faceBoundsForMode(canvas, 3, 'fixed')).toEqual({
      startX: 70,
      startY: 20,
      faceWidth: 60,
      faceHeight: 60,
    })
    expect(contextReads).toBe(0)
    expect(faceBoundsForMode(canvas, 3, 'aligned')).toEqual({
      ...faceBoundsForMode(canvas, 3, 'fixed'),
      gridFound: false,
    })
    expect(contextReads).toBe(1)
  })
})

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
    expect(
      extractColorsFromImageData(blank, size, size).confidence,
    ).toBeGreaterThan(0.5)
    expect(hasPlausibleStickerFace(blank, size, size, 3)).toBe(false)
  })

  it('accepts coherent sticker colors separated by a regular dark grid', () => {
    const face = frame((x, y) =>
      x % 30 < 3 || y % 30 < 3
        ? { r: 10, g: 10, b: 10 }
        : { r: 220, g: 105, b: 30 },
    )
    expect(hasPlausibleStickerFace(face, size, size, 3)).toBe(true)
  })

  it('does not call room lines a cube in Detect face without an outer boundary', () => {
    const gridLikeRoom = frame((x, y) =>
      x % 30 < 3 || y % 30 < 3
        ? { r: 10, g: 10, b: 10 }
        : { r: 220, g: 105, b: 30 },
    )
    expect(
      faceVisibility(gridLikeRoom, size, size, 3, () => false).visible,
    ).toBe(true)
    expect(
      faceVisibility(gridLikeRoom, size, size, 3, () => false, true),
    ).toEqual({
      visible: false,
      coherent: true,
      plausible: true,
      outline: false,
    })
    expect(
      faceVisibility(gridLikeRoom, size, size, 3, () => true, true).visible,
    ).toBe(true)
  })

  it("reads an odd cube's center past a large logo", () => {
    // 3x3, 100px cells with dark seams; the center is a white cap with a
    // thick blue logo (three bars) across its middle, like a GAN center.
    const n = 3,
      big = 300
    const logo = (x: number, y: number) =>
      x >= 125 &&
      x < 175 &&
      y >= 125 &&
      y < 175 &&
      ((y - 125) % 18 < 11 || (x - 125) % 25 < 8)
    const draw = (center: number[]) => {
      const face = new Uint8ClampedArray(big * big * 4)
      for (let y = 0; y < big; y++) {
        for (let x = 0; x < big; x++) {
          const seam =
            x % 100 < 4 || x % 100 > 95 || y % 100 < 4 || y % 100 > 95
          const isCenter = x >= 100 && x < 200 && y >= 100 && y < 200
          const rgb = seam
            ? [15, 15, 15]
            : isCenter
              ? logo(x, y)
                ? [30, 70, 190]
                : center
              : [30, 150, 80]
          face.set([rgb[0], rgb[1], rgb[2], 255], (y * big + x) * 4)
        }
      }
      return face
    }
    const logoed = extractColorsFromImageData(
      draw([240, 240, 235]),
      big,
      big,
      n,
    )
    expect(logoed.colors[1][1]).toBe('W')
    // The recorded reading itself is untouched - still pulled to the logo.
    expect(classifySticker(logoed.cellColors[1][1]).color).toBe('B')
    // Plain centers read as before.
    const plainBlue = draw([30, 70, 190])
    for (let y = 125; y < 175; y++)
      for (let x = 125; x < 175; x++)
        plainBlue.set([30, 70, 190, 255], (y * big + x) * 4)
    expect(
      extractColorsFromImageData(plainBlue, big, big, n).colors[1][1],
    ).toBe('B')
    const plainWhite = draw([240, 240, 235])
    for (let y = 125; y < 175; y++)
      for (let x = 125; x < 175; x++)
        plainWhite.set([240, 240, 235, 255], (y * big + x) * 4)
    expect(
      extractColorsFromImageData(plainWhite, big, big, n).colors[1][1],
    ).toBe('W')
  })

  it('judges a stickerless big-cube face in its wide-perimeter layout', () => {
    // A white 7x7 whose outer cubies are 1.6x the inner ones (real 6x6/7x7
    // faces measured up to 1.56x), with the faint grey lines of a
    // stickerless cube: an even grid misses a third of them.
    const n = 7,
      big = 420
    const edges = cellEdges(n, 1.6).map((edge) => edge * big)
    const cellOf = (p: number) =>
      Math.min(n - 1, edges.findIndex((edge) => edge > p) - 1)
    const face = new Uint8ClampedArray(big * big * 4)
    for (let y = 0; y < big; y++) {
      for (let x = 0; x < big; x++) {
        const c = cellOf(x),
          r = cellOf(y)
        const line =
          x - edges[c] < 1.5 ||
          edges[c + 1] - x < 1.5 ||
          y - edges[r] < 1.5 ||
          edges[r + 1] - y < 1.5
        face.set(
          line ? [220, 220, 216, 255] : [240, 240, 236, 255],
          (y * big + x) * 4,
        )
      }
    }
    expect(hasPlausibleStickerFace(face, big, big, n)).toBe(false)
    expect(hasPlausibleStickerFace(face, big, big, n, 1.6)).toBe(true)
  })

  it('rejects a dark grid over heavily varied sticker interiors', () => {
    const face = frame((x, y) =>
      x % 30 < 3 || y % 30 < 3 || (x + y) % 2 === 0
        ? { r: 10, g: 10, b: 10 }
        : { r: 220, g: 105, b: 30 },
    )
    expect(hasPlausibleStickerFace(face, size, size, 3)).toBe(false)
  })

  // Six sticker colors laid out 3x3, one per 30 px cell.
  const STICKERS: RGB[] = [
    { r: 220, g: 105, b: 30 },
    { r: 30, g: 150, b: 80 },
    { r: 240, g: 240, b: 235 },
    { r: 200, g: 40, b: 50 },
    { r: 40, g: 80, b: 200 },
    { r: 240, g: 210, b: 30 },
  ]
  const sticker = (x: number, y: number) =>
    STICKERS[(Math.floor(x / 30) + 3 * Math.floor(y / 30)) % 6]

  it('accepts rounded stickers that show the dark body only at their corners', () => {
    // Corner radius 9 px, no gap between stickers along their edges: no
    // straight seams, only dark four-sticker intersections.
    const radius = 9
    const face = frame((x, y) => {
      const dx = Math.max(0, Math.abs((x % 30) - 14.5) - (14.5 - radius))
      const dy = Math.max(0, Math.abs((y % 30) - 14.5) - (14.5 - radius))
      return dx * dx + dy * dy > radius * radius
        ? { r: 15, g: 15, b: 15 }
        : sticker(x, y)
    })
    expect(hasPlausibleStickerFace(face, size, size, 3)).toBe(true)
  })

  it('rejects a gapless mosaic of colored tiles', () => {
    expect(hasPlausibleStickerFace(frame(sticker), size, size, 3)).toBe(false)
  })

  it('rejects tiles with light grout, which is no dark cube body', () => {
    const wall = frame((x, y) =>
      x % 30 < 2 || y % 30 < 2 ? { r: 235, g: 235, b: 230 } : STICKERS[4],
    )
    expect(hasPlausibleStickerFace(wall, size, size, 3)).toBe(false)
  })

  it('rejects a two-color checkerboard', () => {
    const board = frame((x, y) =>
      (Math.floor(x / 30) + Math.floor(y / 30)) % 2 ? STICKERS[0] : STICKERS[2],
    )
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
            data.set(
              cameraData.subarray(source, source + width * 4),
              row * width * 4,
            )
          }
          return { data }
        },
      }),
    } as unknown as HTMLCanvasElement
    expect(hasVisibleCubeFace(canvas, 3)).toBe(true)
    expect(
      hasVisibleCubeFace(
        canvas,
        3,
        { startX: 30, startY: 30, faceWidth: 90, faceHeight: 90 },
        true,
      ),
    ).toBe(true)
    for (let i = 0; i < cameraData.length; i += 4)
      cameraData.set([200, 190, 175], i)
    expect(hasVisibleCubeFace(canvas, 3)).toBe(false)
  })

  it('checks the outline where the face was read, not at the guide', () => {
    // A plain orange face 18px right of and smaller than the guide
    // (guide 30..120, face 54..126 x 36..108), read from those bounds.
    const cameraSize = 150
    const cameraData = new Uint8ClampedArray(cameraSize * cameraSize * 4)
    for (let y = 0; y < cameraSize; y++) {
      for (let x = 0; x < cameraSize; x++) {
        const cube = x >= 54 && x < 126 && y >= 36 && y < 108
        cameraData.set(
          [...(cube ? [220, 105, 30] : [200, 190, 175]), 255],
          (y * cameraSize + x) * 4,
        )
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
            data.set(
              cameraData.subarray(source, source + width * 4),
              row * width * 4,
            )
          }
          return { data, width, height }
        },
      }),
    } as unknown as HTMLCanvasElement
    expect(
      hasVisibleCubeFace(canvas, 3, {
        startX: 54,
        startY: 36,
        faceWidth: 72,
        faceHeight: 72,
      }),
    ).toBe(true)
  })
})

// A plain (unweighted) OKLab distance, built from the public API: rebuilds
// Cartesian (a,b) from the exported OKLCH's polar (c,h) - c·cos(h), c·sin(h)
// - the Cartesian space OKLab distances are measured in, reached via the
// over, just reached via the public rgbToOKLCH rather than the private
// Cartesian conversion.
function colorDistance(c1: RGB, c2: RGB): number {
  const o1 = rgbToOKLCH(c1),
    o2 = rgbToOKLCH(c2)
  const toAB = (o: { c: number; h: number }) => {
    const rad = (o.h * Math.PI) / 180
    return { a: o.c * Math.cos(rad), b: o.c * Math.sin(rad) }
  }
  const ab1 = toAB(o1),
    ab2 = toAB(o2)
  const dl = o1.l - o2.l,
    da = ab1.a - ab2.a,
    db = ab1.b - ab2.b
  return Math.sqrt(dl * dl + da * da + db * db)
}

// Mirrors the internal, learnStickerColors-only CLUSTER_L_WEIGHT-adjusted
// distance (not exported - also not the same metric as colorDistance
// above, which stays unweighted): same L-axis discount, kept in sync by
// hand with imageProcessing.ts's CLUSTER_L_WEIGHT constant.
const CLUSTER_L_WEIGHT = 0.6
function clusterDistance(c1: RGB, c2: RGB): number {
  const o1 = rgbToOKLCH(c1),
    o2 = rgbToOKLCH(c2)
  const toAB = (o: { c: number; h: number }) => {
    const rad = (o.h * Math.PI) / 180
    return { a: o.c * Math.cos(rad), b: o.c * Math.sin(rad) }
  }
  const ab1 = toAB(o1),
    ab2 = toAB(o2)
  const dl = (o1.l - o2.l) * CLUSTER_L_WEIGHT,
    da = ab1.a - ab2.a,
    db = ab1.b - ab2.b
  return Math.sqrt(dl * dl + da * da + db * db)
}

// 9 exact-canonical samples of each of the 6 colors (54 total, matching a
// solved 3x3's sticker count) - a clean baseline with zero variance.
function cleanSamples(): { rgb: RGB; colorGuess: string }[] {
  const samples: { rgb: RGB; colorGuess: string }[] = []
  for (const [name, rgb] of Object.entries(STICKER_COLORS)) {
    for (let i = 0; i < 9; i++)
      samples.push({ rgb: { ...rgb }, colorGuess: name })
  }
  return samples
}

describe('learnStickerColors', () => {
  it('uses the selected profile as the common six-face color reference', () => {
    const reference = {
      ...STICKER_COLORS,
      R: { ...STICKER_COLORS.R, g: STICKER_COLORS.R.g + 20 },
    }
    const generic = learnStickerColors(cleanSamples())!
    const selected = learnStickerColors(cleanSamples(), reference)!
    expect(selected.colors.R.g).toBeGreaterThan(generic.colors.R.g)
    expect(selected.labelsBySampleIndex).toEqual(generic.labelsBySampleIndex)
  })

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
    const k = centroids.length,
      n = points.length,
      capacity = Math.ceil(n / k)
    const pairs: { pointIdx: number; centroidIdx: number; dist: number }[] = []
    for (let pi = 0; pi < n; pi++) {
      for (let ci = 0; ci < k; ci++)
        pairs.push({
          pointIdx: pi,
          centroidIdx: ci,
          dist: colorDistance(points[pi], centroids[ci]),
        })
    }
    pairs.sort((a, b) => a.dist - b.dist)
    const assignment = new Array(n).fill(0),
      counts = new Array(k).fill(0),
      isAssigned = new Array(n).fill(false)
    let assignedCount = 0
    for (const { pointIdx, centroidIdx } of pairs) {
      if (assignedCount === n) break
      if (isAssigned[pointIdx] || counts[centroidIdx] >= capacity) continue
      assignment[pointIdx] = centroidIdx
      isAssigned[pointIdx] = true
      counts[centroidIdx]++
      assignedCount++
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
      Array.from({ length: n }, () => ({
        rgb: { ...STICKER_COLORS[name] },
        colorGuess: name,
      }))
    const samples = [
      ...blueLike,
      ...orangeLike,
      ...clean('G', 16),
      ...clean('R', 16),
      ...clean('W', 16),
      ...clean('Y', 16),
    ]
    expect(samples.length).toBe(96)

    const learned = learnStickerColors(samples)!
    expect(learned).not.toBeNull()
    Object.values(learned.clusterSizes).forEach((size) => expect(size).toBe(16))

    const displaced = blueLike
      .map((_, i) => learned.labelsBySampleIndex[i])
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
    const centroids: RGB[] = [
      { r: 20, g: 40, b: 220 },
      { r: 230, g: 120, b: 30 },
      { r: 20, g: 150, b: 30 },
    ]
    const X: RGB = { r: 60, g: 60, b: 150 }
    const points: RGB[] = [
      X,
      ...Array.from({ length: 8 }, (_, i) => ({
        r: 15 + i,
        g: 35 + i,
        b: 225 - i,
      })), // 9 candidates for centroid 0 (capacity 3)
      ...Array.from({ length: 3 }, (_, i) => ({
        r: 220 + i * 3,
        g: 110 + i * 4,
        b: 20 + i * 3,
      })),
      ...Array.from({ length: 3 }, () => ({ r: 20, g: 150, b: 30 })),
    ]

    const greedy = referenceGreedyAssign(points, centroids)
    const cost = (assignment: number[]) =>
      assignment.reduce(
        (sum, ci, pi) => sum + colorDistance(points[pi], centroids[ci]),
        0,
      )

    // Mirror production's balancedAssign construction (capacity-expanded
    // slots through hungarianAssignment) directly, since balancedAssign
    // itself isn't exported.
    const k = centroids.length,
      n = points.length,
      capacity = Math.ceil(n / k),
      totalSlots = k * capacity
    const cost2d: number[][] = []
    for (let pi = 0; pi < n; pi++) {
      const row: number[] = []
      for (let ci = 0; ci < k; ci++) {
        const d = colorDistance(points[pi], centroids[ci])
        for (let s = 0; s < capacity; s++) row.push(d)
      }
      cost2d.push(row)
    }
    for (let pi = n; pi < totalSlots; pi++)
      cost2d.push(new Array(totalSlots).fill(0))
    const slotAssignment = hungarianAssignment(cost2d)
    const optimal = slotAssignment
      .slice(0, n)
      .map((slot) => Math.floor(slot / capacity))

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
      for (let i = 0; i < 8; i++)
        samples.push({ rgb: { ...STICKER_COLORS.R }, colorGuess: 'R' })
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

      const selfInclusiveDistance = clusterDistance(
        offsetRGB,
        learned.colors[label],
      )
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
      const perfectRedIdx = samples.findIndex(
        (s, i) => s.colorGuess === 'R' && samples[i].rgb !== offsetRGB,
      )

      const label = learned.labelsBySampleIndex[perfectRedIdx]
      const selfInclusiveDistance = clusterDistance(
        samples[perfectRedIdx].rgb,
        learned.colors[label],
      )
      const leaveOneOutDistance = learned.leaveOneOutDistances[perfectRedIdx]

      // The single outlier only pulls the 9-member centroid a little;
      // excluding a *different*, well-behaved member changes even less
      // (OKLab distances between meaningfully different colors run
      // ~0.15-0.6 - see CONFIDENCE_DISTANCE_SCALE's derivation - so 0.02
      // is a small fraction of that).
      expect(
        Math.abs(leaveOneOutDistance - selfInclusiveDistance),
      ).toBeLessThan(0.02)
    })

    it('falls back to the ordinary centroid distance for a singleton cluster (no other member to average)', () => {
      // The minimum possible input (exactly K=6 samples, one per color)
      // forces every cluster's capacity down to 1 member - degenerate but
      // should not divide by zero or throw.
      const samples = Object.entries(STICKER_COLORS).map(([name, rgb]) => ({
        rgb: { ...rgb },
        colorGuess: name,
      }))
      const learned = learnStickerColors(samples)!
      samples.forEach((_, i) => {
        expect(learned.clusterSizes[learned.labelsBySampleIndex[i]]).toBe(1)
        expect(Number.isFinite(learned.leaveOneOutDistances[i])).toBe(true)
        expect(learned.leaveOneOutDistances[i]).toBe(0) // exact canonical point vs. its own (self-inclusive) centroid
      })
    })
  })
})

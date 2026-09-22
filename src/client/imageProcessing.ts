// Image processing utilities for cube face detection and color extraction

export interface ColorDetectionResult {
  colors: string[][]
  confidence: number
  cellConfidences: number[][]
  cellColors: RGB[][]
}

export interface RGB {
  r: number
  g: number
  b: number
}

// Fraction of each sticker cell actually sampled, centered — the rest is a
// dead zone the color/edge detectors ignore. Exported so the UI can draw
// the same boundary the detector actually uses, instead of implying the
// whole cell is being read.
export const SAMPLE_CORE_FRACTION = 0.6

// Standard cube sticker colors (WCA compliant)
export const STICKER_COLORS: Record<string, RGB> = {
  W: { r: 255, g: 255, b: 255 }, // White
  Y: { r: 255, g: 255, b: 0 },   // Yellow
  O: { r: 255, g: 127, b: 0 },   // Orange
  R: { r: 255, g: 0, b: 0 },     // Red
  G: { r: 0, g: 128, b: 0 },     // Green
  B: { r: 0, g: 0, b: 255 },     // Blue
}

// ─────────────────────────────────────────────────────────────────────────────
// OKLCH color space
//
// Sticker classification measures "closeness" in OKLCH (Björn Ottosson's
// perceptually-uniform Oklab, in its polar Lightness/Chroma/Hue form - the
// same space CSS's oklch() uses), not raw sRGB. Plain RGB Euclidean
// distance is a poor stand-in for how different two colors actually look:
// canonical Red (255,0,0) and Orange (255,127,0) sit only 127 units apart,
// entirely on the G channel - a modest lighting- or camera-driven G shift
// is enough to flip which one a sample reads as closer to. OKLCH separates
// hue from lightness/chroma explicitly, which is the property that
// actually distinguishes Red from Orange perceptually.
//
// Distance is computed in Oklab's Cartesian (L,a,b) form, not polar
// (L,C,h): they're the same space (a = C·cos h, b = C·sin h), but
// Cartesian Euclidean distance avoids the circular-wraparound edge case
// hue angles have at 0°/360° that a naive |h1-h2| would need special
// handling for.
// ─────────────────────────────────────────────────────────────────────────────

export interface OKLCH {
  l: number // lightness, 0-1
  c: number // chroma, unbounded (~0-0.4 for in-gamut sRGB)
  h: number // hue, degrees, 0-360
}

type Oklab = { l: number; a: number; b: number }

function srgbChannelToLinear(c: number): number {
  const v = c / 255
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
}

// Internal Cartesian form - what colorDistance actually computes in.
// Matrices per Ottosson's OKLab reference (https://bottosson.github.io/posts/oklab/).
function rgbToOklab(rgb: RGB): Oklab {
  const r = srgbChannelToLinear(rgb.r)
  const g = srgbChannelToLinear(rgb.g)
  const b = srgbChannelToLinear(rgb.b)

  const l_ = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m_ = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s_ = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)

  return {
    l: 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_,
  }
}

function linearChannelToSrgb(v: number): number {
  const clamped = Math.max(0, Math.min(1, v))
  const encoded = clamped <= 0.0031308 ? clamped * 12.92 : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055
  return Math.max(0, Math.min(255, Math.round(encoded * 255)))
}

// Inverse of rgbToOklab - needed because k-means averages cluster members
// in this same OKLab space (see kMeansCluster) rather than in RGB, so each
// updated centroid has to be converted back to RGB for display/storage.
// Matrices per Ottosson's OKLab reference (the exact inverse of the ones
// rgbToOklab uses).
function oklabToRgb(lab: Oklab): RGB {
  const l_ = lab.l + 0.3963377774 * lab.a + 0.2158037573 * lab.b
  const m_ = lab.l - 0.1055613458 * lab.a - 0.0638541728 * lab.b
  const s_ = lab.l - 0.0894841775 * lab.a - 1.2914855480 * lab.b

  const l = l_ * l_ * l_
  const m = m_ * m_ * m_
  const s = s_ * s_ * s_

  return {
    r: linearChannelToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: linearChannelToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: linearChannelToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s),
  }
}

export function rgbToOKLCH(rgb: RGB): OKLCH {
  const { l, a, b } = rgbToOklab(rgb)
  const c = Math.sqrt(a * a + b * b)
  const hRad = Math.atan2(b, a)
  const h = hRad < 0 ? (hRad * 180) / Math.PI + 360 : (hRad * 180) / Math.PI
  return { l, c, h }
}

function oklabDistance(o1: Oklab, o2: Oklab): number {
  const dl = o1.l - o2.l
  const da = o1.a - o2.a
  const db = o1.b - o2.b
  return Math.sqrt(dl * dl + da * da + db * db)
}

function colorDistance(c1: RGB, c2: RGB): number {
  return oklabDistance(rgbToOklab(c1), rgbToOklab(c2))
}

// Calibration for turning an OKLab colorDistance into a 0-1 confidence
// score (see cellConfidence below): the closest pair of the 6 canonical
// colors (Red-Orange) sits ~0.15 apart in this space, and the farthest
// (White-Blue) ~0.63 apart. 0.4 sits between those, so a sample right on
// the Red/Orange boundary reads as a moderate-but-flagged confidence
// rather than a false "high confidence", while a sample nowhere near its
// assigned color reads as ~0.
const CONFIDENCE_DISTANCE_SCALE = 0.4

function closestSticker(color: RGB): string {
  let closest = 'W'
  let minDist = Infinity

  for (const [stickerColor, stickerRGB] of Object.entries(STICKER_COLORS)) {
    const dist = colorDistance(color, stickerRGB)
    if (dist < minDist) {
      minDist = dist
      closest = stickerColor
    }
  }

  return closest
}

// ─────────────────────────────────────────────────────────────────────────────
// White balance
//
// A per-channel multiplicative gain {r,g,b} applied to sampled RGB before
// classification. This is a simple diagonal (von Kries-style) correction —
// no cross-channel terms, no offset — matching the level of the rest of
// this file's hand-rolled, dependency-free approach.
// ─────────────────────────────────────────────────────────────────────────────

export const NEUTRAL_GAINS: RGB = { r: 1, g: 1, b: 1 }

// Rough, uncalibrated presets (roughly matching typical camera WB presets).
// "auto" is not a fixed gain — callers should use estimateGrayWorldGains()
// instead when in auto mode.
export const WHITE_BALANCE_PRESETS: Record<string, RGB> = {
  daylight: { r: 1, g: 1, b: 1 },
  cloudy: { r: 0.95, g: 1, b: 1.1 },
  tungsten: { r: 0.8, g: 0.95, b: 1.25 },
  fluorescent: { r: 1.05, g: 0.92, b: 1.05 },
}

export function applyGains(rgb: RGB, gains: RGB): RGB {
  return {
    r: Math.max(0, Math.min(255, Math.round(rgb.r * gains.r))),
    g: Math.max(0, Math.min(255, Math.round(rgb.g * gains.g))),
    b: Math.max(0, Math.min(255, Math.round(rgb.b * gains.b))),
  }
}

export interface LightSourceEstimate {
  gains: RGB
  lightSource: string
}

// Gray-world white balance: assumes the average color of a real scene
// tends toward neutral gray, so pushes the frame's average RGB back toward
// gray and reports the correction as per-channel gains. This is only run
// over the guide-square region (mostly cube + hand, not the whole frame),
// so it's a coarse approximation, not a true illuminant measurement — it
// has no way to know the cube's stickers aren't gray to begin with. Good
// enough to suggest a light-source label and a starting-point correction;
// the post-capture sticker-based recalibration (learnStickerColors) is
// what actually uses knowledge of the cube's real colors.
export function estimateGrayWorldGains(canvas: HTMLCanvasElement): LightSourceEstimate | null {
  const { imageData, faceWidth, faceHeight } = getFaceRegion(canvas)
  if (faceWidth < 20 || faceHeight < 20) return null

  const data = imageData.data
  let sumR = 0, sumG = 0, sumB = 0
  const pixelCount = faceWidth * faceHeight

  for (let i = 0; i < data.length; i += 4) {
    sumR += data[i]
    sumG += data[i + 1]
    sumB += data[i + 2]
  }

  const avgR = sumR / pixelCount
  const avgG = sumG / pixelCount
  const avgB = sumB / pixelCount
  const gray = (avgR + avgG + avgB) / 3
  if (gray < 5) return null // too dark to estimate meaningfully

  // Clamp gains to a sane range so a single stray bright/dark frame can't
  // produce an extreme correction.
  const clampGain = (g: number) => Math.max(0.6, Math.min(1.8, g))
  const gains: RGB = {
    r: clampGain(gray / avgR),
    g: clampGain(gray / avgG),
    b: clampGain(gray / avgB),
  }

  // Classify the cast direction the gains are correcting FOR, i.e. what the
  // light probably was: if we had to boost blue and cut red, the scene was
  // warm (tungsten-like); if we boosted red/green and cut blue, the scene
  // was cool (shade/cloudy-like); a green boost/cut alone suggests
  // fluorescent's characteristic green spike.
  const warmth = gains.b - gains.r // >0: scene was warm, needed cooling
  const greenCast = gains.g - (gains.r + gains.b) / 2
  let lightSource = 'Neutral (daylight-like)'
  if (Math.abs(greenCast) > 0.12 && Math.abs(greenCast) > Math.abs(warmth)) {
    lightSource = greenCast > 0 ? 'Fluorescent (green cast)' : 'Magenta cast'
  } else if (warmth > 0.1) {
    lightSource = 'Warm (incandescent/tungsten-like)'
  } else if (warmth < -0.1) {
    lightSource = 'Cool (shade/cloudy-like)'
  }

  return { gains, lightSource }
}

export interface StickerSample {
  rgb: RGB
  colorGuess: string
}

// k-means (Lloyd's algorithm), fixed k, over raw RGB points. Deterministic:
// seeds centroids by sorting points along their dominant spread axis and
// picking k evenly-spaced ones, rather than random init, so results are
// reproducible for the same capture.
// Assigns each point to exactly one of `centroids`, enforcing that every
// centroid receives (as close as possible to, and exactly when n divides
// evenly by k) points.length / centroids.length points — the hard
// constraint that a valid NxN cube capture always has exactly N^2
// stickers of each of the 6 colors. Greedy: sort every (point, centroid)
// pairing by distance ascending, then walk that list assigning each point
// to the nearest centroid that still has room, skipping pairs whose point
// is already assigned or whose centroid is already full.
//
// This is a well-known good heuristic for balanced/capacitated clustering
// — not necessarily the global optimum (that's a harder transportation-
// problem solve), but far better than unconstrained nearest-centroid.
// Unconstrained assignment has no way to know a nearby cluster is already
// "full": on a real capture, 3 green stickers were pulled into the orange
// cluster because they were (slightly) closer to orange's centroid than
// to green's, even though orange had already claimed its fair share of 9
// and green hadn't — the assignment had no mechanism to prefer the
// correct-but-slightly-farther cluster once green's own points ran out.
function balancedAssign(points: RGB[], centroids: RGB[]): number[] {
  const k = centroids.length
  const n = points.length
  const capacity = Math.ceil(n / k)

  const pairs: { pointIdx: number; centroidIdx: number; dist: number }[] = []
  for (let pi = 0; pi < n; pi++) {
    for (let ci = 0; ci < k; ci++) {
      pairs.push({ pointIdx: pi, centroidIdx: ci, dist: colorDistance(points[pi], centroids[ci]) })
    }
  }
  pairs.sort((a, b) => a.dist - b.dist)

  const assignment = new Array(n).fill(0)
  const counts = new Array(k).fill(0)
  const isAssigned = new Array(n).fill(false)
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

function kMeansCluster(points: RGB[], k: number, iterations = 20): RGB[] {
  // Deterministic farthest-point seeding: start from the first point, then
  // repeatedly add whichever remaining point has the largest distance to
  // its NEAREST already-chosen centroid. This reliably spreads initial
  // centroids across distinct clusters even when real colors are
  // well-separated corners of RGB space.
  //
  // A first version seeded by sorting all points along whichever single
  // channel had the widest spread and picking k evenly-spaced points from
  // that order. That silently breaks when two different colors tie on
  // that one axis: green (0,128,0) and blue (0,0,255) both have r=0, so
  // sorting by r leaves them adjacent regardless of how different they
  // actually are — confirmed by testing on a perfectly clean (zero-noise,
  // zero-cast) synthetic capture, which should trivially cluster into 6
  // exact corners but instead produced two 0-member clusters and one
  // 26-member cluster the axis-sort seeding couldn't recover from.
  let centroids: RGB[] = points.length > 0 ? [points[0]] : []
  while (centroids.length < k && centroids.length < points.length) {
    let farthest = points[0]
    let farthestMinDist = -1
    for (const p of points) {
      let minDist = Infinity
      for (const c of centroids) minDist = Math.min(minDist, colorDistance(p, c))
      if (minDist > farthestMinDist) { farthestMinDist = minDist; farthest = p }
    }
    centroids.push(farthest)
  }

  for (let iter = 0; iter < iterations; iter++) {
    const assignment = balancedAssign(points, centroids)
    // Averaged in OKLab space, not RGB: assignment/distance both operate
    // in OKLab (colorDistance), and Lloyd's algorithm only converges
    // correctly when the centroid update minimizes the same metric the
    // assignment step used - an RGB-space mean isn't the point that
    // minimizes total OKLab distance to the cluster's members, since
    // OKLab is a nonlinear (cube-root) remapping of RGB.
    const sums = Array.from({ length: k }, () => ({ l: 0, a: 0, b: 0, count: 0 }))
    points.forEach((p, pi) => {
      const c = assignment[pi]
      const lab = rgbToOklab(p)
      sums[c].l += lab.l; sums[c].a += lab.a; sums[c].b += lab.b; sums[c].count++
    })
    centroids = centroids.map((c, i) =>
      sums[i].count > 0
        ? oklabToRgb({ l: sums[i].l / sums[i].count, a: sums[i].a / sums[i].count, b: sums[i].b / sums[i].count })
        : c // keep empty clusters where they were rather than collapsing to NaN
    )
  }

  return centroids
}

// Brute-force over all k! assignments (k=6 -> 720, trivial) to find the
// pairing of cluster centroids to canonical colors that minimizes total
// squared distance. Small enough that an exhaustive search is simpler and
// more obviously correct than an approximate matching algorithm.
function bestPermutationMatch(centroids: RGB[], canonical: RGB[]): number[] {
  const k = centroids.length
  const indices = Array.from({ length: k }, (_, i) => i)
  let bestAssignment = indices
  let bestCost = Infinity

  function permute(arr: number[], l: number) {
    if (l === arr.length) {
      let cost = 0
      for (let i = 0; i < k; i++) cost += colorDistance(centroids[i], canonical[arr[i]]) ** 2
      if (cost < bestCost) { bestCost = cost; bestAssignment = [...arr] }
      return
    }
    for (let i = l; i < arr.length; i++) {
      [arr[l], arr[i]] = [arr[i], arr[l]]
      permute(arr, l + 1)
      ;[arr[l], arr[i]] = [arr[i], arr[l]]
    }
  }
  permute([...indices], 0)

  return bestAssignment
}

export interface LearnedColors {
  colors: Record<string, RGB>
  clusterSizes: Record<string, number>
  labelsBySampleIndex: string[]
  // Each sample's distance to its assigned cluster's centroid computed
  // WITHOUT that sample (leave-one-out), not the ordinary centroid — see
  // the comment on this function's confidence handling for why.
  leaveOneOutDistances: number[]
}

// Learns each of the 6 sticker colors' actual RGB directly from the
// capture itself, using ALL captured stickers (typically all 54 across 6
// faces) as calibration data, instead of assuming the hardcoded WCA
// reference swatches (STICKER_COLORS) are what the camera+lighting
// actually produced. Every sticker is then classified by a balanced
// assignment against these learned colors (labelsBySampleIndex), not the
// hardcoded ones — the hardcoded palette is used here only to LABEL which
// cluster is which color name, never as the classification target itself.
//
// An earlier version of this instead solved for a global per-channel gain
// (observed * gain ~= canonical) and reclassified against the still-fixed
// canonical palette. Dropped after testing surfaced two real failure
// modes: (1) grouping samples by their own nearest-canonical-color guess
// is self-poisoning under a strong enough cast (the guess is already
// wrong, so the gain gets fit to the wrong target — one test pushed a
// channel's gain to 0.5 when ~4x was needed, backwards); and (2) even
// after fixing that with clustering, a color with very few captured
// stickers produces a poorly-constrained, sometimes wildly wrong gain for
// the channel that mostly distinguishes it (observed b=2.56x on a capture
// with no real color cast at all, because only 2 of 54 stickers happened
// to land in the white/blue clusters that channel depends on). Learning
// the colors directly sidesteps both: there is no reference-target
// mismatch to poison, and no gain to overshoot — each cluster centroid IS
// the learned color, so a sparse cluster just means a less-precise learned
// color, not a runaway correction applied to everything.
export function learnStickerColors(samples: StickerSample[]): LearnedColors | null {
  const points = samples.map((s) => s.rgb)
  const K = 6
  if (points.length < K) return null

  const centroids = kMeansCluster(points, K)
  const canonicalKeys = Object.keys(STICKER_COLORS)
  const canonicalList = canonicalKeys.map((k) => STICKER_COLORS[k])
  const permutation = bestPermutationMatch(centroids, canonicalList)

  // One final balanced-assignment pass against the converged centroids, so
  // every sticker's DEFINITIVE label (not just the centroid-learning
  // iterations inside kMeansCluster) also respects the exact-N-per-color
  // constraint — this is what actually gets used as each sticker's color,
  // not an independent nearest-centroid lookup per sticker, which would
  // reopen the same "one cluster steals another's points" failure this
  // whole balanced-assignment approach exists to close.
  const pointAssignment = balancedAssign(points, centroids)

  const clusterCounts = new Array(K).fill(0)
  for (const clusterIdx of pointAssignment) clusterCounts[clusterIdx]++

  const colors: Record<string, RGB> = {}
  const clusterSizes: Record<string, number> = {}
  for (let i = 0; i < K; i++) {
    const name = canonicalKeys[permutation[i]]
    colors[name] = centroids[i]
    clusterSizes[name] = clusterCounts[i]
  }

  const labelsBySampleIndex = pointAssignment.map((clusterIdx) => canonicalKeys[permutation[clusterIdx]])

  // A sample's distance to the centroid it was assigned to is a biased
  // confidence signal: the centroid IS the mean of its members, so any
  // sample — including one the capacity constraint force-assigned to the
  // "wrong" (but not-yet-full) cluster because its true cluster had
  // already hit quota — pulls that centroid slightly toward itself,
  // making itself look closer than it really is. A cluster made up
  // partly of misclassified points reads as confident about exactly the
  // points it got wrong. Leave-one-out fixes this: recompute the
  // centroid excluding the sample being scored, so it can't be flattered
  // by its own membership.
  // Summed in OKLab space to match colorDistance below, for the same
  // reason kMeansCluster's centroid update is: an RGB-space mean isn't
  // the point that minimizes OKLab distance to the cluster's members.
  const pointsOklab = points.map(rgbToOklab)
  const clusterSums = Array.from({ length: K }, () => ({ l: 0, a: 0, b: 0 }))
  pointAssignment.forEach((clusterIdx, i) => {
    clusterSums[clusterIdx].l += pointsOklab[i].l
    clusterSums[clusterIdx].a += pointsOklab[i].a
    clusterSums[clusterIdx].b += pointsOklab[i].b
  })
  const leaveOneOutDistances = points.map((point, i) => {
    const clusterIdx = pointAssignment[i]
    const count = clusterCounts[clusterIdx]
    // A singleton cluster has no "other members" to average — fall back
    // to the ordinary (self-inclusive) centroid rather than divide by 0.
    // Computed and compared directly in OKLab (never round-tripped
    // through RGB, unlike kMeansCluster's centroids): this value is only
    // ever used for a distance, so there's no reason to pay RGB's integer
    // quantization error for a value nothing else needs as an RGB.
    if (count > 1) {
      const centroidOklab: Oklab = {
        l: (clusterSums[clusterIdx].l - pointsOklab[i].l) / (count - 1),
        a: (clusterSums[clusterIdx].a - pointsOklab[i].a) / (count - 1),
        b: (clusterSums[clusterIdx].b - pointsOklab[i].b) / (count - 1),
      }
      return oklabDistance(pointsOklab[i], centroidOklab)
    }
    return colorDistance(point, centroids[clusterIdx])
  })

  return { colors, clusterSizes, labelsBySampleIndex, leaveOneOutDistances }
}

function getDominantColor(imageData: Uint8ClampedArray, start: number, width: number, height: number): RGB {
  const pixels: RGB[] = []

  for (let i = 0; i < imageData.length; i += 4) {
    const idx = i / 4
    if (idx >= start && idx < start + width * height) {
      pixels.push({
        r: imageData[i],
        g: imageData[i + 1],
        b: imageData[i + 2],
      })
    }
  }

  if (pixels.length === 0) {
    return { r: 255, g: 255, b: 255 }
  }

  const avgR = Math.round(pixels.reduce((sum, p) => sum + p.r, 0) / pixels.length)
  const avgG = Math.round(pixels.reduce((sum, p) => sum + p.g, 0) / pixels.length)
  const avgB = Math.round(pixels.reduce((sum, p) => sum + p.b, 0) / pixels.length)

  return { r: avgR, g: avgG, b: avgB }
}

interface FaceBounds {
  startX: number
  startY: number
  faceWidth: number
  faceHeight: number
}

interface FaceRegion extends FaceBounds {
  imageData: ImageData
}

// Cube face is assumed centered in frame, matching the fixed guide square
// shown to the user during capture (see capture-grid-overlay in index.tsx).
function computeFaceBounds(canvas: HTMLCanvasElement): FaceBounds {
  const width = canvas.width
  const height = canvas.height

  const centerX = width / 2
  const centerY = height / 2
  const faceSize = Math.min(width, height) * 0.6

  const startX = Math.max(0, centerX - faceSize / 2)
  const startY = Math.max(0, centerY - faceSize / 2)
  const endX = Math.min(width, startX + faceSize)
  const endY = Math.min(height, startY + faceSize)

  return {
    startX,
    startY,
    faceWidth: endX - startX,
    faceHeight: endY - startY,
  }
}

function getFaceRegion(canvas: HTMLCanvasElement): FaceRegion {
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Could not get canvas context')
  }

  const bounds = computeFaceBounds(canvas)
  return {
    ...bounds,
    imageData: ctx.getImageData(bounds.startX, bounds.startY, bounds.faceWidth, bounds.faceHeight),
  }
}

// Crops just the analyzed face region out of a captured frame, for showing
// the user what was actually sampled (e.g. in a post-capture review step) —
// independent of extractCubeFaceColors, so it costs nothing on the
// high-frequency live-preview path that doesn't need an image, only text.
export function cropFaceRegionToDataUrl(canvas: HTMLCanvasElement): string {
  const bounds = computeFaceBounds(canvas)
  const out = document.createElement('canvas')
  out.width = bounds.faceWidth
  out.height = bounds.faceHeight

  const ctx = out.getContext('2d')
  if (!ctx) {
    throw new Error('Could not get canvas context')
  }

  ctx.drawImage(
    canvas,
    bounds.startX, bounds.startY, bounds.faceWidth, bounds.faceHeight,
    0, 0, bounds.faceWidth, bounds.faceHeight
  )
  return out.toDataURL('image/jpeg', 0.85)
}

export function extractCubeFaceColors(
  canvas: HTMLCanvasElement,
  gridSize = 3,
  gains: RGB = NEUTRAL_GAINS
): ColorDetectionResult {
  const { imageData, faceWidth, faceHeight } = getFaceRegion(canvas)

  const cellWidth = faceWidth / gridSize
  const cellHeight = faceHeight / gridSize
  const data = imageData.data

  const colors: string[][] = []
  const cellConfidences: number[][] = []
  const cellColors: RGB[][] = []
  let totalConfidence = 0

  for (let row = 0; row < gridSize; row++) {
    const rowColors: string[] = []
    const rowConfidences: number[] = []
    const rowRGB: RGB[] = []
    for (let col = 0; col < gridSize; col++) {
      // Sample only the cell's core, ignoring a dead zone around its
      // border: sticker edges are where gap-line bleed, glare off the
      // plastic bezel, and slight grid misalignment are most likely to
      // contaminate the average, so those pixels are excluded rather than
      // averaged in.
      const deadZoneMargin = (1 - SAMPLE_CORE_FRACTION) / 2
      const cellStartX = Math.round(col * cellWidth + cellWidth * deadZoneMargin)
      const cellStartY = Math.round(row * cellHeight + cellHeight * deadZoneMargin)
      const cellW = Math.round(cellWidth * SAMPLE_CORE_FRACTION)
      const cellH = Math.round(cellHeight * SAMPLE_CORE_FRACTION)

      let sumR = 0, sumG = 0, sumB = 0, pixelCount = 0

      for (let y = cellStartY; y < cellStartY + cellH; y++) {
        for (let x = cellStartX; x < cellStartX + cellW; x++) {
          if (x >= 0 && x < faceWidth && y >= 0 && y < faceHeight) {
            const idx = (y * faceWidth + x) * 4
            sumR += data[idx]
            sumG += data[idx + 1]
            sumB += data[idx + 2]
            pixelCount++
          }
        }
      }

      if (pixelCount > 0) {
        const avgColor: RGB = applyGains(
          { r: sumR / pixelCount, g: sumG / pixelCount, b: sumB / pixelCount },
          gains
        )
        rowRGB.push(avgColor)
        const stickerColor = closestSticker(avgColor)
        rowColors.push(stickerColor)

        // Confidence based on OKLab color distance (0-1, higher = better match)
        const dist = colorDistance(avgColor, STICKER_COLORS[stickerColor])
        const cellConfidence = Math.max(0, 1 - dist / CONFIDENCE_DISTANCE_SCALE)
        rowConfidences.push(cellConfidence)
        totalConfidence += cellConfidence
      } else {
        rowRGB.push({ r: 255, g: 255, b: 255 })
        rowColors.push('W')
        rowConfidences.push(0)
      }
    }
    colors.push(rowColors)
    cellConfidences.push(rowConfidences)
    cellColors.push(rowRGB)
  }

  const confidence = Math.min(1, totalConfidence / (gridSize * gridSize))

  return { colors, confidence, cellConfidences, cellColors }
}

export interface FaceCaptureResult extends ColorDetectionResult {
  croppedImage: string
}

export function captureAndProcessFace(
  video: HTMLVideoElement,
  gridSize = 3,
  gains: RGB = NEUTRAL_GAINS
): FaceCaptureResult {
  const canvas = document.createElement('canvas')
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Could not get canvas context')
  }

  ctx.drawImage(video, 0, 0)
  // croppedImage is always the raw, un-gained frame — it's the source of
  // truth photo, re-analyzed independently by the post-capture global
  // white-balance pass (redetectFaceColors) regardless of what WB was
  // live/manually selected during capture.
  return { ...extractCubeFaceColors(canvas, gridSize, gains), croppedImage: cropFaceRegionToDataUrl(canvas) }
}

export function captureAndProcessImage(
  img: HTMLImageElement,
  gridSize = 3,
  gains: RGB = NEUTRAL_GAINS
): FaceCaptureResult {
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Could not get canvas context')
  }

  ctx.drawImage(img, 0, 0)
  return { ...extractCubeFaceColors(canvas, gridSize, gains), croppedImage: cropFaceRegionToDataUrl(canvas) }
}

function loadImageFromDataUrl(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not load stored face image'))
    img.src = dataUrl
  })
}

// Re-runs color classification on an already-captured face snapshot (the
// croppedImage stored at capture time) with a new set of gains — used by
// the post-capture global white-balance step to redetect every face's
// colors after computing a correction from all 6 faces' stickers together.
// Since croppedImage is already cropped to just the sample region, this
// draws it directly (no re-cropping) rather than reusing
// captureAndProcessImage, which would crop an already-cropped image.
export async function redetectFaceColors(
  croppedImageDataUrl: string,
  gridSize: number,
  gains: RGB
): Promise<ColorDetectionResult> {
  const img = await loadImageFromDataUrl(croppedImageDataUrl)
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Could not get canvas context')
  }
  ctx.drawImage(img, 0, 0)

  // extractCubeFaceColors expects to crop its own centered 60% guide-square
  // region out of a full frame, but croppedImageDataUrl IS already that
  // region — so temporarily present it as a frame where the "guide square"
  // covers the whole canvas by padding it out to ~1/0.6 of its size first.
  const pad = 1 / 0.6
  const padded = document.createElement('canvas')
  padded.width = Math.round(canvas.width * pad)
  padded.height = Math.round(canvas.height * pad)
  const pctx = padded.getContext('2d')
  if (!pctx) {
    throw new Error('Could not get canvas context')
  }
  const offsetX = (padded.width - canvas.width) / 2
  const offsetY = (padded.height - canvas.height) / 2
  pctx.drawImage(canvas, offsetX, offsetY)

  return extractCubeFaceColors(padded, gridSize, gains)
}

export interface LearnedColorClassificationResult {
  learned: LearnedColors | null
  applied: boolean
  faces: Record<string, ColorDetectionResult>
}

/**
 * Runs the full post-capture recalibration pass: redetects every face's
 * stored snapshot from scratch with neutral gains (ignoring whatever WB
 * preset/auto-estimate was live-applied during capture — that was only
 * ever a capture-time aid for the user, not something this pass should
 * inherit), learns each color's actual RGB from all 6 faces' stickers
 * together (learnStickerColors), then reclassifies every sticker against
 * those learned colors instead of the hardcoded canonical palette —
 * relabeling only, no re-extraction, since the raw per-cell RGB doesn't
 * change. Falls back to the neutral-gain/hardcoded-palette baseline
 * (`applied: false`) if there aren't enough stickers to cluster reliably.
 */
export async function runGlobalWhiteBalance(
  faceCroppedImages: Record<string, string>,
  gridSize: number
): Promise<LearnedColorClassificationResult> {
  const baselineFaces: Record<string, ColorDetectionResult> = {}
  for (const [face, dataUrl] of Object.entries(faceCroppedImages)) {
    baselineFaces[face] = await redetectFaceColors(dataUrl, gridSize, NEUTRAL_GAINS)
  }

  const samples: StickerSample[] = []
  const sampleLocations: Array<{ face: string; row: number; col: number }> = []
  for (const [face, det] of Object.entries(baselineFaces)) {
    for (let r = 0; r < det.colors.length; r++) {
      for (let c = 0; c < det.colors[r].length; c++) {
        samples.push({ rgb: det.cellColors[r][c], colorGuess: det.colors[r][c] })
        sampleLocations.push({ face, row: r, col: c })
      }
    }
  }

  const learned = learnStickerColors(samples)
  if (!learned) return { learned: null, applied: false, faces: baselineFaces }

  // Every sticker's final color/confidence comes directly from
  // learnStickerColors()'s own balanced assignment (labelsBySampleIndex),
  // not an independent per-cell nearest-centroid lookup — that would
  // reopen the "one cluster steals another's points" problem the whole
  // balanced-assignment approach exists to close.
  const reclassifiedFaces: Record<string, ColorDetectionResult> = {}
  for (const [face, det] of Object.entries(baselineFaces)) {
    reclassifiedFaces[face] = {
      colors: det.colors.map((row) => [...row]),
      cellConfidences: det.cellConfidences.map((row) => [...row]),
      cellColors: det.cellColors,
      confidence: 0,
    }
  }

  const faceTotals: Record<string, { sum: number; count: number }> = {}
  for (const face of Object.keys(baselineFaces)) faceTotals[face] = { sum: 0, count: 0 }

  samples.forEach((_, i) => {
    const { face, row, col } = sampleLocations[i]
    const label = learned.labelsBySampleIndex[i]
    const cellConfidence = Math.max(0, 1 - learned.leaveOneOutDistances[i] / CONFIDENCE_DISTANCE_SCALE)

    reclassifiedFaces[face].colors[row][col] = label
    reclassifiedFaces[face].cellConfidences[row][col] = cellConfidence
    faceTotals[face].sum += cellConfidence
    faceTotals[face].count++
  })

  for (const [face, { sum, count }] of Object.entries(faceTotals)) {
    reclassifiedFaces[face].confidence = count > 0 ? sum / count : 0
  }

  return { learned, applied: true, faces: reclassifiedFaces }
}

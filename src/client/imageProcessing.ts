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

function colorDistance(c1: RGB, c2: RGB): number {
  const dr = c1.r - c2.r
  const dg = c1.g - c2.g
  const db = c1.b - c2.b
  return Math.sqrt(dr * dr + dg * dg + db * db)
}

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
    const sums = Array.from({ length: k }, () => ({ r: 0, g: 0, b: 0, count: 0 }))
    points.forEach((p, pi) => {
      const c = assignment[pi]
      sums[c].r += p.r; sums[c].g += p.g; sums[c].b += p.b; sums[c].count++
    })
    centroids = centroids.map((c, i) =>
      sums[i].count > 0
        ? { r: sums[i].r / sums[i].count, g: sums[i].g / sums[i].count, b: sums[i].b / sums[i].count }
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
  const clusterSums = Array.from({ length: K }, () => ({ r: 0, g: 0, b: 0 }))
  pointAssignment.forEach((clusterIdx, i) => {
    clusterSums[clusterIdx].r += points[i].r
    clusterSums[clusterIdx].g += points[i].g
    clusterSums[clusterIdx].b += points[i].b
  })
  const leaveOneOutDistances = points.map((point, i) => {
    const clusterIdx = pointAssignment[i]
    const count = clusterCounts[clusterIdx]
    // A singleton cluster has no "other members" to average — fall back
    // to the ordinary (self-inclusive) centroid rather than divide by 0.
    const centroid: RGB = count > 1
      ? {
          r: (clusterSums[clusterIdx].r - point.r) / (count - 1),
          g: (clusterSums[clusterIdx].g - point.g) / (count - 1),
          b: (clusterSums[clusterIdx].b - point.b) / (count - 1),
        }
      : centroids[clusterIdx]
    return colorDistance(point, centroid)
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

// ─────────────────────────────────────────────────────────────────────────────
// Grid size auto-detection (2x2 - 7x7)
//
// Counts sticker gaps by their edges (sharp local changes in the row/column
// luminance profile), not by assuming gaps are darker than the stickers.
// A first version looked for dark valleys directly, which works for typical
// black-plastic gaps but completely fails on stickerless-style cubes where
// the gap can be the same brightness as — or even lighter than — the
// stickers themselves (27/30 misses on synthetic light-gap tests). Gradient
// magnitude catches the transition either direction, dependency-free, at no
// measured accuracy cost on the original dark-gap case (still 30/30 under
// clean/blur/noise conditions up to very heavy synthetic noise).
// This is inherently a heuristic: confidence and the minimum threshold below
// are rough starting points, not calibrated against real captures, so treat
// a detection as a suggestion to confirm, never as something to silently
// commit.
// ─────────────────────────────────────────────────────────────────────────────

export interface GridSizeDetection {
  size: number
  confidence: number
}

const MIN_GRID_SIZE = 2
const MAX_GRID_SIZE = 7

function computeLuminanceProfiles(
  imageData: ImageData,
  width: number,
  height: number
): { colProfile: number[]; rowProfile: number[] } {
  const data = imageData.data
  const colSum = new Float64Array(width)
  const rowSum = new Float64Array(height)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4
      const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]
      colSum[x] += lum
      rowSum[y] += lum
    }
  }

  return {
    colProfile: Array.from(colSum, (v) => v / height),
    rowProfile: Array.from(rowSum, (v) => v / width),
  }
}

interface Edge {
  pos: number
  magnitude: number
}

// Rate-of-change (central difference) of the profile at every point. A
// sticker gap shows up as a local spike here regardless of whether the gap
// itself is darker OR lighter than the surrounding stickers — unlike a raw
// brightness dip, this doesn't assume gaps are the darkest thing in frame,
// so it also works on stickerless-style cubes with light/grey seams.
function gradientMagnitude(profile: number[]): number[] {
  const length = profile.length
  const mag = new Array(length).fill(0)
  for (let i = 1; i < length - 1; i++) {
    mag[i] = Math.abs(profile[i + 1] - profile[i - 1]) / 2
  }
  return mag
}

// Finds local maxima in the gradient-magnitude signal that stand out from
// their surroundings within `lookback` samples (bounded to a single-sticker
// -sized window so it can't straddle more than one real gap).
function findEdgePeaks(mag: number[], lookback: number): Edge[] {
  const length = mag.length
  const edges: Edge[] = []

  for (let i = lookback; i < length - lookback; i++) {
    const v = mag[i]
    if (v < mag[i - 1] || v < mag[i + 1]) continue

    let leftMax = -Infinity
    for (let j = i - lookback; j < i; j++) leftMax = Math.max(leftMax, mag[j])
    let rightMax = -Infinity
    for (let j = i + 1; j <= i + lookback; j++) rightMax = Math.max(rightMax, mag[j])

    const prominence = v - Math.max(leftMax, rightMax) * 0.5
    if (prominence > 0) edges.push({ pos: i, magnitude: v })
  }

  return edges
}

// Counts distinct sticker gaps along one profile: keeps edge peaks whose
// magnitude is above a fraction of the profile's own peak gradient (so it
// adapts to contrast/lighting instead of an absolute threshold), then
// merges peaks closer together than a plausible minimum cell size (keeping
// the stronger one of each cluster — a single gap's entering/leaving
// transitions can otherwise register as two nearby peaks).
function countGaps(profile: number[]): { count: number; avgProminence: number } {
  const length = profile.length
  const lookback = Math.max(2, Math.floor(length / (MAX_GRID_SIZE * 2.5)))
  const minSeparation = Math.floor(length / (MAX_GRID_SIZE * 2))

  const mag = gradientMagnitude(profile)
  const maxMag = Math.max(...mag)
  if (maxMag < 1) return { count: 0, avgProminence: 0 }

  const magnitudeThreshold = maxMag * 0.25
  const candidates = findEdgePeaks(mag, lookback)
    .filter((e) => e.magnitude >= magnitudeThreshold)
    .sort((a, b) => a.pos - b.pos)

  const kept: Edge[] = []
  for (const e of candidates) {
    const last = kept[kept.length - 1]
    if (last && e.pos - last.pos < minSeparation) {
      if (e.magnitude > last.magnitude) kept[kept.length - 1] = e
    } else {
      kept.push(e)
    }
  }

  const avgProminence = kept.length > 0
    ? kept.reduce((sum, e) => sum + e.magnitude, 0) / kept.length / maxMag
    : 0

  return { count: kept.length, avgProminence }
}

/**
 * Guess the puzzle's grid size (2-7) from sticker-gap spacing within the
 * same centered face region used for color extraction, by counting distinct
 * gap edges in the row/column luminance profiles' gradient (gaps = N-1 per
 * axis). Returns null when the signal is too weak to trust (e.g. poor
 * lighting, no cube in frame, or the two axes disagree by more than one gap).
 */
export function detectGridSize(canvas: HTMLCanvasElement): GridSizeDetection | null {
  const { imageData, faceWidth, faceHeight } = getFaceRegion(canvas)
  if (faceWidth < 20 || faceHeight < 20) return null

  const { colProfile, rowProfile } = computeLuminanceProfiles(imageData, faceWidth, faceHeight)
  // No extra smoothing here: averaging luminance across the full opposite
  // axis while building each profile already cancels most per-pixel sensor
  // noise. An additional moving-average pass was tried and measurably
  // diluted thin gaps at higher N (6x6/7x7), where gap width is a much
  // smaller fraction of cell size — it caused systematic undercounting.
  const col = countGaps(colProfile)
  const row = countGaps(rowProfile)

  if (Math.abs(col.count - row.count) > 1) return null

  const gapCount = Math.round((col.count + row.count) / 2)
  const size = gapCount + 1
  if (size < MIN_GRID_SIZE || size > MAX_GRID_SIZE) return null

  const confidence = Math.min(1, ((col.avgProminence + row.avgProminence) / 2) * 1.5)
  const MIN_CONFIDENCE = 0.25
  if (confidence < MIN_CONFIDENCE) return null

  return { size, confidence }
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

        // Confidence based on color distance (0-1, higher = better match)
        const dist = colorDistance(avgColor, STICKER_COLORS[stickerColor])
        const cellConfidence = Math.max(0, 1 - dist / 200)
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
    const cellConfidence = Math.max(0, 1 - learned.leaveOneOutDistances[i] / 200)

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

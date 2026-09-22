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
// the post-capture sticker-based recalibration (computeGlobalWhiteBalanceGains)
// is what actually uses knowledge of the cube's real colors.
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
function kMeansCluster(points: RGB[], k: number, iterations = 20): RGB[] {
  const channels: Array<keyof RGB> = ['r', 'g', 'b']
  let spreadCh: keyof RGB = 'r'
  let maxSpread = -1
  for (const ch of channels) {
    const vals = points.map((p) => p[ch])
    const spread = Math.max(...vals) - Math.min(...vals)
    if (spread > maxSpread) { maxSpread = spread; spreadCh = ch }
  }
  const sorted = [...points].sort((a, b) => a[spreadCh] - b[spreadCh])
  let centroids = Array.from({ length: k }, (_, i) =>
    sorted[Math.floor((i + 0.5) * sorted.length / k)]
  )

  for (let iter = 0; iter < iterations; iter++) {
    const sums = Array.from({ length: k }, () => ({ r: 0, g: 0, b: 0, count: 0 }))
    for (const p of points) {
      let best = 0
      let bestDist = Infinity
      for (let i = 0; i < k; i++) {
        const d = colorDistance(p, centroids[i])
        if (d < bestDist) { bestDist = d; best = i }
      }
      sums[best].r += p.r; sums[best].g += p.g; sums[best].b += p.b; sums[best].count++
    }
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

// Solves for the per-channel gain that best maps observed sticker colors
// onto the canonical WCA palette, using ALL captured stickers (typically
// all 54 across 6 faces) as calibration data — a global correction, not a
// per-sticker fix: if every "white" sticker across the whole cube reads
// slightly blue, that's much stronger evidence of a lighting cast than any
// single sticker's isolated reading.
//
// Deliberately does NOT trust each sample's already-guessed colorGuess for
// grouping: under a strong enough cast, that guess can itself be wrong
// (e.g. a cast-shifted white sticker nearest-neighbor-matches yellow), and
// grouping by a wrong guess computes a gain that fits the WRONG target —
// confirmed by testing, where doing exactly that pushed the wrong-direction
// gain to 0.5 on a channel that needed roughly 4x correction. Instead this
// clusters the raw RGB samples into 6 groups (k-means, unsupervised — no
// canonical colors involved yet), then finds the single best overall
// pairing of the 6 cluster centroids to the 6 canonical colors (brute-force
// over all 6! pairings). Clustering only needs the 6 real sticker colors to
// stay visually distinguishable from each other under the cast, not close
// to their "true" position — a much weaker assumption than trusting
// nearest-canonical-color classification.
export function computeGlobalWhiteBalanceGains(samples: StickerSample[]): RGB | null {
  const points = samples.map((s) => s.rgb)
  const K = 6
  if (points.length < K) return null

  const centroids = kMeansCluster(points, K)
  const canonicalKeys = Object.keys(STICKER_COLORS)
  const canonicalList = canonicalKeys.map((k) => STICKER_COLORS[k])
  const assignment = bestPermutationMatch(centroids, canonicalList)

  // Re-assign every individual sample to its nearest FINAL centroid (not
  // its original, possibly-wrong, colorGuess) to get per-category weights
  // for the regression below.
  const byCanonicalIndex: RGB[][] = canonicalList.map(() => [])
  for (const p of points) {
    let best = 0
    let bestDist = Infinity
    for (let i = 0; i < K; i++) {
      const d = colorDistance(p, centroids[i])
      if (d < bestDist) { bestDist = d; best = i }
    }
    byCanonicalIndex[assignment[best]].push(p)
  }

  const channels: Array<keyof RGB> = ['r', 'g', 'b']
  const gains = {} as RGB

  for (const ch of channels) {
    let num = 0
    let den = 0
    for (let ci = 0; ci < K; ci++) {
      const rgbs = byCanonicalIndex[ci]
      if (rgbs.length === 0) continue
      const observedAvg = rgbs.reduce((sum, c) => sum + c[ch], 0) / rgbs.length
      const canonical = canonicalList[ci][ch]
      const weight = rgbs.length
      num += weight * canonical * observedAvg
      den += weight * observedAvg * observedAvg
    }
    gains[ch] = den > 1 ? num / den : 1
  }

  // A fit driven by very few samples or an unlucky color mix shouldn't be
  // allowed to swing colors wildly.
  const clampGain = (g: number) => Math.max(0.3, Math.min(4, g))
  return { r: clampGain(gains.r), g: clampGain(gains.g), b: clampGain(gains.b) }
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
      // Extract the center 80% of each cell to avoid edges
      const cellStartX = Math.round(col * cellWidth + cellWidth * 0.1)
      const cellStartY = Math.round(row * cellHeight + cellHeight * 0.1)
      const cellW = Math.round(cellWidth * 0.8)
      const cellH = Math.round(cellHeight * 0.8)

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

// Sum of squared deviations from a perfectly uniform 6-color split across
// all captured stickers. A real cube (any state, not just solved) has
// exactly N^2 stickers of each of the 6 colors — a strong, free validation
// signal for "did this correction actually help," independent of and more
// reliable than classifier confidence: testing found cases where an
// overly-aggressive gain correction, applied to a capture that had no real
// problem, INCREASED average confidence while introducing brand-new
// misclassifications the uncorrected capture didn't have. Confidence only
// measures "how close is this reading to its nearest canonical color," not
// whether that's the right color; histogram balance catches the difference.
function colorHistogramImbalance(faces: Record<string, ColorDetectionResult>): number {
  const counts: Record<string, number> = { W: 0, Y: 0, O: 0, R: 0, G: 0, B: 0 }
  let total = 0
  for (const det of Object.values(faces)) {
    for (const row of det.colors) {
      for (const c of row) {
        counts[c] = (counts[c] ?? 0) + 1
        total++
      }
    }
  }
  const expected = total / 6
  let sumSqDev = 0
  for (const c of Object.keys(counts)) sumSqDev += (counts[c] - expected) ** 2
  return sumSqDev
}

export interface GlobalWhiteBalanceResult {
  gains: RGB | null
  applied: boolean
  faces: Record<string, ColorDetectionResult>
}

/**
 * Runs the full post-capture recalibration pass: computes a global gain
 * correction from all captured faces' stickers (computeGlobalWhiteBalanceGains),
 * redetects every face with it applied, and only keeps the corrected result
 * if it actually brings the overall color histogram closer to the uniform
 * 1/6-per-color split every valid cube must have — otherwise falls back to
 * the original (uncorrected) detections untouched. `applied` tells the
 * caller which happened, so the UI can say so.
 */
export async function runGlobalWhiteBalance(
  faceCroppedImages: Record<string, string>,
  gridSize: number,
  uncorrectedFaces: Record<string, ColorDetectionResult>
): Promise<GlobalWhiteBalanceResult> {
  const samples: StickerSample[] = []
  for (const det of Object.values(uncorrectedFaces)) {
    for (let r = 0; r < det.colors.length; r++) {
      for (let c = 0; c < det.colors[r].length; c++) {
        samples.push({ rgb: det.cellColors[r][c], colorGuess: det.colors[r][c] })
      }
    }
  }

  const gains = computeGlobalWhiteBalanceGains(samples)
  if (!gains) return { gains: null, applied: false, faces: uncorrectedFaces }

  const correctedFaces: Record<string, ColorDetectionResult> = {}
  for (const [face, dataUrl] of Object.entries(faceCroppedImages)) {
    correctedFaces[face] = await redetectFaceColors(dataUrl, gridSize, gains)
  }

  const better = colorHistogramImbalance(correctedFaces) < colorHistogramImbalance(uncorrectedFaces)
  return better
    ? { gains, applied: true, faces: correctedFaces }
    : { gains, applied: false, faces: uncorrectedFaces }
}

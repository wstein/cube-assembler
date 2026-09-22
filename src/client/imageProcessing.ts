// Image processing utilities for cube face detection and color extraction

export interface ColorDetectionResult {
  colors: string[][]
  confidence: number
  cellConfidences: number[][]
}

interface RGB {
  r: number
  g: number
  b: number
}

// Standard cube sticker colors (WCA compliant)
const STICKER_COLORS: Record<string, RGB> = {
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

export function extractCubeFaceColors(canvas: HTMLCanvasElement, gridSize = 3): ColorDetectionResult {
  const { imageData, faceWidth, faceHeight } = getFaceRegion(canvas)

  const cellWidth = faceWidth / gridSize
  const cellHeight = faceHeight / gridSize
  const data = imageData.data

  const colors: string[][] = []
  const cellConfidences: number[][] = []
  let totalConfidence = 0

  for (let row = 0; row < gridSize; row++) {
    const rowColors: string[] = []
    const rowConfidences: number[] = []
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
        const avgColor: RGB = {
          r: Math.round(sumR / pixelCount),
          g: Math.round(sumG / pixelCount),
          b: Math.round(sumB / pixelCount),
        }
        const stickerColor = closestSticker(avgColor)
        rowColors.push(stickerColor)

        // Confidence based on color distance (0-1, higher = better match)
        const dist = colorDistance(avgColor, STICKER_COLORS[stickerColor])
        const cellConfidence = Math.max(0, 1 - dist / 200)
        rowConfidences.push(cellConfidence)
        totalConfidence += cellConfidence
      } else {
        rowColors.push('W')
        rowConfidences.push(0)
      }
    }
    colors.push(rowColors)
    cellConfidences.push(rowConfidences)
  }

  const confidence = Math.min(1, totalConfidence / (gridSize * gridSize))

  return { colors, confidence, cellConfidences }
}

export interface FaceCaptureResult extends ColorDetectionResult {
  croppedImage: string
}

export function captureAndProcessFace(
  video: HTMLVideoElement,
  gridSize = 3
): FaceCaptureResult {
  const canvas = document.createElement('canvas')
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Could not get canvas context')
  }

  ctx.drawImage(video, 0, 0)
  return { ...extractCubeFaceColors(canvas, gridSize), croppedImage: cropFaceRegionToDataUrl(canvas) }
}

export function captureAndProcessImage(
  img: HTMLImageElement,
  gridSize = 3
): FaceCaptureResult {
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Could not get canvas context')
  }

  ctx.drawImage(img, 0, 0)
  return { ...extractCubeFaceColors(canvas, gridSize), croppedImage: cropFaceRegionToDataUrl(canvas) }
}

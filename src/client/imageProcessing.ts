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

interface FaceRegion {
  imageData: ImageData
  faceWidth: number
  faceHeight: number
}

// Cube face is assumed centered in frame, matching the fixed guide square
// shown to the user during capture (see capture-grid-overlay in index.tsx).
function getFaceRegion(canvas: HTMLCanvasElement): FaceRegion {
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Could not get canvas context')
  }

  const width = canvas.width
  const height = canvas.height

  const centerX = width / 2
  const centerY = height / 2
  const faceSize = Math.min(width, height) * 0.6

  const startX = Math.max(0, centerX - faceSize / 2)
  const startY = Math.max(0, centerY - faceSize / 2)
  const endX = Math.min(width, startX + faceSize)
  const endY = Math.min(height, startY + faceSize)

  const faceWidth = endX - startX
  const faceHeight = endY - startY

  return {
    imageData: ctx.getImageData(startX, startY, faceWidth, faceHeight),
    faceWidth,
    faceHeight,
  }
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

export function captureAndProcessFace(
  video: HTMLVideoElement,
  gridSize = 3
): ColorDetectionResult {
  const canvas = document.createElement('canvas')
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Could not get canvas context')
  }

  ctx.drawImage(video, 0, 0)
  return extractCubeFaceColors(canvas, gridSize)
}

export function captureAndProcessImage(
  img: HTMLImageElement,
  gridSize = 3
): ColorDetectionResult {
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Could not get canvas context')
  }

  ctx.drawImage(img, 0, 0)
  return extractCubeFaceColors(canvas, gridSize)
}

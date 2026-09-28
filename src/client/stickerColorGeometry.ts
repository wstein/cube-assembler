// Image processing utilities for cube face detection and color extraction

import { cellEdges } from './gridAlignment'

export interface ColorDetectionResult {
  colors: string[][]
  confidence: number
  cellConfidences: number[][]
  cellColors: RGB[][]
  // Per sticker, the other color it sits close to the boundary with (see
  // nearestOtherColor), or null when it's clearly its own color. Only set
  // after the cross-face recalibration, since it needs the learned colors.
  cellLookalikes?: (string | null)[][]
  // Where the sampled square sat relative to the capture guide, when it was
  // aligned onto the sticker grid: center offset and size, in guide sizes,
  // and its tilt in degrees.
  gridOffset?: { x: number; y: number; scale: number; angle: number }
  // Width of the outer rows/columns relative to the inner ones, when the
  // face showed wider perimeter cubies (see cellEdges); sampled that way.
  outerCellRatio?: number
  // Odd cubes: the center cell measured past its logo (centerStickerColor),
  // which its color is classified from. cellColors keeps the plain reading.
  centerColor?: RGB
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

// The centered part of each sticker cell to sample. Cube profiles adjust
// this for different sticker gaps; backdrop exclusion stays fixed.
export interface SamplingGeometry {
  // Fraction of each sticker cell that's sampled, centered (the rest is
  // the gap/dead zone around it).
  stickerCore: number
}

export const DEFAULT_SAMPLING: SamplingGeometry = {
  stickerCore: SAMPLE_CORE_FRACTION,
}

// A sticker cell's sampled rectangle within a face of the given size -
// shared by the detector and the UI overlay so both draw the same zones.
// `outerCellRatio` widens the outer rows and columns (see cellEdges).
export function stickerSampleRect(
  row: number,
  col: number,
  gridSize: number,
  faceWidth: number,
  faceHeight: number,
  sampling: SamplingGeometry = DEFAULT_SAMPLING,
  outerCellRatio = 1,
): { x: number; y: number; width: number; height: number } {
  const inset = (1 - sampling.stickerCore) / 2
  if (outerCellRatio === 1) {
    // Even cells, computed exactly as always so saved readings still match.
    const cellWidth = faceWidth / gridSize
    const cellHeight = faceHeight / gridSize
    return {
      x: (col + inset) * cellWidth,
      y: (row + inset) * cellHeight,
      width: cellWidth * sampling.stickerCore,
      height: cellHeight * sampling.stickerCore,
    }
  }
  const edges = cellEdges(gridSize, outerCellRatio)
  const cellWidth = (edges[col + 1] - edges[col]) * faceWidth
  const cellHeight = (edges[row + 1] - edges[row]) * faceHeight
  return {
    x: edges[col] * faceWidth + inset * cellWidth,
    y: edges[row] * faceHeight + inset * cellHeight,
    width: cellWidth * sampling.stickerCore,
    height: cellHeight * sampling.stickerCore,
  }
}

// Standard cube sticker colors (WCA compliant)
export const STICKER_COLORS: Record<string, RGB> = {
  W: { r: 255, g: 255, b: 255 }, // White
  Y: { r: 255, g: 255, b: 0 }, // Yellow
  O: { r: 255, g: 127, b: 0 }, // Orange
  R: { r: 255, g: 0, b: 0 }, // Red
  G: { r: 0, g: 128, b: 0 }, // Green
  B: { r: 0, g: 0, b: 255 }, // Blue
}

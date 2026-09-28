// Sticker colors and sampling geometry: types, plus the typed entry point
// for src/core/color/StickerGeometry.res.

import {
  cellEdges as cellEdgesRes,
  defaultSampling,
  sampleCoreFraction,
  stickerColors,
  stickerSampleRect as stickerSampleRectRes,
} from '../core/color/StickerGeometry.gen'

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

// Fraction of each sticker cell actually sampled, centered - the rest is a
// dead zone the color/edge detectors ignore; the UI draws the same one.
export const SAMPLE_CORE_FRACTION = sampleCoreFraction

// The centered part of each sticker cell to sample. Cube profiles adjust
// this for different sticker gaps; backdrop exclusion stays fixed.
export interface SamplingGeometry {
  // Fraction of each sticker cell that's sampled, centered (the rest is
  // the gap/dead zone around it).
  stickerCore: number
}

export const DEFAULT_SAMPLING: SamplingGeometry = defaultSampling

// Where the grid lines of a face fall, as fractions of its size; outer
// rows and columns may be `outer` times as wide as inner ones.
export function cellEdges(gridSize: number, outer = 1): number[] {
  return cellEdgesRes(gridSize, outer)
}

// A sticker cell's sampled rectangle within a face of the given size -
// shared by the detector and the UI overlay so both draw the same zones.
export function stickerSampleRect(
  row: number,
  col: number,
  gridSize: number,
  faceWidth: number,
  faceHeight: number,
  sampling: SamplingGeometry = DEFAULT_SAMPLING,
  outerCellRatio = 1,
): { x: number; y: number; width: number; height: number } {
  return stickerSampleRectRes(
    row,
    col,
    gridSize,
    faceWidth,
    faceHeight,
    sampling,
    outerCellRatio,
  )
}

// Standard cube sticker colors (WCA compliant).
export const STICKER_COLORS: Record<string, RGB> = stickerColors

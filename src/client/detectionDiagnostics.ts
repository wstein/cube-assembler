// Why Detect face did (or didn't) find a face in one camera frame - the
// live check's own steps (alignedFaceBounds, then hasVisibleCubeFace) run
// on raw frame pixels and reported one by one, so a rejected frame saved
// from the capture dialog can be replayed and explained exactly
// (scripts/replayDiagnostics.ts) instead of guessed at from a crop.

import {
  alignFaceInArea, alignmentArea, boundsFromAlignment, extractColorsFromImageData, faceVisibility,
  guideBounds, outlineVisible, type FaceBounds,
} from './imageProcessing'

// The first live step that turned the frame down.
//   no-grid             - no square around the guide had its lines on seams
//   incoherent-stickers - the square's cells aren't evenly colored
//   no-sticker-pattern  - neither a sticker pattern nor a face outline
export type RejectionReason = 'no-grid' | 'incoherent-stickers' | 'no-sticker-pattern'

export interface DetectionReport {
  gridSize: number
  frame: { width: number; height: number }
  guide: { x: number; y: number; size: number }
  // The alignment in frame coordinates; angle in degrees.
  alignment: { centerX: number; centerY: number; size: number; angle: number; score: number; aligned: boolean; seams: boolean; outer: number }
  bounds: FaceBounds
  // hasVisibleCubeFace's steps on the square read from `bounds` - worked
  // out even when there is no grid, which the live check doesn't do.
  visibility: { coherent: boolean; plausible?: boolean; outline?: boolean }
  colors: string[][]
  // Colors among the square's cells: a cube face shows several, a wall one.
  distinctColors: number
  detected: boolean
  reason: RejectionReason | null
}

// The square of `bounds` from a width x height RGBA frame, turned upright
// when tilted (nearest pixel - the live path draws it with a canvas).
function readSquare(frame: Uint8ClampedArray, width: number, height: number, bounds: FaceBounds): Uint8ClampedArray {
  const size = bounds.faceWidth
  const out = new Uint8ClampedArray(size * size * 4)
  const cx = bounds.startX + size / 2, cy = bounds.startY + size / 2
  const cos = Math.cos(bounds.angle ?? 0), sin = Math.sin(bounds.angle ?? 0)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x + 0.5 - size / 2, v = y + 0.5 - size / 2
      const sx = Math.min(width - 1, Math.max(0, Math.floor(cx + cos * u - sin * v)))
      const sy = Math.min(height - 1, Math.max(0, Math.floor(cy + sin * u + cos * v)))
      const from = (sy * width + sx) * 4, to = (y * size + x) * 4
      out[to] = frame[from]; out[to + 1] = frame[from + 1]; out[to + 2] = frame[from + 2]; out[to + 3] = 255
    }
  }
  return out
}

export function diagnoseFaceDetection(frame: Uint8ClampedArray, width: number, height: number, gridSize: number): DetectionReport {
  const guide = guideBounds(width, height)
  const area = alignmentArea(guide, width, height)
  const areaWidth = area.x1 - area.x0, areaHeight = area.y1 - area.y0
  const region = new Uint8ClampedArray(areaWidth * areaHeight * 4)
  for (let y = 0; y < areaHeight; y++) {
    region.set(frame.subarray(((area.y0 + y) * width + area.x0) * 4, ((area.y0 + y) * width + area.x1) * 4), y * areaWidth * 4)
  }
  const found = alignFaceInArea(region, areaWidth, areaHeight, guide, area, gridSize)
  const bounds = boundsFromAlignment(found, guide, area, width, height)

  const square = readSquare(frame, width, height, bounds)
  const { visible, ...visibility } = faceVisibility(square, bounds.faceWidth, bounds.faceHeight, gridSize,
    () => outlineVisible(frame, width, height, bounds))
  const colors = extractColorsFromImageData(square, bounds.faceWidth, bounds.faceHeight, gridSize).colors
  const reason: RejectionReason | null = !bounds.gridFound ? 'no-grid'
    : !visibility.coherent ? 'incoherent-stickers'
    : !visible ? 'no-sticker-pattern'
    : null

  return {
    gridSize,
    frame: { width, height },
    guide: { x: guide.startX, y: guide.startY, size: guide.faceWidth },
    alignment: {
      centerX: area.x0 + found.center[0],
      centerY: area.y0 + found.center[1],
      size: found.size,
      angle: (found.angle * 180) / Math.PI,
      score: found.score,
      aligned: found.aligned,
      seams: found.seams,
      outer: found.outer,
    },
    bounds,
    visibility,
    colors,
    distinctColors: new Set(colors.flat()).size,
    detected: reason === null,
    reason,
  }
}

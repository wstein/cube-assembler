// One live camera frame analyzed on raw pixels - what the capture dialog's
// preview shows - so it can run in a worker (liveAnalysis.worker.ts) off
// the page's thread. The face's square is read once and serves both the
// colors and the cube check, so both judge the same pixels.

import { estimateFaceGridSize } from './gridAlignment'
import {
  alignFaceInArea, alignmentArea, boundsFromAlignment, computeBackgroundGains, extractBackgroundColorFromPixels,
  extractColorsFromImageData, faceVisibility, guideBounds, NEUTRAL_GAINS, outlineVisible, withGridOffset,
  type ColorDetectionResult, type FaceBounds, type RGB, type SamplingGeometry,
} from './imageProcessing'

export interface LiveAnalysisRequest {
  gridSize: number
  // 'aligned' (Detect face) or 'fixed' (Guide grid: the drawn square).
  mode: 'aligned' | 'fixed'
  // Detect face insists on a visible face outline (see faceVisibility).
  requireOutline: boolean
  sampling: SamplingGeometry
  palette?: Record<string, RGB>
  capturedBackgrounds?: Record<string, RGB | null>
  // Also estimate the cube's size (before the first face; see
  // estimateFaceGridSize).
  detectSize?: boolean
}

export interface LiveAnalysis {
  // In the analyzed frame's pixels.
  bounds: FaceBounds
  detection: ColorDetectionResult
  visible: boolean
  backgroundColor: RGB | null
  gains: RGB
  // With detectSize: the size the face clearly shows, or null.
  size?: number | null
}

// The pixels of `area` from a width-wide RGBA frame.
function cropArea(frame: Uint8ClampedArray, width: number, area: { x0: number; y0: number; x1: number; y1: number }): Uint8ClampedArray {
  const w = area.x1 - area.x0, h = area.y1 - area.y0
  const out = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) out.set(frame.subarray(((area.y0 + y) * width + area.x0) * 4, ((area.y0 + y) * width + area.x1) * 4), y * w * 4)
  return out
}

// The square of `bounds`, upright: copied as is when it isn't tilted (the
// same pixels getImageData returns), otherwise sampled bilinearly through
// the rotation, as a canvas draws it.
export function readFaceSquare(frame: Uint8ClampedArray, width: number, height: number, bounds: FaceBounds): Uint8ClampedArray {
  const size = bounds.faceWidth
  if (!bounds.angle) {
    return cropArea(frame, width, {
      x0: bounds.startX, y0: bounds.startY, x1: bounds.startX + size, y1: bounds.startY + bounds.faceHeight,
    })
  }
  const out = new Uint8ClampedArray(size * size * 4)
  const cx = bounds.startX + size / 2, cy = bounds.startY + size / 2
  const cos = Math.cos(bounds.angle), sin = Math.sin(bounds.angle)
  const at = (x: number, y: number, c: number) => frame[(Math.min(height - 1, Math.max(0, y)) * width + Math.min(width - 1, Math.max(0, x))) * 4 + c]
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x + 0.5 - size / 2, v = y + 0.5 - size / 2
      const sx = cx + cos * u - sin * v - 0.5, sy = cy + sin * u + cos * v - 0.5
      const x0 = Math.floor(sx), y0 = Math.floor(sy), fx = sx - x0, fy = sy - y0
      const to = (y * size + x) * 4
      for (let c = 0; c < 3; c++) {
        out[to + c] = (at(x0, y0, c) * (1 - fx) + at(x0 + 1, y0, c) * fx) * (1 - fy)
          + (at(x0, y0 + 1, c) * (1 - fx) + at(x0 + 1, y0 + 1, c) * fx) * fy
      }
      out[to + 3] = 255
    }
  }
  return out
}

export function analyzeLiveFrame(frame: Uint8ClampedArray, width: number, height: number, request: LiveAnalysisRequest): LiveAnalysis {
  const { gridSize, sampling, palette } = request
  const guide = guideBounds(width, height)
  let bounds = guide
  let size: number | null | undefined
  if (request.mode === 'aligned' || request.detectSize) {
    const area = alignmentArea(guide, width, height)
    const region = cropArea(frame, width, area), areaWidth = area.x1 - area.x0, areaHeight = area.y1 - area.y0
    if (request.detectSize) {
      size = estimateFaceGridSize(region, areaWidth, areaHeight, { x: guide.startX - area.x0, y: guide.startY - area.y0, size: guide.faceWidth })
    }
    if (request.mode === 'aligned') {
      bounds = boundsFromAlignment(alignFaceInArea(region, areaWidth, areaHeight, guide, area, gridSize), guide, area, width, height)
    }
  }
  // Colors and the cube check on one read of the square.
  const square = readFaceSquare(frame, width, height, bounds)
  const visible = (request.mode === 'fixed' || bounds.gridFound === true)
    && faceVisibility(square, bounds.faceWidth, bounds.faceHeight, gridSize, () => outlineVisible(frame, width, height, bounds), request.requireOutline).visible
  const captured = request.capturedBackgrounds ?? {}
  const backgroundColor = visible && Object.values(captured).filter(Boolean).length >= 2
    ? extractBackgroundColorFromPixels(frame, width, height, bounds) : null
  const gains = backgroundColor
    ? computeBackgroundGains({ ...captured, current: backgroundColor })?.current ?? NEUTRAL_GAINS
    : NEUTRAL_GAINS
  const detection = withGridOffset(
    extractColorsFromImageData(square, bounds.faceWidth, bounds.faceHeight, gridSize, gains, sampling, palette), bounds, guide)
  return { bounds, detection, visible, backgroundColor, gains, ...(size !== undefined && { size }) }
}

// `bounds` of a frame analyzed at `scale` times the camera's size, in the
// camera frame's own pixels.
export function scaleBounds(bounds: FaceBounds, scale: number): FaceBounds {
  if (scale === 1) return bounds
  return {
    ...bounds,
    startX: Math.round(bounds.startX / scale),
    startY: Math.round(bounds.startY / scale),
    faceWidth: Math.round(bounds.faceWidth / scale),
    faceHeight: Math.round(bounds.faceHeight / scale),
  }
}

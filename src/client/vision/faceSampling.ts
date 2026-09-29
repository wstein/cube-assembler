// Where to read a face in a frame and the colors read from it; the pure
// part lives in src/core/vision/FaceSampling.res, the canvas work here.
import {
  alignedBoundsInArea,
  alignmentArea,
  extractBackgroundColorFromPixels,
  type faceBounds,
  guideBounds as guideBoundsRes,
  sampleFaceFraction,
  cropJpegQuality,
  trimmedMeanColor as trimmedMeanColorRes,
  outlierTrimFraction,
} from '../../core/vision/FaceSampling.gen'
import { warpQuadToSquare } from './perspective'
import { type RGB } from './stickerColorGeometry'

export {
  backdropReference,
  backgroundCubeGap as BACKGROUND_CUBE_GAP,
  backgroundWbMethod as BACKGROUND_WB_METHOD,
  computeBackgroundGains,
  limitBackgroundGain,
  stickerColor,
  stickerMeasurement as STICKER_MEASUREMENT,
} from '../../core/vision/FaceSampling.gen'

export type FaceBounds = faceBounds

interface FaceRegion extends FaceBounds {
  imageData: ImageData
}

// Cube face is assumed centered in frame, matching the fixed guide square
// shown to the user during capture (see capture-grid-overlay in index.tsx).
// `fraction` defaults to the sticker guide square itself.
export function computeFaceBounds(
  canvas: HTMLCanvasElement,
  fraction = sampleFaceFraction,
): FaceBounds {
  return guideBounds(canvas.width, canvas.height, fraction)
}

// computeFaceBounds for a frame of the given size.
function guideBounds(
  width: number,
  height: number,
  fraction = sampleFaceFraction,
): FaceBounds {
  return guideBoundsRes(width, height, fraction)
}

// The guide square moved onto the cube's actual sticker grid (see
// findGridAlignment), so a face held a little off-center or away from the
// camera is still sampled cell by cell. Falls back to the guide itself when
// no convincing grid shows. Exported so one live frame is aligned once for
// both extractCubeFaceColors and hasVisibleCubeFace.
export function alignedFaceBounds(
  canvas: HTMLCanvasElement,
  gridSize: number,
): FaceBounds {
  const guide = computeFaceBounds(canvas)
  const ctx = canvas.getContext('2d')
  if (!ctx || guide.faceWidth !== guide.faceHeight)
    return { ...guide, gridFound: false }
  const area = alignmentArea(guide, canvas.width, canvas.height)
  const region = ctx.getImageData(
    area.x0,
    area.y0,
    area.x1 - area.x0,
    area.y1 - area.y0,
  )
  return alignedBoundsInArea(
    region.data,
    region.width,
    region.height,
    guide,
    area,
    gridSize,
    canvas.width,
    canvas.height,
  )
}

export type FaceGeometryMode = 'aligned' | 'fixed'

// Shared by the live overlay and both capture sources. A manual guide always
// samples its drawn square; the default scanner searches nearby grid seams.
export function faceBoundsForMode(
  canvas: HTMLCanvasElement,
  gridSize: number,
  mode: FaceGeometryMode,
): FaceBounds {
  return mode === 'fixed'
    ? computeFaceBounds(canvas)
    : alignedFaceBounds(canvas, gridSize)
}

// Draws the square of `bounds` from `canvas` onto a new canvas of its size,
// turned upright when it is tilted.
function drawFaceSquare(
  canvas: HTMLCanvasElement,
  bounds: FaceBounds,
): HTMLCanvasElement {
  const out = document.createElement('canvas')
  out.width = bounds.faceWidth
  out.height = bounds.faceHeight
  const ctx = out.getContext('2d')
  if (!ctx) {
    throw new Error('Could not get canvas context')
  }
  if (bounds.corners) {
    // Straightened through the corners, from the pixels around them.
    const xs = bounds.corners.map(([x]) => x),
      ys = bounds.corners.map(([, y]) => y)
    const x0 = Math.max(0, Math.floor(Math.min(...xs)) - 1),
      y0 = Math.max(0, Math.floor(Math.min(...ys)) - 1)
    const x1 = Math.min(canvas.width, Math.ceil(Math.max(...xs)) + 1),
      y1 = Math.min(canvas.height, Math.ceil(Math.max(...ys)) + 1)
    const source = canvas
      .getContext('2d')
      ?.getImageData(x0, y0, x1 - x0, y1 - y0)
    if (!source) throw new Error('Could not get canvas context')
    const pixels = warpQuadToSquare(
      source.data,
      source.width,
      source.height,
      bounds.corners.map(([x, y]) => [x - x0, y - y0]),
      bounds.faceWidth,
    )
    ctx.putImageData(
      new ImageData(
        pixels as Uint8ClampedArray<ArrayBuffer>,
        bounds.faceWidth,
        bounds.faceWidth,
      ),
      0,
      0,
    )
  } else if (bounds.angle) {
    ctx.translate(bounds.faceWidth / 2, bounds.faceHeight / 2)
    ctx.rotate(-bounds.angle)
    ctx.drawImage(
      canvas,
      -(bounds.startX + bounds.faceWidth / 2),
      -(bounds.startY + bounds.faceHeight / 2),
    )
  } else {
    ctx.drawImage(
      canvas,
      bounds.startX,
      bounds.startY,
      bounds.faceWidth,
      bounds.faceHeight,
      0,
      0,
      bounds.faceWidth,
      bounds.faceHeight,
    )
  }
  return out
}

export function readFaceRegion(
  canvas: HTMLCanvasElement,
  bounds: FaceBounds,
): FaceRegion {
  const drawn = Boolean(bounds.angle || bounds.corners)
  const source = drawn ? drawFaceSquare(canvas, bounds) : canvas
  const ctx = source.getContext('2d')
  if (!ctx) {
    throw new Error('Could not get canvas context')
  }
  return {
    ...bounds,
    imageData: drawn
      ? ctx.getImageData(0, 0, bounds.faceWidth, bounds.faceHeight)
      : ctx.getImageData(
          bounds.startX,
          bounds.startY,
          bounds.faceWidth,
          bounds.faceHeight,
        ),
  }
}

// The backdrop's color on a LIVE captured frame (see
// extractBackgroundColorFromPixels, which the live worker calls on its own
// frame pixels). Only meaningful on a live, uncropped canvas - a stored croppedImage (see
// cropFaceRegionToDataUrl) has no background left - so it's captured once
// at capture time (captureAndProcessCanvas / captureAndProcessImage).
export function extractBackgroundColor(
  canvas: HTMLCanvasElement,
  face: FaceBounds = computeFaceBounds(canvas),
): RGB | null {
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const { width, height } = canvas
  if (width < 40 || height < 40) return null
  return extractBackgroundColorFromPixels(
    ctx.getImageData(0, 0, width, height).data,
    width,
    height,
    face,
  )
}

// Crops just the analyzed face region out of a captured frame, for showing
// the user what was actually sampled (e.g. in a post-capture review step) —
// independent of extractCubeFaceColors, so it costs nothing on the
// high-frequency live-preview path that doesn't need an image, only text.
export function cropFaceRegionToDataUrl(
  canvas: HTMLCanvasElement,
  bounds: FaceBounds = computeFaceBounds(canvas),
): string {
  const out = drawFaceSquare(canvas, bounds)
  // Quality 1 is the only setting at which Chrome keeps full-resolution
  // color (4:4:4); anything below stores chroma at half resolution (4:2:0),
  // and decoders then disagree on how to upsample it - jpeg-js vs Chrome
  // differed by up to 25 levels at sticker edges at 0.85, by at most 3 at
  // 1. This image is the source of truth that recalibration and saved
  // fixtures re-analyze, so it's worth the ~4x size (~200 KB for a 648px
  // crop from 1080p).
  return out.toDataURL('image/jpeg', cropJpegQuality)
}

// Averages pixel colors after discarding the brightest/darkest tails by
// luminance (15% each end by default).
export function trimmedMeanColor(
  pixels: RGB[],
  trimFraction = outlierTrimFraction,
): RGB | null {
  return trimmedMeanColorRes(pixels, trimFraction)
}

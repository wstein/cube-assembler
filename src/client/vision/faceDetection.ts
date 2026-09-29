// Reading a face's sticker colors from a canvas or image. The pixel work
// lives in src/core/vision/FaceDetection.res; this draws and crops.
import {
  cropRecord,
  extractColorsFromImageData as extractColorsFromImageDataRes,
  faceVisibility as faceVisibilityRes,
  hasPlausibleStickerFace as hasPlausibleStickerFaceRes,
  measureSharpness,
  outlineVisible,
  withGridOffset,
} from '../../core/vision/FaceDetection.gen'
import {
  DEFAULT_SAMPLING,
  type ColorDetectionResult,
  type RGB,
  type SamplingGeometry,
} from './stickerColorGeometry'
import { NEUTRAL_GAINS } from './colorMath'
import {
  type FaceBounds,
  type FaceGeometryMode,
  computeFaceBounds,
  faceBoundsForMode,
  alignedFaceBounds,
  readFaceRegion,
  extractBackgroundColor,
  cropFaceRegionToDataUrl,
} from './faceSampling'

export { measureSharpness } from '../../core/vision/FaceDetection.gen'

// The per-sticker sampling and classification on pixels that already cover
// exactly the face region to sample - so it also runs on a decoded photo in
// tests (see test/fixtures.test.ts).
export function extractColorsFromImageData(
  data: Uint8ClampedArray,
  faceWidth: number,
  faceHeight: number,
  gridSize = 3,
  gains: RGB = NEUTRAL_GAINS,
  sampling: SamplingGeometry = DEFAULT_SAMPLING,
  palette?: Record<string, RGB>,
): ColorDetectionResult {
  return extractColorsFromImageDataRes(
    data,
    faceWidth,
    faceHeight,
    gridSize,
    gains,
    sampling,
    palette,
  )
}

// The classifier assigns a color even to a wall: look for repeated sticker
// seams, or dark four-sticker intersections on rounded stickers.
export function hasPlausibleStickerFace(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  gridSize: number,
  outerCellRatio = 1,
): boolean {
  return hasPlausibleStickerFaceRes(
    data,
    width,
    height,
    gridSize,
    outerCellRatio,
  )
}

export function hasVisibleCubeFace(
  canvas: HTMLCanvasElement,
  gridSize: number,
  bounds: FaceBounds = alignedFaceBounds(canvas, gridSize),
  requireOutline = false,
): boolean {
  const { imageData, faceWidth, faceHeight } = readFaceRegion(canvas, bounds)
  return faceVisibility(
    imageData.data,
    faceWidth,
    faceHeight,
    gridSize,
    () => {
      const ctx = canvas.getContext('2d')
      if (!ctx) return false
      const angle = bounds.angle ?? 0
      const cos = Math.abs(Math.cos(angle)),
        sin = Math.abs(Math.sin(angle))
      const cx = bounds.startX + faceWidth / 2,
        cy = bounds.startY + faceHeight / 2
      const margin = Math.ceil(Math.min(faceWidth, faceHeight) * 0.08) + 1
      const halfX = (cos * faceWidth + sin * faceHeight) / 2 + margin
      const halfY = (sin * faceWidth + cos * faceHeight) / 2 + margin
      const x0 = Math.max(0, Math.floor(cx - halfX)),
        y0 = Math.max(0, Math.floor(cy - halfY))
      const x1 = Math.min(canvas.width, Math.ceil(cx + halfX)),
        y1 = Math.min(canvas.height, Math.ceil(cy + halfY))
      if (x1 <= x0 || y1 <= y0) return false
      const region = ctx.getImageData(x0, y0, x1 - x0, y1 - y0)
      return outlineVisible(region.data, x1 - x0, y1 - y0, {
        ...bounds,
        startX: bounds.startX - x0,
        startY: bounds.startY - y0,
      })
    },
    requireOutline,
  ).visible
}

// The live cube check on the read square `data`, step by step: coherent
// sticker interiors, then a sticker pattern or a visible outline.
export function faceVisibility(
  data: Uint8ClampedArray,
  faceWidth: number,
  faceHeight: number,
  gridSize: number,
  outline: () => boolean,
  requireOutline = false,
): {
  visible: boolean
  coherent: boolean
  plausible?: boolean
  outline?: boolean
} {
  return faceVisibilityRes(
    data,
    faceWidth,
    faceHeight,
    gridSize,
    outline,
    requireOutline,
  )
}

function extractCubeFaceColors(
  canvas: HTMLCanvasElement,
  gridSize = 3,
  gains: RGB = NEUTRAL_GAINS,
  sampling: SamplingGeometry = DEFAULT_SAMPLING,
  palette?: Record<string, RGB>,
  bounds: FaceBounds = alignedFaceBounds(canvas, gridSize),
): ColorDetectionResult {
  const { imageData, faceWidth, faceHeight } = readFaceRegion(canvas, bounds)
  const result = extractColorsFromImageData(
    imageData.data,
    faceWidth,
    faceHeight,
    gridSize,
    gains,
    sampling,
    palette,
  )
  return withGridOffset(result, bounds, computeFaceBounds(canvas))
}

export interface FaceCaptureResult extends ColorDetectionResult {
  croppedImage: string
  // Sampled once, live, at capture time - see extractBackgroundColor. Null
  // when the frame was too small or the background area came back unreliably dark;
  // callers should then fall back to NEUTRAL_GAINS for this face's
  // cross-face correction rather than treating it as a hard error.
  backgroundColor: RGB | null
  // Where croppedImage came from, for saved fixtures: the full frame's size
  // and the crop rectangle within it (the rest of the frame is dropped for
  // privacy, so this is the only record of how it was framed).
  frame: { width: number; height: number }
  // `angle`: degrees the crop was turned upright by, about its center.
  // `corners`: where it was straightened from, for a face seen at an angle.
  crop: {
    x: number
    y: number
    width: number
    height: number
    angle?: number
    corners?: number[][]
  }
  // measureSharpness of the cropped face region.
  sharpness: number
}

function describeCrop(
  canvas: HTMLCanvasElement,
  bounds: FaceBounds,
): Pick<FaceCaptureResult, 'frame' | 'crop' | 'sharpness'> {
  const { imageData, startX, startY, faceWidth, faceHeight } = readFaceRegion(
    canvas,
    bounds,
  )
  return {
    frame: { width: canvas.width, height: canvas.height },
    crop: cropRecord({ ...bounds, startX, startY, faceWidth, faceHeight }),
    sharpness: measureSharpness(imageData.data, faceWidth, faceHeight),
  }
}

// Use the already checked live frame for automatic capture. Reading the video
// again after the stability check could capture a different, moving face.
export function captureAndProcessCanvas(
  canvas: HTMLCanvasElement,
  gridSize = 3,
  gains: RGB = NEUTRAL_GAINS,
  sampling: SamplingGeometry = DEFAULT_SAMPLING,
  palette?: Record<string, RGB>,
  geometry: FaceGeometryMode = 'aligned',
  checkedBounds?: FaceBounds,
): FaceCaptureResult {
  // croppedImage is always the raw, un-gained frame — it's the source of
  // truth photo, re-analyzed independently by the post-capture global
  // recalibration pass (redetectFaceColors / runGlobalWhiteBalance),
  // which always starts over from NEUTRAL_GAINS regardless of what `gains`
  // was passed in here (see the "Gains" comment above) - unless a
  // background-derived correction is supplied for this face instead (see
  // runGlobalWhiteBalance's faceGains parameter).
  // One aligned square for the colors, the saved photo and its crop record,
  // so everything later re-analyzed from the photo sees the same face.
  const bounds = checkedBounds ?? faceBoundsForMode(canvas, gridSize, geometry)
  if (geometry === 'aligned' && !bounds.gridFound)
    throw new Error(
      'No aligned face found. Show a face in the camera view or choose Guide grid.',
    )
  return {
    ...extractCubeFaceColors(
      canvas,
      gridSize,
      gains,
      sampling,
      palette,
      bounds,
    ),
    croppedImage: cropFaceRegionToDataUrl(canvas, bounds),
    backgroundColor: extractBackgroundColor(canvas, bounds),
    ...describeCrop(canvas, bounds),
  }
}

export function captureAndProcessImage(
  img: HTMLImageElement,
  gridSize = 3,
  gains: RGB = NEUTRAL_GAINS,
  sampling: SamplingGeometry = DEFAULT_SAMPLING,
  palette?: Record<string, RGB>,
  geometry: FaceGeometryMode = 'aligned',
): FaceCaptureResult {
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Could not get canvas context')
  }

  ctx.drawImage(img, 0, 0)
  // One aligned square for the colors, the saved photo and its crop record,
  // so everything later re-analyzed from the photo sees the same face.
  const bounds = faceBoundsForMode(canvas, gridSize, geometry)
  if (geometry === 'aligned' && !bounds.gridFound)
    throw new Error(
      'No aligned face found in the image. Choose another image or Guide grid.',
    )
  return {
    ...extractCubeFaceColors(
      canvas,
      gridSize,
      gains,
      sampling,
      palette,
      bounds,
    ),
    croppedImage: cropFaceRegionToDataUrl(canvas, bounds),
    backgroundColor: extractBackgroundColor(canvas, bounds),
    ...describeCrop(canvas, bounds),
  }
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
  gains: RGB,
  sampling: SamplingGeometry = DEFAULT_SAMPLING,
  palette?: Record<string, RGB>,
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

  // The stored photo was cropped to the aligned square at capture time -
  // sample exactly the guide here instead of aligning it a second time.
  return extractCubeFaceColors(
    padded,
    gridSize,
    gains,
    sampling,
    palette,
    computeFaceBounds(padded),
  )
}

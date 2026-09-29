import {
  captureAndProcessCanvas,
  captureAndProcessImage,
  hasVisibleCubeFace,
  type FaceCaptureResult,
} from '../vision/faceDetection'
import {
  computeBackgroundGains,
  extractBackgroundColor,
  faceBoundsForMode,
} from '../vision/faceSampling'
import { NEUTRAL_GAINS } from '../vision/colorMath'
import { type RGB, type SamplingGeometry } from '../vision/stickerColorGeometry'

export type CaptureMode = 'cv' | 'guide'

interface PhotoReadOptions {
  size: number
  mode: CaptureMode
  sampling: SamplingGeometry
  palette?: Record<string, RGB>
}

export function captureCameraPhoto(
  video: HTMLVideoElement,
  options: PhotoReadOptions & { backgrounds: Record<string, RGB | null> },
): FaceCaptureResult {
  const canvas = document.createElement('canvas')
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  const context = canvas.getContext('2d')
  if (!context || !canvas.width || !canvas.height)
    throw new Error('Camera frame unavailable')
  context.drawImage(video, 0, 0)

  const geometry = options.mode === 'cv' ? 'aligned' : 'fixed'
  const bounds = faceBoundsForMode(canvas, options.size, geometry)
  if (
    options.mode === 'cv' &&
    (!bounds.gridFound ||
      !hasVisibleCubeFace(canvas, options.size, bounds, true))
  ) {
    throw new Error(
      bounds.needsRecentering
        ? 'Grid does not reach the face edge. Move the cube toward the center and try again.'
        : 'No cube face detected. Show the face clearly or choose Guide grid.',
    )
  }

  const background = extractBackgroundColor(canvas, bounds)
  const gains = background
    ? (computeBackgroundGains({
        ...options.backgrounds,
        current: background,
      })?.current ?? NEUTRAL_GAINS)
    : NEUTRAL_GAINS
  return captureAndProcessCanvas(
    canvas,
    options.size,
    gains,
    options.sampling,
    options.palette,
    geometry,
    bounds,
  )
}

export async function importCapturePhoto(
  file: File,
  options: PhotoReadOptions,
): Promise<FaceCaptureResult> {
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('Could not load image file'))
      image.src = url
    })
    return captureAndProcessImage(
      image,
      options.size,
      NEUTRAL_GAINS,
      options.sampling,
      options.palette,
      options.mode === 'cv' ? 'aligned' : 'fixed',
    )
  } finally {
    URL.revokeObjectURL(url)
  }
}

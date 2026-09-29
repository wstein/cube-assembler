import { finishRecalibration } from '../../core/capture/CaptureFinalization.gen'

export { finishReview } from '../../core/capture/CaptureFinalization.gen'
import type { FaceCaptureData } from './captureTypes'
import { computeBackgroundGains } from '../vision/faceSampling'
import { runGlobalWhiteBalance } from './captureRecalibration'
import { type RGB, type SamplingGeometry } from '../vision/stickerColorGeometry'
import type { ColorProfile } from '../profiles/profileSettings'

interface CaptureFinalizationOptions {
  faces: Record<string, FaceCaptureData>
  order: readonly string[]
  size: number
  sampling: SamplingGeometry
  automatic: boolean
  palette?: Record<string, RGB>
  autoProfiles: ColorProfile[]
  colorProfile: ColorProfile
  glareToWarn: (glare: Array<{ face: string }>) => string[]
}

export function captureBackgroundGains(
  faces: Record<string, FaceCaptureData>,
  order: readonly string[],
) {
  return computeBackgroundGains(
    Object.fromEntries(
      order.map((face) => [face, faces[face].backgroundColor]),
    ),
  )
}

// Re-read all six photos together (per pixel, here), then compare
// Automatic's latest preview with the palette learned from this capture
// (src/core/capture/CaptureFinalization.res). The caller keeps the results
// provisional until the assembled cube is approved.
export async function recalibrateCapture(
  options: CaptureFinalizationOptions,
  faceGains: ReturnType<typeof computeBackgroundGains>,
) {
  const { faces, order, size, sampling, automatic, palette } = options
  const images = Object.fromEntries(
    order.map((face) => [face, faces[face].croppedImage!]),
  )
  const measured = await runGlobalWhiteBalance(
    images,
    size,
    faceGains ?? undefined,
    sampling,
    automatic ? undefined : palette,
  )
  return finishRecalibration({ ...options, order: [...order] }, measured)
}

import { finishRecalibration } from '../core/capture/CaptureFinalization.gen'
import type { FaceCaptureData } from './captureTypes'
import type { AutomaticResolution } from './colorProfileLearning'
import {
  computeBackgroundGains,
  runGlobalWhiteBalance,
  type RGB,
  type SamplingGeometry,
} from './imageProcessing'
import type { ColorProfile, UsedColorProfile } from './profileSettings'

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
  const result = finishRecalibration(
    { ...options, order: [...order] } as Parameters<
      typeof finishRecalibration
    >[0],
    measured as Parameters<typeof finishRecalibration>[1],
  )
  return {
    ...result,
    finalFaces: result.finalFaces as unknown as Record<string, FaceCaptureData>,
    resolution: result.resolution as AutomaticResolution | null,
    resolvedProfile: result.resolvedProfile as UsedColorProfile | null,
  }
}

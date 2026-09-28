import type { FaceCaptureData } from './captureTypes'
import {
  profileColorFitPercent,
  resolveAutomaticProfile,
} from './colorProfileLearning'
import { colorsUnderWhite } from './colorProfileReview'
import {
  classifyAcrossFaces,
  computeBackgroundGains,
  runGlobalWhiteBalance,
  type RGB,
  type SamplingGeometry,
} from './imageProcessing'
import {
  captureColorProfileSnapshot,
  resolvedColorProfileSnapshot,
  type ColorProfile,
} from './profileSettings'

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

// Re-read all six photos together, then compare Automatic's latest preview
// with the palette learned from this capture. The caller keeps the results
// provisional until the assembled cube is approved.
export async function recalibrateCapture(
  options: CaptureFinalizationOptions,
  faceGains: ReturnType<typeof computeBackgroundGains>,
) {
  const {
    faces,
    order,
    size,
    sampling,
    automatic,
    palette,
    autoProfiles,
    colorProfile,
    glareToWarn,
  } = options
  const images = Object.fromEntries(
    order.map((face) => [face, faces[face].croppedImage!]),
  )
  let wb = await runGlobalWhiteBalance(
    images,
    size,
    faceGains ?? undefined,
    sampling,
    automatic ? undefined : palette,
  )
  const latestPreview = order
    .map((face) => faces[face])
    .filter((data) => data?.previewColorProfile)
    .sort((a, b) => b.timestamp - a.timestamp)[0]?.previewColorProfile
  const resolution =
    automatic && wb.learned
      ? resolveAutomaticProfile(
          autoProfiles,
          wb.learned.colors,
          latestPreview?.id ?? null,
        )
      : null
  const matched = resolution?.profile ?? null
  const compared = matched ?? (!automatic ? colorProfile : null)
  const colorFit =
    compared && wb.learned
      ? profileColorFitPercent(compared.colors, wb.learned.colors)
      : undefined
  // Profiles are compared on colors balanced against this capture's White.
  const matchedReference =
    matched && wb.learned
      ? colorsUnderWhite(matched.colors, wb.learned.colors.W)
      : null
  if (matchedReference) wb = classifyAcrossFaces(wb.faces, matchedReference)

  const reference = matchedReference ?? (automatic ? null : (palette ?? null))
  const resolvedProfile = automatic
    ? matched
      ? resolvedColorProfileSnapshot(matched, 'automatic', colorFit)
      : wb.learned
        ? captureColorProfileSnapshot(wb.learned.colors)
        : null
    : resolvedColorProfileSnapshot(colorProfile, 'manual', colorFit)
  const mixedUp = wb.learned?.mixedUpColors ?? []
  const confidences = order.flatMap(
    (face) => wb.faces[face]?.cellConfidences?.flat() ?? [],
  )
  const pendingPalette = wb.learned
    ? {
        colors: wb.learned.colors,
        confidentFraction: confidences.length
          ? confidences.filter((value) => value >= 0.7).length /
            confidences.length
          : 0,
        recalibrated: wb.applied,
      }
    : null
  let finalFaces = faces
  if (wb.applied) {
    finalFaces = { ...faces }
    for (const face of order) {
      const detected = wb.faces[face]
      finalFaces[face] = {
        ...finalFaces[face],
        colors: detected.colors,
        detectedColors: detected.colors,
        cellConfidences: detected.cellConfidences,
        cellColors: detected.cellColors,
        cellLookalikes: detected.cellLookalikes,
        confidence: detected.confidence,
      }
    }
  }
  return {
    finalFaces,
    applied: wb.applied,
    glare: glareToWarn(wb.glare),
    mixedUp,
    learnedPalette: wb.learned?.colors ?? null,
    pendingPalette,
    resolution,
    reference,
    resolvedProfile,
  }
}

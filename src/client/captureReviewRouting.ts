export interface CaptureReviewFace {
  colors: string[][]
  detectedColors?: string[][]
  cellConfidences?: number[][]
  cellLookalikes?: (string | null)[][]
  confidence: number
}

const HIGH_CONFIDENCE = 0.8

export function readyAssemblyAfterCapture(
  faces: Record<string, CaptureReviewFace | undefined>,
  order: readonly string[],
  glareFaces: readonly string[],
  mixedUpColors: readonly string[],
): OrientationSolution | null {
  if (!highConfidenceColorReadings(faces, order, glareFaces, mixedUpColors))
    return null
  const faceData = Object.fromEntries(
    order.map((face) => [face, faces[face]!.colors]),
  )
  const solution = solveFaceOrientations(faceData)
  return canSkipColorReview(
    faces,
    order,
    Boolean(solution?.fullyValid),
    glareFaces,
    mixedUpColors,
  )
    ? solution
    : null
}

export function canSkipColorReview(
  faces: Record<string, CaptureReviewFace | undefined>,
  order: readonly string[],
  assembledValid: boolean,
  glareFaces: readonly string[],
  mixedUpColors: readonly string[],
): boolean {
  return (
    assembledValid &&
    highConfidenceColorReadings(faces, order, glareFaces, mixedUpColors)
  )
}

export function highConfidenceColorReadings(
  faces: Record<string, CaptureReviewFace | undefined>,
  order: readonly string[],
  glareFaces: readonly string[],
  mixedUpColors: readonly string[],
): boolean {
  if (glareFaces.length > 0 || mixedUpColors.length > 0) return false

  const size = faces[order[0]]?.colors.length ?? 0
  if (size === 0) return false
  return order.every((key) => {
    const face = faces[key]
    if (
      !face ||
      face.confidence < HIGH_CONFIDENCE ||
      face.colors.length !== size ||
      face.detectedColors?.length !== size ||
      face.cellConfidences?.length !== size ||
      face.cellLookalikes?.length !== size
    )
      return false
    return face.colors.every(
      (row, r) =>
        row.length === size &&
        face.detectedColors?.[r]?.length === size &&
        face.cellConfidences?.[r]?.length === size &&
        face.cellLookalikes?.[r]?.length === size &&
        row.every(
          (color, c) =>
            face.detectedColors?.[r]?.[c] === color &&
            (face.cellConfidences?.[r]?.[c] ?? 0) >= HIGH_CONFIDENCE &&
            face.cellLookalikes?.[r]?.[c] === null,
        ),
    )
  })
}
import { solveFaceOrientations, type OrientationSolution } from './cubeAssembly'

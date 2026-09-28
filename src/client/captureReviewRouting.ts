import {
  checkGuidedCenters,
  solveFaceOrientations,
  solveGuidedCapture,
  type FaceKey,
  type GuidedArrangement,
  type GuidedCenterIssue,
  type OrientedCandidate,
  type OrientationSolution,
} from '../cube/cubeAssembly'
import {
  faceContentKey,
  preferredGuidedArrangementIndex,
} from '../cube/orientationWizard'

export interface CaptureReviewFace {
  colors: string[][]
  detectedColors?: string[][]
  cellConfidences?: number[][]
  cellLookalikes?: (string | null)[][]
  confidence: number
}

const HIGH_CONFIDENCE = 0.8

export interface CaptureApproval {
  candidates: OrientedCandidate[]
  arrangements?: GuidedArrangement[]
  valid: boolean
  note?: string
  suggestedFrom?: number
  fallback: OrientationSolution | null
  page?: number
}

export type CaptureReviewPlan =
  | { kind: 'approval'; approval: CaptureApproval }
  | { kind: 'wizard'; remaining: OrientedCandidate[]; truncated: boolean }
  | { kind: 'choose'; candidate: OrientedCandidate }
  | { kind: 'notice'; message: string }

// Decide what the user should see after checking sticker colors. The UI owns
// the dialogs; this module owns the guided and free-search fallback order.
export function planCaptureReview(
  faces: Record<string, string[][]>,
  order: readonly string[],
  guided: boolean,
  describeIssue: (issue: GuidedCenterIssue) => string,
  precomputedFree?: OrientationSolution | null,
): CaptureReviewPlan {
  const free =
    precomputedFree === undefined
      ? solveFaceOrientations(faces)
      : precomputedFree

  if (guided) {
    const [s1, s2, s3, s4, cap1, cap2] = order.map((face) => faces[face])
    const solution = solveGuidedCapture({
      sides: [s1, s2, s3, s4],
      caps: [cap1, cap2],
    })
    if (solution?.fullyValid) {
      const preferred = preferredGuidedArrangementIndex(solution.arrangements)
      // Keep every guided fit available after "No" even if the free search
      // stopped before reaching it.
      const seen = new Set<string>()
      const alternatives = [
        solution.alternatives[preferred],
        ...solution.alternatives,
        ...(free?.alternatives ?? []),
      ].filter((candidate) => {
        const key = order
          .map((face) => faceContentKey(candidate.faces[face as FaceKey]))
          .join('|')
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      return {
        kind: 'approval',
        approval: {
          candidates: [solution.alternatives[preferred]],
          arrangements: [solution.arrangements[preferred]],
          valid: true,
          suggestedFrom: solution.alternatives.length,
          fallback: {
            ...(free ?? solution),
            alternatives,
            truncated: Boolean(free?.truncated || solution.truncated),
          },
        },
      }
    }
    const issue = checkGuidedCenters(order.map((face) => faces[face]))[0]
    const why = issue
      ? describeIssue(issue)
      : "These photos don't fit together the way they were taken - the cube may have been turned the other way partway through, or tipped over."
    if (free?.fullyValid)
      return {
        kind: 'approval',
        approval: {
          candidates: free.alternatives,
          valid: true,
          note: `${why} They do fit together another way:`,
          fallback: null,
        },
      }
    const closest = solution ?? free
    if (closest)
      return {
        kind: 'approval',
        approval: {
          candidates: [closest.alternatives[0]],
          valid: false,
          note: `${why} No arrangement makes a valid cube, so a color was probably misread - check the colors, or use the closest match anyway.`,
          fallback: free,
        },
      }
  }

  if (!free)
    return {
      kind: 'notice',
      message:
        "⚠️ Couldn't work out how the faces fit together (a duplicate or unreadable center?) - check the colors, or retake a face.",
    }
  if (!free.fullyValid)
    return {
      kind: 'approval',
      approval: {
        candidates: [free.alternatives[0]],
        valid: false,
        note: 'No arrangement of these faces makes a valid cube, so a color was probably misread - check the colors, or use the closest match anyway.',
        fallback: free,
      },
    }
  if (free.alternatives.length > 1)
    return {
      kind: 'wizard',
      remaining: free.alternatives,
      truncated: free.truncated,
    }
  return { kind: 'choose', candidate: free.alternatives[0] }
}

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

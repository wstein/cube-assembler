// What the user sees after checking sticker colors - the guided and
// free-search fallback order: typed entry point for
// src/core/capture/CaptureReviewRouting.res.
import {
  canSkipColorReview as canSkipColorReviewRes,
  highConfidenceColorReadings as highConfidenceColorReadingsRes,
  planCaptureReview as planCaptureReviewRes,
  readyAssemblyAfterCapture as readyAssemblyAfterCaptureRes,
  rejectAlternatives as rejectAlternativesRes,
} from '../core/capture/CaptureReviewRouting.gen'
import type {
  GuidedArrangement,
  GuidedCenterIssue,
  OrientedCandidate,
  OrientationSolution,
} from '../cube/cubeAssembly'

export interface CaptureReviewFace {
  colors: string[][]
  detectedColors?: string[][]
  cellConfidences?: number[][]
  cellLookalikes?: (string | null)[][]
  confidence: number
}

export interface CaptureApproval {
  candidates: OrientedCandidate[]
  arrangements?: GuidedArrangement[]
  valid: boolean
  note?: string
  suggestedFrom?: number
  fallback: OrientationSolution | null
  page?: number
}

// The fallback's arrangements other than the ones already turned down.
export function rejectAlternatives(
  approval: CaptureApproval,
): OrientedCandidate[] {
  return rejectAlternativesRes(approval) as OrientedCandidate[]
}

export type CaptureReviewPlan =
  | { kind: 'approval'; approval: CaptureApproval }
  | { kind: 'wizard'; remaining: OrientedCandidate[]; truncated: boolean }
  | { kind: 'choose'; candidate: OrientedCandidate }
  | { kind: 'notice'; message: string }

// Decide what the user should see after checking sticker colors.
export function planCaptureReview(
  faces: Record<string, string[][]>,
  order: readonly string[],
  guided: boolean,
  describeIssue: (issue: GuidedCenterIssue) => string,
  precomputedFree?: OrientationSolution | null,
): CaptureReviewPlan {
  return planCaptureReviewRes(
    faces,
    [...order],
    guided,
    describeIssue,
    precomputedFree,
  ) as CaptureReviewPlan
}

// The solved cube when the capture needs no color review, else null.
export function readyAssemblyAfterCapture(
  faces: Record<string, CaptureReviewFace | undefined>,
  order: readonly string[],
  glareFaces: readonly string[],
  mixedUpColors: readonly string[],
): OrientationSolution | null {
  return readyAssemblyAfterCaptureRes(
    faces as Record<string, CaptureReviewFace>,
    [...order],
    [...glareFaces],
    [...mixedUpColors],
  ) as OrientationSolution | null
}

export function canSkipColorReview(
  faces: Record<string, CaptureReviewFace | undefined>,
  order: readonly string[],
  assembledValid: boolean,
  glareFaces: readonly string[],
  mixedUpColors: readonly string[],
): boolean {
  return canSkipColorReviewRes(
    faces as Record<string, CaptureReviewFace>,
    [...order],
    assembledValid,
    [...glareFaces],
    [...mixedUpColors],
  )
}

// Every sticker read confidently, as detected, with no lookalike, and no
// glare or mixed-up colors.
export function highConfidenceColorReadings(
  faces: Record<string, CaptureReviewFace | undefined>,
  order: readonly string[],
  glareFaces: readonly string[],
  mixedUpColors: readonly string[],
): boolean {
  return highConfidenceColorReadingsRes(
    faces as Record<string, CaptureReviewFace>,
    [...order],
    [...glareFaces],
    [...mixedUpColors],
  )
}

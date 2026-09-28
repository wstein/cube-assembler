// Guided capture's steps and their texts: typed entry point for
// src/core/capture/CaptureSteps.res.
import {
  captureInstruction as captureInstructionRes,
  captureSteps,
  describeCenterIssue as describeCenterIssueRes,
  faceDisplayLabel,
  faceOrder,
  faceShortLabel,
  glareFacesToWarn as glareFacesToWarnRes,
} from '../core/capture/CaptureSteps.gen'
import type { GuidedCenterIssue } from '../cube/cubeAssembly'

export const FACE_ORDER: string[] = faceOrder

// The 4 sides in turn, then top and bottom; slot U is Side 1, R Side 2, ...
export const CAPTURE_STEPS: Array<{
  label: string
  short: string
  instruction: string
}> = captureSteps

export function captureInstruction(step: number, mirrored: boolean): string {
  return captureInstructionRes(step, mirrored)
}

// A capture mistake read from odd-size centers, in words.
export function describeCenterIssue(issue: GuidedCenterIssue): string {
  return describeCenterIssueRes(issue)
}

export const FACE_DISPLAY_LABEL: Record<string, string> = faceDisplayLabel

// The faces to name in the glare warning, or none if too few stickers are
// washed out to warn about.
export function glareFacesToWarn(glare: Array<{ face: string }>): string[] {
  return glareFacesToWarnRes(glare)
}

export const FACE_SHORT_LABEL: Record<string, string> = faceShortLabel

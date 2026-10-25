// Auto capture waits for matching good live detections, then holds while
// the person turns the cube: typed entry point for
// src/core/capture/AutoCapture.res.
import {
  autoCaptureHeld as autoCaptureHeldRes,
  autoCaptureStableFrames,
  nextAutoCaptureProgress as nextAutoCaptureProgressRes,
  turnCueCooldownMs,
} from '../../core/capture/AutoCapture.gen'

export const AUTO_CAPTURE_STABLE_FRAMES = autoCaptureStableFrames
export const TURN_CUE_COOLDOWN_MS = turnCueCooldownMs

// Whether auto capture still waits for the cube to be turned after a
// capture made at `lastCaptureAt` (null: none, or Continue was pressed).
export function autoCaptureHeld(
  lastCaptureAt: number | null,
  now: number,
): boolean {
  return autoCaptureHeldRes(lastCaptureAt, now)
}

export interface AutoCaptureSample {
  colors: string[][]
  confidence: number
  centerX: number
  centerY: number
  size: number
  angle: number
}

export interface AutoCaptureProgress {
  first: AutoCaptureSample
  frames: number
}

// Counts frames of the same face in a row.
export function nextAutoCaptureProgress(
  previous: AutoCaptureProgress | null,
  sample: AutoCaptureSample | null,
): AutoCaptureProgress | null {
  return nextAutoCaptureProgressRes(previous, sample)
}

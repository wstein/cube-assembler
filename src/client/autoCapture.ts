// Auto capture waits for matching good live detections, and the turn cue
// for the old face to leave: typed entry point for
// src/core/capture/AutoCapture.res.
import {
  autoCaptureStableFrames,
  nextAutoCaptureProgress as nextAutoCaptureProgressRes,
  nextTurnCue as nextTurnCueRes,
  turnCueAbsentFrames,
  turnCueClearFrames,
  turnCueCleared as turnCueClearedRes,
  turnCueStart,
  turnPoseChanged as turnPoseChangedRes,
} from '../core/capture/AutoCapture.gen'

export const AUTO_CAPTURE_STABLE_FRAMES = autoCaptureStableFrames
export const TURN_CUE_CLEAR_FRAMES = turnCueClearFrames

export interface TurnCuePose {
  centerX: number
  centerY: number
  size: number
  angle: number
}

// Only a substantial change of where the face sits counts as a turn.
export function turnPoseChanged(
  anchor: TurnCuePose,
  current: TurnCuePose,
): boolean {
  return turnPoseChangedRes(anchor, current)
}

export const TURN_CUE_ABSENT_FRAMES = turnCueAbsentFrames

export interface TurnCueState {
  // Frames showing a different face since the old one was last seen.
  departed: number
  // Consecutive frames without a usable face.
  missing: number
}

export const TURN_CUE_START: TurnCueState = turnCueStart

export function nextTurnCue(
  state: TurnCueState,
  visibleColors: string[][] | null,
  lastCapturedColors: string[][],
  poseChanged = false,
): TurnCueState {
  return nextTurnCueRes(state, visibleColors, lastCapturedColors, poseChanged)
}

export function turnCueCleared(state: TurnCueState): boolean {
  return turnCueClearedRes(state)
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

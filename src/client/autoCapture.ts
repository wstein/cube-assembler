// Matching good live detections must agree before the camera captures a face.
import { findCapturedFaceMatch } from './cubeAssembly'

export const AUTO_CAPTURE_STABLE_FRAMES = 5
export const AUTO_CAPTURE_MIN_CONFIDENCE = 0.6
export const TURN_CUE_CLEAR_FRAMES = 3

// The turn cue stays up while the captured pattern is still in view. A brief
// detection miss must not dismiss it while the user is holding the same face.
export function nextTurnCueClearFrames(previous: number, visibleColors: string[][] | null, lastCapturedColors: string[][]): number {
  const stillLastFace = visibleColors && findCapturedFaceMatch(
    [{ colors: lastCapturedColors }], { colors: visibleColors }
  ) !== null
  return stillLastFace ? 0 : Math.min(previous + 1, TURN_CUE_CLEAR_FRAMES)
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

function colorDifference(a: string[][], b: string[][]): number {
  if (a.length !== b.length) return Infinity
  let different = 0
  for (let row = 0; row < a.length; row++) {
    if (a[row].length !== b[row].length) return Infinity
    for (let col = 0; col < a[row].length; col++) {
      if (a[row][col] !== b[row][col]) different++
    }
  }
  return different
}

export function nextAutoCaptureProgress(
  previous: AutoCaptureProgress | null,
  sample: AutoCaptureSample | null
): AutoCaptureProgress | null {
  if (!sample || sample.confidence < AUTO_CAPTURE_MIN_CONFIDENCE) return previous
  const cells = sample.colors.length ** 2
  if (!previous) return { first: sample, frames: 1 }
  const first = previous.first
  const stable = colorDifference(sample.colors, first.colors) <= Math.max(1, Math.floor(cells * 0.04))
  return stable ? { first, frames: previous.frames + 1 } : { first: sample, frames: 1 }
}

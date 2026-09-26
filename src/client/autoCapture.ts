// Matching good live detections must agree before the camera captures a face.
import { findCapturedFaceMatch } from './cubeAssembly'

export const AUTO_CAPTURE_STABLE_FRAMES = 5
export const AUTO_CAPTURE_MIN_CONFIDENCE = 0.6
export const TURN_CUE_CLEAR_FRAMES = 3

export interface TurnCuePose {
  centerX: number
  centerY: number
  size: number
  angle: number
}

// A same-colored side can still be a new side. Only a substantial change
// counts; small framing jitter while holding the old face does not.
export function turnPoseChanged(anchor: TurnCuePose, current: TurnCuePose): boolean {
  const angle = Math.abs(Math.atan2(Math.sin(current.angle - anchor.angle), Math.cos(current.angle - anchor.angle)))
  return Math.hypot(current.centerX - anchor.centerX, current.centerY - anchor.centerY) > anchor.size * 0.12
    || Math.abs(current.size - anchor.size) > anchor.size * 0.15
    || angle > Math.PI / 9
}

// The turn cue stays up while the captured pattern is still in view. A brief
// detection miss must not dismiss it while the user is holding the same face.
export function nextTurnCueClearFrames(previous: number, visibleColors: string[][] | null, lastCapturedColors: string[][], poseChanged = false): number {
  const stillLastFace = visibleColors && findCapturedFaceMatch(
    [{ colors: lastCapturedColors }], { colors: visibleColors }
  ) !== null
  return stillLastFace && !poseChanged ? 0 : Math.min(previous + 1, TURN_CUE_CLEAR_FRAMES)
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

// With the cube size on Auto, frames vote on it before the first face
// (estimateFaceGridSize; null when a frame names none). Only a size most
// recent frames agree on is taken, and auto capture waits for it, so it
// never photographs a 4x4 as a 3x3. A size picked from the list is final.
export const SIZE_VOTE_FRAMES = 10
export const SIZE_VOTE_AGREE = 8

export function nextSizeVotes(votes: readonly (number | null)[], estimate: number | null): Array<number | null> {
  return [...votes, estimate].slice(-SIZE_VOTE_FRAMES)
}

export function agreedSize(votes: readonly (number | null)[]): number | null {
  const counts = new Map<number, number>()
  for (const vote of votes) if (vote !== null) counts.set(vote, (counts.get(vote) ?? 0) + 1)
  for (const [size, count] of counts) if (count >= SIZE_VOTE_AGREE) return size
  return null
}

export interface SizeDetectionState {
  autoSize: boolean
  // The size agreed on since capture started, if any.
  detectedSize: number | null
  facesCaptured: number
  // Detect face mode; Guide grid finds no face outline to measure.
  detectFace: boolean
}

export function sizeDetectionActive({ autoSize, detectedSize, facesCaptured, detectFace }: SizeDetectionState): boolean {
  return autoSize && detectFace && detectedSize === null && facesCaptured === 0
}

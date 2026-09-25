// Consecutive live detections must agree before the camera captures a face.
export const AUTO_CAPTURE_STABLE_FRAMES = 5
export const AUTO_CAPTURE_MIN_CONFIDENCE = 0.65

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
  sample: AutoCaptureSample | null,
  lastCapturedColors: string[][] | null
): AutoCaptureProgress | null {
  if (!sample || sample.confidence < AUTO_CAPTURE_MIN_CONFIDENCE) return null
  const cells = sample.colors.length ** 2
  // A different crop of the previous face must not fill the next slot.
  if (lastCapturedColors && colorDifference(sample.colors, lastCapturedColors) <= Math.max(1, Math.floor(cells * 0.08))) return null
  if (!previous) return { first: sample, frames: 1 }
  const first = previous.first
  const stable = colorDifference(sample.colors, first.colors) <= Math.max(1, Math.floor(cells * 0.04))
    && Math.hypot(sample.centerX - first.centerX, sample.centerY - first.centerY) <= first.size * 0.03
    && Math.abs(sample.size - first.size) <= first.size * 0.04
    && Math.abs(sample.angle - first.angle) <= Math.PI / 45
  return stable ? { first, frames: previous.frames + 1 } : { first: sample, frames: 1 }
}

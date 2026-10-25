import { describe, expect, it } from 'vitest'
import {
  AUTO_CAPTURE_STABLE_FRAMES,
  nextAutoCaptureProgress,
  type AutoCaptureSample,
} from '../src/client/capture/autoCapture'

const sample = (color = 'R', x = 100, confidence = 0.9): AutoCaptureSample => ({
  colors: Array.from({ length: 3 }, () => Array(3).fill(color)),
  confidence,
  centerX: x,
  centerY: 100,
  size: 300,
  angle: 0,
})

describe('automatic face capture stability', () => {
  it('waits for five matching good frames and pauses after a missed detection', () => {
    let progress = null
    for (let i = 1; i <= AUTO_CAPTURE_STABLE_FRAMES; i++) {
      progress = nextAutoCaptureProgress(progress, sample())
      expect(progress?.frames).toBe(i)
    }
    expect(nextAutoCaptureProgress(progress, null)?.frames).toBe(
      AUTO_CAPTURE_STABLE_FRAMES,
    )
    expect(nextAutoCaptureProgress(null, sample('R', 100, 0.4))).toBeNull()
  })

  it('ignores motion but resets on changed stickers', () => {
    const first = nextAutoCaptureProgress(null, sample())
    expect(nextAutoCaptureProgress(first, sample('R', 120))?.frames).toBe(2)
    expect(nextAutoCaptureProgress(first, sample('G'))?.frames).toBe(1)
    expect(nextAutoCaptureProgress(null, sample())?.frames).toBe(1)
    expect(nextAutoCaptureProgress(null, sample('G'))?.frames).toBe(1)
  })

  it('counts 60% confidence and pauses on weaker reads', () => {
    const first = nextAutoCaptureProgress(null, sample('R', 100, 0.6))
    expect(first?.frames).toBe(1)
    expect(nextAutoCaptureProgress(first, sample('R', 100, 0.59))?.frames).toBe(
      1,
    )
    expect(nextAutoCaptureProgress(first, sample('R', 100, 0.6))?.frames).toBe(
      2,
    )
  })
})

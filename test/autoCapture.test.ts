import { describe, expect, it } from 'vitest'
import { AUTO_CAPTURE_STABLE_FRAMES, TURN_CUE_CLEAR_FRAMES, nextAutoCaptureProgress, nextTurnCueClearFrames, type AutoCaptureSample } from '../src/client/autoCapture'

const sample = (color = 'R', x = 100, confidence = 0.9): AutoCaptureSample => ({
  colors: Array.from({ length: 3 }, () => Array(3).fill(color)),
  confidence,
  centerX: x,
  centerY: 100,
  size: 300,
  angle: 0,
})

describe('automatic face capture stability', () => {
  it('waits for five matching frames and resets after a missed detection', () => {
    let progress = null
    for (let i = 1; i <= AUTO_CAPTURE_STABLE_FRAMES; i++) {
      progress = nextAutoCaptureProgress(progress, sample())
      expect(progress?.frames).toBe(i)
    }
    expect(nextAutoCaptureProgress(progress, null)).toBeNull()
    expect(nextAutoCaptureProgress(null, sample('R', 100, 0.4))).toBeNull()
  })

  it('resets on motion or changed stickers but permits a repeated pattern after a turn', () => {
    const first = nextAutoCaptureProgress(null, sample())
    expect(nextAutoCaptureProgress(first, sample('R', 120))?.frames).toBe(1)
    expect(nextAutoCaptureProgress(first, sample('G'))?.frames).toBe(1)
    // Once the turn cue has seen the previous face leave, a different side
    // may have exactly the same color grid.
    expect(nextAutoCaptureProgress(null, sample())?.frames).toBe(1)
    expect(nextAutoCaptureProgress(null, sample('G'))?.frames).toBe(1)
  })

  it('requires at least 80% confidence on every stable frame', () => {
    const first = nextAutoCaptureProgress(null, sample('R', 100, 0.8))
    expect(first?.frames).toBe(1)
    expect(nextAutoCaptureProgress(first, sample('R', 100, 0.79))).toBeNull()
    expect(nextAutoCaptureProgress(null, sample('R', 100, 0.8))?.frames).toBe(1)
  })
})

describe('turn cue dismissal', () => {
  it('waits until the last face has left for several consecutive frames', () => {
    const last = [['R', 'G'], ['B', 'Y']]
    const rotated = [['B', 'R'], ['Y', 'G']]
    expect(nextTurnCueClearFrames(2, rotated, last)).toBe(0)
    let clearFrames = 0
    for (let i = 1; i <= TURN_CUE_CLEAR_FRAMES; i++) {
      clearFrames = nextTurnCueClearFrames(clearFrames, null, last)
      expect(clearFrames).toBe(i)
    }
    expect(nextTurnCueClearFrames(clearFrames, null, last)).toBe(TURN_CUE_CLEAR_FRAMES)
    expect(nextTurnCueClearFrames(2, last, last)).toBe(0)
  })

  it('accepts a confidently detected different face as departure', () => {
    const last = [['R', 'R'], ['R', 'R']]
    const next = [['G', 'G'], ['G', 'G']]
    expect(nextTurnCueClearFrames(0, next, last)).toBe(1)
    expect(nextTurnCueClearFrames(1, next, last)).toBe(2)
  })

  it('keeps the cue for a near match on a larger face', () => {
    const last = Array.from({ length: 4 }, () => Array(4).fill('R'))
    const sameWithMisreads = last.map((row) => [...row])
    sameWithMisreads[0][0] = 'O'
    sameWithMisreads[1][1] = 'O'
    expect(nextTurnCueClearFrames(2, sameWithMisreads, last)).toBe(0)
  })

  it('allows five stable frames of an identical-looking side after the old one leaves', () => {
    const face = sample().colors
    expect(nextTurnCueClearFrames(0, face, face)).toBe(0)
    let clearFrames = 0
    for (let i = 0; i < TURN_CUE_CLEAR_FRAMES; i++) {
      clearFrames = nextTurnCueClearFrames(clearFrames, null, face)
    }
    expect(clearFrames).toBe(TURN_CUE_CLEAR_FRAMES)
    let progress = null
    for (let i = 1; i <= AUTO_CAPTURE_STABLE_FRAMES; i++) {
      progress = nextAutoCaptureProgress(progress, sample())
      expect(progress?.frames).toBe(i)
    }
  })
})

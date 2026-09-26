import { describe, expect, it } from 'vitest'
import { AUTO_CAPTURE_STABLE_FRAMES, SIZE_VOTE_AGREE, SIZE_VOTE_FRAMES, TURN_CUE_CLEAR_FRAMES, agreedSize, nextAutoCaptureProgress, nextSizeVotes, nextTurnCueClearFrames, sizeDetectionActive, turnPoseChanged, type AutoCaptureSample } from '../src/client/autoCapture'

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
    expect(nextAutoCaptureProgress(progress, null)?.frames).toBe(AUTO_CAPTURE_STABLE_FRAMES)
    expect(nextAutoCaptureProgress(null, sample('R', 100, 0.4))).toBeNull()
  })

  it('ignores motion but resets on changed stickers', () => {
    const first = nextAutoCaptureProgress(null, sample())
    expect(nextAutoCaptureProgress(first, sample('R', 120))?.frames).toBe(2)
    expect(nextAutoCaptureProgress(first, sample('G'))?.frames).toBe(1)
    // Once the turn cue has seen the previous face leave, a different side
    // may have exactly the same color grid.
    expect(nextAutoCaptureProgress(null, sample())?.frames).toBe(1)
    expect(nextAutoCaptureProgress(null, sample('G'))?.frames).toBe(1)
  })

  it('counts 60% confidence and pauses on weaker reads', () => {
    const first = nextAutoCaptureProgress(null, sample('R', 100, 0.6))
    expect(first?.frames).toBe(1)
    expect(nextAutoCaptureProgress(first, sample('R', 100, 0.59))?.frames).toBe(1)
    expect(nextAutoCaptureProgress(first, sample('R', 100, 0.6))?.frames).toBe(2)
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

  it('accepts a substantial turn even when sticker letters look identical', () => {
    const face = sample().colors
    const anchor = { centerX: 100, centerY: 100, size: 300, angle: 0 }
    expect(turnPoseChanged(anchor, { ...anchor, centerX: 110 })).toBe(false)
    expect(turnPoseChanged(anchor, { ...anchor, centerX: 150 })).toBe(true)
    expect(turnPoseChanged(anchor, { ...anchor, angle: Math.PI / 4 })).toBe(true)
    let clearFrames = 0
    for (let i = 0; i < TURN_CUE_CLEAR_FRAMES; i++) clearFrames = nextTurnCueClearFrames(clearFrames, face, face, true)
    expect(clearFrames).toBe(TURN_CUE_CLEAR_FRAMES)
  })
})

describe('first-face cube size vote', () => {
  const vote = (estimates: Array<number | null>) => estimates.reduce<Array<number | null>>((votes, estimate) => nextSizeVotes(votes, estimate), [])

  it(`agrees on a size named in ${SIZE_VOTE_AGREE} of the last ${SIZE_VOTE_FRAMES} frames`, () => {
    expect(agreedSize(vote(Array(SIZE_VOTE_AGREE - 1).fill(4)))).toBeNull()
    expect(agreedSize(vote(Array(SIZE_VOTE_AGREE).fill(4)))).toBe(4)
    expect(agreedSize(vote([null, 4, 4, null, 4, 4, 4, 4, 4, 4]))).toBe(4)
  })

  it('agrees on nothing while frames name different sizes', () => {
    expect(agreedSize(vote([4, 4, 4, 4, 4, 5, 5, 4, 4, 5]))).toBeNull()
  })

  it(`remembers only the last ${SIZE_VOTE_FRAMES} frames`, () => {
    const votes = vote([...Array(SIZE_VOTE_FRAMES).fill(4), ...Array(3).fill(null)])
    expect(votes).toHaveLength(SIZE_VOTE_FRAMES)
    expect(agreedSize(votes)).toBeNull()
  })
})

describe('Auto cube size', () => {
  const state = { autoSize: true, detectedSize: null, facesCaptured: 0, detectFace: true }

  it('detects the size in Auto until one is agreed, before the first face', () => {
    expect(sizeDetectionActive(state)).toBe(true)
    expect(sizeDetectionActive({ ...state, detectedSize: 4 })).toBe(false)
    expect(sizeDetectionActive({ ...state, facesCaptured: 1 })).toBe(false)
  })

  it('never overrides a size picked from the list', () => {
    expect(sizeDetectionActive({ ...state, autoSize: false })).toBe(false)
  })

  it('needs Detect face - Guide grid has no face outline to measure', () => {
    expect(sizeDetectionActive({ ...state, detectFace: false })).toBe(false)
  })
})

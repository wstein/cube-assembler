import { describe, expect, it } from 'vitest'
import {
  autoCaptureHeld,
  turnCueCooldownMs,
} from '../src/core/capture/AutoCapture.gen'
import { liveFrameStep, startState } from '../src/core/capture/LiveCapture.gen'

const grid = (color: string) =>
  Array.from({ length: 3 }, () => Array<string>(3).fill(color))

const frame = (color: string) => ({
  bounds: {
    startX: 100,
    startY: 100,
    faceWidth: 300,
    faceHeight: 300,
    gridFound: true,
  },
  detection: {
    colors: grid(color),
    confidence: 0.95,
    cellConfidences: grid('x').map((row) => row.map(() => 1)),
    cellColors: grid('x').map((row) => row.map(() => ({ r: 0, g: 0, b: 0 }))),
  },
  visible: true,
  backgroundFound: true,
  colorProfileId: null,
})

const context = {
  detectFace: true,
  autoCapture: true,
  captureBusy: false,
  stableFrames: 3,
  turnCueShowing: false,
  autoCaptureHeld: false,
  provisionalProfileId: null,
}

// Runs the same face through `frames` live frames and tells at which one
// the photo is taken, if any.
function captureFrame(
  frames: number,
  extra: Partial<typeof context> = {},
): number | null {
  let state = startState()
  for (let i = 1; i <= frames; i++) {
    const step = liveFrameStep(state, frame('R'), { ...context, ...extra })
    if (step.capture) return i
    state = step.state
  }
  return null
}

describe('live capture trusts the person turning the cube', () => {
  it('takes the photo after the stable frames, whatever the colors are', () => {
    expect(captureFrame(10)).toBe(3)
  })

  it('does not take a photo while held after the last capture', () => {
    expect(captureFrame(10, { autoCaptureHeld: true })).toBeNull()
  })

  it('does not take a photo while the turn cue is showing', () => {
    expect(captureFrame(10, { turnCueShowing: true })).toBeNull()
  })

  it('does not look at the last capture or at captured faces', () => {
    const step = liveFrameStep(startState(), frame('R'), context)
    expect(Object.keys(step)).not.toContain('turnCueCleared')
    expect(Object.keys(step.view ?? {})).not.toContain('matchedSlot')
    expect(Object.keys(startState())).not.toContain('turnCue')
  })
})

describe('holding auto capture after a capture', () => {
  it('holds for the cooldown, then lets go', () => {
    expect(turnCueCooldownMs).toBe(3000)
    expect(autoCaptureHeld(1000, 1000 + 2999)).toBe(true)
    expect(autoCaptureHeld(1000, 1000 + 3000)).toBe(false)
  })

  it('does not hold without a capture', () => {
    expect(autoCaptureHeld(null, 5000)).toBe(false)
  })
})

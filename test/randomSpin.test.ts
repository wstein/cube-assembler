import { describe, expect, it } from 'vitest'
import { spinFrame, spinMs } from '../src/core/view/RandomSpin.gen'

describe('the Random State spin', () => {
  it('lasts about 450 ms', () => {
    expect(spinMs).toBe(450)
  })

  it('starts still and ends after one full turn', () => {
    expect(spinFrame(0)).toEqual({ angle: 0, swapped: false, finished: false })
    const end = spinFrame(spinMs)
    expect(end.angle).toBeCloseTo(2 * Math.PI, 12)
    expect(end.finished).toBe(true)
    expect(spinFrame(spinMs + 100).angle).toBeCloseTo(2 * Math.PI, 12)
  })

  it('eases in and out, so the middle is half a turn', () => {
    expect(spinFrame(spinMs / 2).angle).toBeCloseTo(Math.PI, 12)
    // Slow at the ends: a tenth of the time covers under a twentieth of
    // the turn.
    expect(spinFrame(spinMs / 10).angle).toBeLessThan((2 * Math.PI) / 20)
  })

  it('never turns back', () => {
    let last = -1
    for (let t = 0; t <= spinMs; t += 5) {
      const { angle } = spinFrame(t)
      expect(angle).toBeGreaterThanOrEqual(last)
      last = angle
    }
  })

  it('swaps the stickers at the midpoint, not before', () => {
    expect(spinFrame(spinMs / 2 - 1).swapped).toBe(false)
    expect(spinFrame(spinMs / 2).swapped).toBe(true)
    expect(spinFrame(spinMs).swapped).toBe(true)
  })

  it('treats a time before the start as the start', () => {
    expect(spinFrame(-30).angle).toBe(0)
  })
})

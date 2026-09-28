import { describe, expect, it } from 'vitest'
import { magneticEase } from '../src/client/turnFeel'

describe('turn feel', () => {
  it('starts at rest and ends exactly on the quarter turn', () => {
    expect(magneticEase(0)).toBe(0)
    expect(magneticEase(1)).toBe(1)
    expect(magneticEase(-0.2)).toBe(0)
    expect(magneticEase(1.4)).toBe(1)
  })

  it('holds back at first, like magnets letting go', () => {
    expect(magneticEase(0.1)).toBeLessThan(0.1)
  })

  it('snaps slightly past the turn and settles back', () => {
    const samples = Array.from({ length: 101 }, (_, i) => magneticEase(i / 100))
    const peak = Math.max(...samples)
    expect(peak).toBeGreaterThan(1.02)
    expect(peak).toBeLessThan(1.06)
    expect(samples.indexOf(peak)).toBeGreaterThan(70)
  })
})

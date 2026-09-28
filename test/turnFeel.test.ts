import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TURN_MS,
  magneticEase,
  modeCueNotes,
  scrambleDuration,
  settleDuration,
  turnClickGain,
  turnEase,
} from '../src/client/turnFeel'

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

  it('clicks only with Sound on, and softer for fast scramble turns', () => {
    expect(turnClickGain(160, false)).toBe(0)
    expect(turnClickGain(160, true)).toBeGreaterThan(0)
    expect(turnClickGain(85, true)).toBeGreaterThan(0)
    expect(turnClickGain(85, true)).toBeLessThan(turnClickGain(160, true))
  })
})

describe('turn speed and overshoot settings', () => {
  it('eases without overshoot when the magnetic snap is off', () => {
    let previous = 0
    for (let i = 1; i <= 100; i++) {
      const value = turnEase(i / 100, false)
      expect(value).toBeGreaterThanOrEqual(previous)
      expect(value).toBeLessThanOrEqual(1)
      previous = value
    }
    expect(turnEase(0, false)).toBe(0)
    expect(turnEase(1, false)).toBe(1)
    expect(turnEase(0.82, true)).toBe(magneticEase(0.82))
  })

  it('scales settling and scrambles with the turn speed', () => {
    expect(DEFAULT_TURN_MS).toBe(160)
    expect(settleDuration(0.1, DEFAULT_TURN_MS)).toBe(120)
    expect(settleDuration(1, DEFAULT_TURN_MS)).toBe(160)
    expect(settleDuration(3, DEFAULT_TURN_MS)).toBe(240)
    expect(settleDuration(1, 320)).toBe(320)
    expect(scrambleDuration(DEFAULT_TURN_MS)).toBe(85)
    expect(scrambleDuration(320)).toBe(170)
  })
})

describe('mode cues', () => {
  it('sounds one tone for a wide turn and two rising tones for the whole cube', () => {
    const block = modeCueNotes('wide')
    const cube = modeCueNotes('cube')
    expect(block).toHaveLength(1)
    expect(cube).toHaveLength(2)
    expect(cube[1].frequency).toBeGreaterThan(cube[0].frequency)
    expect(cube[1].start).toBeGreaterThanOrEqual(
      cube[0].start + cube[0].duration,
    )
    for (const note of [...block, ...cube])
      expect(note.duration).toBeLessThanOrEqual(0.08)
  })
})

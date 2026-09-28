import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TURN_MS,
  MAGNET_IMPACT,
  MAGNET_REACH,
  magneticDragAngle,
  magneticEase,
  magneticSettleAngle,
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

describe('magnetic drags', () => {
  const quarter = Math.PI / 2

  it('holds the layer at every quarter turn', () => {
    for (const k of [-2, -1, 0, 1, 2])
      expect(magneticDragAngle(k * quarter)).toBeCloseTo(k * quarter, 12)
  })

  it('pulls toward the nearest quarter turn within reach, never past it', () => {
    for (const k of [0, 1, -1])
      for (const d of [0.02, 0.1, 0.2, MAGNET_REACH - 0.01]) {
        for (const sign of [1, -1]) {
          const raw = k * quarter + sign * d
          const shown = magneticDragAngle(raw)
          expect(Math.abs(shown - k * quarter)).toBeLessThan(d)
          expect(Math.sign(shown - k * quarter)).toBe(sign)
        }
      }
  })

  it('follows the finger exactly between the magnets', () => {
    const middle = quarter / 2
    expect(magneticDragAngle(middle)).toBeCloseTo(middle, 12)
    expect(magneticDragAngle(MAGNET_REACH + 0.01)).toBeCloseTo(
      MAGNET_REACH + 0.01,
      12,
    )
  })

  it('moves continuously and never backwards across a whole turn', () => {
    let previous = magneticDragAngle(-2 * Math.PI)
    for (let raw = -2 * Math.PI; raw <= 2 * Math.PI; raw += 0.001) {
      const shown = magneticDragAngle(raw)
      expect(shown).toBeGreaterThanOrEqual(previous - 1e-12)
      expect(shown - previous).toBeLessThan(0.01)
      previous = shown
    }
  })

  it('pulls the same both ways', () => {
    for (const raw of [0.05, 0.3, 1.2, 2.9])
      expect(magneticDragAngle(-raw)).toBeCloseTo(-magneticDragAngle(raw), 12)
  })
})

describe('magnetic settling', () => {
  const quarter = Math.PI / 2
  const at = (progress: number, speed = 0, from = 0.5, target = quarter) =>
    magneticSettleAngle(from, target, speed, 200, progress)

  it('starts where the layer was let go and ends on the quarter turn', () => {
    expect(at(0)).toBeCloseTo(0.5, 12)
    expect(at(1)).toBeCloseTo(quarter, 12)
  })

  it('keeps the speed it was let go with', () => {
    const speed = 0.004
    const early = (at(0.001, speed) - at(0, speed)) / (0.001 * 200)
    expect(early).toBeCloseTo(speed, 3)
  })

  it('is sucked in faster the closer it gets', () => {
    const distance = quarter - 0.5
    const firstQuarter = at(0.25) - at(0)
    const lastBefore = at(MAGNET_IMPACT) - at(MAGNET_IMPACT - 0.25)
    expect(firstQuarter).toBeLessThan(0.25 * distance)
    expect(lastBefore).toBeGreaterThan(firstQuarter * 3)
  })

  it('snaps a little past the quarter turn, then settles back', () => {
    const angles = Array.from({ length: 101 }, (_, i) => at(i / 100))
    const peak = Math.max(...angles)
    expect(peak).toBeGreaterThan(quarter)
    expect(peak - quarter).toBeLessThan(0.05 * quarter)
    expect(angles.at(-1)).toBeCloseTo(quarter, 12)
  })

  it('never flings a fast flick far past the quarter turn', () => {
    const angles = Array.from({ length: 101 }, (_, i) =>
      magneticSettleAngle(1.2, quarter, 0.05, 200, i / 100),
    )
    expect(Math.max(...angles) - quarter).toBeLessThan(0.3)
    expect(angles.at(-1)).toBeCloseTo(quarter, 12)
  })

  it('springs back from a short drag without overshooting far', () => {
    const angles = Array.from({ length: 101 }, (_, i) =>
      magneticSettleAngle(0.1, 0, 0, 200, i / 100),
    )
    expect(Math.min(...angles)).toBeGreaterThan(-0.05)
    expect(angles.at(-1)).toBeCloseTo(0, 12)
  })
})

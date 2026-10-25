import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  CAPTURE_STEPS,
  turnHintArrowAngle,
} from '../src/client/capture/captureSteps'

const css = readFileSync('web/capture.css', 'utf8')

// The rotations a cue animation goes through, in degrees.
function rotations(keyframes: string, axis: 'X' | 'Y'): number[] {
  const block = css.match(
    new RegExp(`@keyframes ${keyframes} \\{[\\s\\S]*?\\n\\}`),
  )
  if (!block) throw new Error(`no keyframes ${keyframes}`)
  return [
    ...block[0].matchAll(new RegExp(`rotate${axis}\\((-?[\\d.]+)deg\\)`, 'g')),
  ].map((match) => Number(match[1]))
}

describe('the turn cue never changes the turning direction', () => {
  it('tips the same way for the top and the bottom step', () => {
    const top = rotations('capture-turn-top', 'X')
    const bottom = rotations('capture-turn-bottom', 'X')
    expect(top.length).toBeGreaterThan(0)
    expect(bottom.length).toBeGreaterThan(0)
    for (const angle of [...top, ...bottom])
      expect(angle).toBeLessThanOrEqual(0)
  })

  it('keeps going the same way within the bottom step', () => {
    const bottom = rotations('capture-turn-bottom', 'X')
    expect([...bottom].sort((a, b) => b - a)).toEqual(bottom)
  })

  it('points the hint arrow down for both tips', () => {
    expect(turnHintArrowAngle(4)).toBe(180)
    expect(turnHintArrowAngle(5)).toBe(180)
  })

  it('does not tell the person to tip back', () => {
    expect(CAPTURE_STEPS[5].instruction).not.toMatch(/back to the camera/i)
  })
})

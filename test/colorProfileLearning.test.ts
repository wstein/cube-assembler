import { describe, expect, it } from 'vitest'
import { STICKER_COLORS } from '../src/client/imageProcessing'
import { assessPalette, blendColorProfile, matchColorProfile } from '../src/client/colorProfileLearning'
import type { ColorProfile } from '../src/client/profileSettings'

const base: ColorProfile = { id: 'base', name: 'Base', colors: STICKER_COLORS, captures: 4 }
const shifted = Object.fromEntries(Object.entries(STICKER_COLORS).map(([key, color]) =>
  [key, { ...color, r: Math.max(0, color.r - 5) }])) as typeof STICKER_COLORS

describe('color profile learning', () => {
  it('rejects an unreviewed or weak capture before updating colors', () => {
    expect(assessPalette(base, shifted, { reviewedValid: false, cameraOnly: true, recalibrated: true, confidentFraction: 1 }).accepted).toBe(false)
    expect(assessPalette(base, shifted, { reviewedValid: true, cameraOnly: true, recalibrated: true, confidentFraction: 0.7 }).accepted).toBe(false)
    expect(assessPalette(base, shifted, { reviewedValid: true, cameraOnly: false, recalibrated: true, confidentFraction: 1 }).accepted).toBe(false)
    expect(assessPalette(base, shifted, { reviewedValid: true, cameraOnly: true, recalibrated: true, confidentFraction: 1, correctedFraction: 0.1 }).accepted).toBe(false)
  })

  it('counts approved captures, blends later colors with at least 20 percent weight', () => {
    const first = blendColorProfile({ ...base, captures: 0 }, shifted, '2026-09-26T00:00:00.000Z')
    expect(first.colors).toEqual(shifted)
    expect(first.captures).toBe(1)
    const later = blendColorProfile(base, shifted, '2026-09-26T00:00:00.000Z')
    expect(later.captures).toBe(5)
    expect(later.colors.W.r).toBeLessThan(base.colors.W.r)
    expect(later.colors.W.r).toBeGreaterThan(shifted.W.r)
  })

  it('rejects one color drifting too far even when mean distance is small', () => {
    const bad = { ...STICKER_COLORS, G: STICKER_COLORS.B }
    expect(assessPalette(base, bad, { reviewedValid: true, cameraOnly: true, recalibrated: true, confidentFraction: 1 }).accepted).toBe(false)
  })

  it('matches one clear saved profile and leaves ambiguous colors on Generic', () => {
    const near: ColorProfile = { ...base, id: 'near', colors: shifted }
    expect(matchColorProfile([base, near], shifted)?.id).toBe('near')
    expect(matchColorProfile([base, near], STICKER_COLORS)?.id).toBe('base')
    expect(matchColorProfile([near], shifted)?.id).toBe('near')
    expect(matchColorProfile([{ ...base, id: 'same' }, base], STICKER_COLORS)).toBeNull()
  })
})

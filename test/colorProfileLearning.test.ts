import { describe, expect, it } from 'vitest'
import { STICKER_COLORS } from '../src/client/imageProcessing'
import { assessPalette, blendColorProfile, canCreateProfileFromCapture, matchColorProfile, matchPartialColorProfile, profileColorFitPercent, shouldBlendColorProfile, updateProfileFromCapture } from '../src/client/colorProfileLearning'
import { genericColorProfile, type ColorProfile } from '../src/client/profileSettings'

const base: ColorProfile = { id: 'base', name: 'Base', colors: STICKER_COLORS, captures: 4 }
const shifted = Object.fromEntries(Object.entries(STICKER_COLORS).map(([key, color]) =>
  [key, { ...color, r: Math.max(0, color.r - 5) }])) as typeof STICKER_COLORS

describe('color profile learning', () => {
  it('allows a new profile from any strong reviewed camera capture, even one that matched a saved profile', () => {
    const good = { reviewedValid: true, cameraOnly: true, recalibrated: true, confidentFraction: 0.9, correctedFraction: 0.01 }
    expect(canCreateProfileFromCapture(good)).toBe(true)
    expect(canCreateProfileFromCapture({ ...good, confidentFraction: 0.79 })).toBe(false)
    expect(canCreateProfileFromCapture({ ...good, correctedFraction: 0.03 })).toBe(false)
    expect(canCreateProfileFromCapture({ ...good, cameraOnly: false })).toBe(false)
  })

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

  it('never blends into an existing profile while Automatic colors is selected', () => {
    const evidence = { reviewedValid: true, cameraOnly: true, recalibrated: true, confidentFraction: 1, correctedFraction: 0 }
    expect(shouldBlendColorProfile(base, shifted, evidence, true)).toBe(false)
    expect(shouldBlendColorProfile(base, shifted, evidence, false)).toBe(true)
  })

  it('updates a matched profile only through the explicit captured-profile action', () => {
    const evidence = { reviewedValid: true, cameraOnly: true, recalibrated: true, confidentFraction: 1, correctedFraction: 0 }
    const updated = updateProfileFromCapture(base, shifted, evidence, '2026-09-26T00:00:00.000Z')
    expect(updated?.captures).toBe(base.captures + 1)
    expect(updated?.colors.W.r).toBeLessThan(base.colors.W.r)
    expect(base.captures).toBe(4)
    expect(updateProfileFromCapture(base, shifted, { ...evidence, confidentFraction: 0.7 }, '2026-09-26T00:00:00.000Z')).toBeNull()
  })

  it('never updates Generic colors through automatic, manual, or direct blending', () => {
    const generic = genericColorProfile()
    const evidence = { reviewedValid: true, cameraOnly: true, recalibrated: true, confidentFraction: 1, correctedFraction: 0 }
    expect(shouldBlendColorProfile(generic, shifted, evidence, false)).toBe(false)
    expect(shouldBlendColorProfile(generic, shifted, evidence, true)).toBe(false)
    expect(updateProfileFromCapture(generic, shifted, evidence, '2026-09-26T00:00:00.000Z')).toBeNull()
    expect(() => blendColorProfile(generic, shifted, '2026-09-26T00:00:00.000Z')).toThrow('Cannot update Generic colors')
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

  it('uses partial captured faces only for a clear provisional saved-profile match', () => {
    const vivid: ColorProfile = { ...base, id: 'vivid', colors: { ...STICKER_COLORS, R: { r: 235, g: 20, b: 35 }, G: { r: 20, g: 175, b: 55 } } }
    const muted: ColorProfile = { ...base, id: 'muted', colors: { ...STICKER_COLORS, R: { r: 160, g: 60, b: 65 }, G: { r: 65, g: 125, b: 75 } } }
    const samples = [vivid.colors.R, vivid.colors.G, vivid.colors.R, vivid.colors.G]
    expect(matchPartialColorProfile([vivid, muted], samples)?.id).toBe('vivid')
    expect(matchPartialColorProfile([vivid, { ...vivid, id: 'duplicate' }], samples)).toBeNull()
    expect(matchPartialColorProfile([{ ...vivid, captures: 0 }], samples)).toBeNull()
    expect(matchPartialColorProfile([vivid], [])).toBeNull()
    expect(matchPartialColorProfile([vivid], Array(9).fill(vivid.colors.W))).toBeNull()
  })

  it('reports a bounded profile color fit separately from sticker confidence', () => {
    expect(profileColorFitPercent(base.colors, base.colors)).toBe(100)
    expect(profileColorFitPercent(base.colors, shifted)).toBeLessThan(100)
    expect(profileColorFitPercent(base.colors, shifted)).toBeGreaterThan(0)
    expect(profileColorFitPercent(base.colors, { ...base.colors, R: base.colors.B })).toBeGreaterThanOrEqual(0)
  })
})

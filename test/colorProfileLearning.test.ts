import { describe, expect, it } from 'vitest'
import { STICKER_COLORS } from '../src/client/imageProcessing'
import { assessPalette, blendColorProfile, canCreateProfileFromCapture, matchColorProfile, matchPartialColorProfile, profileColorFitPercent, resolveAutomaticProfile, shouldBlendColorProfile, summarizePreviewProfiles, updateProfileFromCapture } from '../src/client/colorProfileLearning'
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
    expect(matchPartialColorProfile([vivid, { ...vivid, id: 'duplicate' }], samples)?.id).toBe('vivid')
    expect(matchPartialColorProfile([{ ...vivid, captures: 0 }], samples)).toBeNull()
    expect(matchPartialColorProfile([vivid], [])).toBeNull()
    expect(matchPartialColorProfile([vivid], Array(9).fill(vivid.colors.W))?.id).toBe('vivid')
  })

  it('chooses the closest available preview palette from a single visible face', () => {
    const generic = genericColorProfile()
    const muted: ColorProfile = { ...base, id: 'muted-preview', colors: { ...STICKER_COLORS, Y: { r: 174, g: 199, b: 47 }, W: { r: 183, g: 191, b: 215 } } }
    const samples = [muted.colors.Y, muted.colors.W, muted.colors.Y, muted.colors.W]
    expect(matchPartialColorProfile([generic, muted], samples)?.id).toBe(muted.id)
    expect(matchPartialColorProfile([generic], samples)?.id).toBe(generic.id)
    const warmer: ColorProfile = { ...muted, id: 'warmer-preview', colors: { ...muted.colors,
      Y: { r: 220, g: 165, b: 35 }, W: { r: 221, g: 202, b: 177 } } }
    const laterFace = Array(12).fill(warmer.colors.Y).concat(Array(12).fill(warmer.colors.W))
    expect(matchPartialColorProfile([generic, muted, warmer], samples)?.id).toBe(muted.id)
    expect(matchPartialColorProfile([generic, muted, warmer], [...samples, ...laterFace])?.id).toBe(warmer.id)
  })

  it('reports a bounded profile color fit separately from sticker confidence', () => {
    expect(profileColorFitPercent(base.colors, base.colors)).toBe(100)
    expect(profileColorFitPercent(base.colors, shifted)).toBeLessThan(100)
    expect(profileColorFitPercent(base.colors, shifted)).toBeGreaterThan(0)
    expect(profileColorFitPercent(base.colors, { ...base.colors, R: base.colors.B })).toBeGreaterThanOrEqual(0)
  })
})

describe('resolving the automatic profile after all six faces', () => {
  const plastic1: ColorProfile = { id: 'plastic1', name: 'plastic1', colors: STICKER_COLORS, captures: 2 }
  const plastic2: ColorProfile = { id: 'plastic2', name: 'plastic2', colors: shifted, captures: 3 }
  const far: ColorProfile = { id: 'far', name: 'far', captures: 1, colors: Object.fromEntries(Object.entries(STICKER_COLORS).map(([key, color]) =>
    [key, { r: 255 - color.r, g: 255 - color.g, b: 255 - color.b }])) as typeof STICKER_COLORS }
  // Between the two plastic profiles, a little nearer plastic2: no clear lead.
  const between = Object.fromEntries(Object.entries(STICKER_COLORS).map(([key, color]) =>
    [key, { ...color, r: Math.max(0, color.r - 3) }])) as typeof STICKER_COLORS

  it('takes a clear match as before', () => {
    const result = resolveAutomaticProfile([plastic1, far], shifted, null)
    expect(result.profile?.id).toBe('plastic1')
    expect(result.reason).toBe('clear')
  })

  it("takes the preview's profile when it is still the nearest, though not clearly", () => {
    const result = resolveAutomaticProfile([plastic1, plastic2, far], between, 'plastic2')
    expect(result.profile?.id).toBe('plastic2')
    expect(result.reason).toBe('preview')
  })

  it('names the nearest candidates with their fit when nothing is chosen', () => {
    const result = resolveAutomaticProfile([plastic1, plastic2, far], between, 'plastic1')
    expect(result.profile).toBeNull()
    expect(result.reason).toBe('tie')
    expect(result.nearest.map((entry) => entry.profile.id).slice(0, 2)).toEqual(['plastic2', 'plastic1'])
    expect(result.nearest[0].fit).toBeGreaterThanOrEqual(result.nearest[1].fit)
  })

  it('says when no saved profile is close', () => {
    const result = resolveAutomaticProfile([far], STICKER_COLORS, 'far')
    expect(result.profile).toBeNull()
    expect(result.reason).toBe('far')
  })
})

describe('summarizing the preview profiles per face', () => {
  it('groups faces by the profile that previewed them, in capture order', () => {
    expect(summarizePreviewProfiles(['Generic colors', 'plastic2', 'plastic2', 'plastic2', 'plastic2', 'plastic2']))
      .toBe('Generic colors (face 1), plastic2 (faces 2–6)')
    expect(summarizePreviewProfiles(['plastic2', 'plastic2', 'plastic1', 'plastic2', undefined, undefined]))
      .toBe('plastic2 (faces 1–2, 4), plastic1 (face 3)')
    expect(summarizePreviewProfiles([undefined, undefined])).toBeNull()
  })
})

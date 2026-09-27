import { describe, expect, it } from 'vitest'
import collection from '../cube-assembler-profiles.json'
import { matchPartialColorProfile, resolveAutomaticProfile, shouldBlendColorProfile } from '../src/client/colorProfileLearning'
import {
  AUTO_COLORS_ID, EMPTY_SETTINGS, activeColorProfile, allColorProfiles, builtinColorProfiles,
  deleteColorProfile, parseProfileSettings, renameColorProfile, saveColorProfile,
  selectColorProfile, setAutoColorMatch,
} from '../src/client/profileSettings'

describe('built-in color profiles', () => {
  it('lists the JSON palettes without a Generic colors choice', () => {
    expect(builtinColorProfiles().map((profile) => profile.name)).toEqual([
      'Plastic 1', 'Matte', 'Classic', 'Acryl', 'Plastic 2', 'Plastic 3', 'Plastic 4', 'Plastic 5',
    ])
    expect(allColorProfiles(EMPTY_SETTINGS).map((profile) => profile.name)).toEqual([
      'Automatic colors', ...builtinColorProfiles().map((profile) => profile.name),
    ])
    expect(allColorProfiles(EMPTY_SETTINGS).some((profile) => profile.name === 'Generic colors')).toBe(false)
    expect(builtinColorProfiles()[0].colors).toEqual(collection.colors[0].colors)
  })

  it('allows a built-in manual or automatic selection without saving a duplicate', () => {
    const builtin = builtinColorProfiles()[1]
    expect(activeColorProfile(selectColorProfile(EMPTY_SETTINGS, builtin.id)).id).toBe(builtin.id)
    expect(activeColorProfile(setAutoColorMatch(EMPTY_SETTINGS, builtin.id)).id).toBe(builtin.id)
    expect(activeColorProfile(setAutoColorMatch(EMPTY_SETTINGS, null)).name).toBe('Classic')
    expect(parseProfileSettings({ ...EMPTY_SETTINGS, activeColorsId: builtin.id }).activeColorsId).toBe(builtin.id)
    expect(parseProfileSettings({ ...EMPTY_SETTINGS, colors: [builtin] }).colors).toEqual([])
  })

  it('does not allow a built-in palette to be changed, renamed, or deleted', () => {
    const builtin = builtinColorProfiles()[0]
    expect(() => saveColorProfile(EMPTY_SETTINGS, builtin)).toThrow('built-in')
    expect(() => renameColorProfile(EMPTY_SETTINGS, builtin.id, 'Other')).toThrow('built-in')
    expect(() => deleteColorProfile(EMPTY_SETTINGS, builtin.id)).toThrow('built-in')
    expect(() => deleteColorProfile(EMPTY_SETTINGS, AUTO_COLORS_ID)).toThrow('built-in')
    expect(shouldBlendColorProfile(builtin, builtin.colors,
      { reviewedValid: true, cameraOnly: true, recalibrated: true, confidentFraction: 1 }, false)).toBe(false)
  })

  it('uses the built-ins as Automatic candidates through preview and final review', () => {
    const profiles = builtinColorProfiles()
    const reference = profiles.find((profile) => profile.name === 'Plastic 5')!
    const preview = matchPartialColorProfile(profiles, [reference.colors.Y, reference.colors.R])
    expect(preview).not.toBeNull()
    expect(profiles.some((profile) => profile.id === preview?.id)).toBe(true)
    expect(resolveAutomaticProfile(profiles, reference.colors, preview?.id ?? null).profile?.id).toBe(reference.id)
  })
})

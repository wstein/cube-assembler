import { describe, expect, it } from 'vitest'
import {
  groupSimilarProfiles, mergeColorProfiles, mergedColors, profileDistance, whiteBalancedColors,
} from '../src/client/colorProfileReview'
import { AUTO_COLORS_ID, EMPTY_SETTINGS, GENERIC_COLORS_ID, type ColorProfile, type ProfileSettings } from '../src/client/profileSettings'
import type { RGB } from '../src/client/imageProcessing'

const rgb = (r: number, g: number, b: number): RGB => ({ r, g, b })
const profile = (id: string, colors: Record<string, RGB>, captures = 1): ColorProfile => ({ id, name: id, colors, captures })

// Real learned palettes from an exported settings file: the same stickers
// under daylight and under a warm lamp, and a clearly different pastel cube.
const DAYLIGHT = { W: rgb(198, 206, 224), Y: rgb(196, 222, 68), O: rgb(238, 106, 54), R: rgb(196, 42, 58), G: rgb(12, 168, 88), B: rgb(10, 68, 185) }
const WARM = { W: rgb(216, 204, 182), Y: rgb(218, 202, 48), O: rgb(232, 92, 42), R: rgb(190, 36, 44), G: rgb(24, 152, 66), B: rgb(16, 62, 155) }
const UV = { W: rgb(230, 235, 248), Y: rgb(232, 238, 44), O: rgb(248, 98, 38), R: rgb(216, 34, 52), G: rgb(8, 185, 90), B: rgb(2, 68, 226) }
const PASTEL = { W: rgb(228, 230, 236), Y: rgb(242, 232, 115), O: rgb(244, 142, 92), R: rgb(232, 92, 108), G: rgb(108, 212, 138), B: rgb(82, 142, 232) }

const settings = (colors: ColorProfile[], extra: Partial<ProfileSettings> = {}): ProfileSettings =>
  ({ ...EMPTY_SETTINGS, colors, ...extra })

describe('whiteBalancedColors', () => {
  it('makes White neutral and keeps the other colors relative to it', () => {
    const balanced = whiteBalancedColors(WARM)
    expect(balanced.W.r).toBe(balanced.W.g)
    expect(balanced.W.g).toBe(balanced.W.b)
    // Under the warm lamp White was reddish; balancing takes the same red
    // cast out of Blue.
    expect(balanced.B.r / balanced.B.b).toBeLessThan(WARM.B.r / WARM.B.b)
  })
})

describe('profileDistance', () => {
  it('ignores the room light once each profile is balanced on its own White', () => {
    const tinted = Object.fromEntries(Object.entries(UV).map(([key, c]) => [key, rgb(Math.min(255, c.r * 1.08), c.g, Math.round(c.b * 0.85))]))
    expect(profileDistance(UV, tinted)).toBeLessThan(1.5)
  })

  it('puts the warm-lamp profile closer to the UV one than the raw colors do', () => {
    expect(profileDistance(WARM, UV)).toBeLessThan(3)
    expect(profileDistance(PASTEL, UV)).toBeGreaterThan(8)
  })
})

describe('groupSimilarProfiles', () => {
  const profiles = [profile('daylight', DAYLIGHT), profile('warm', WARM), profile('uv', UV), profile('pastel', PASTEL)]

  it('groups profiles that are all within the limit of each other', () => {
    const groups = groupSimilarProfiles(profiles, 3)
    const ids = groups.map((group) => group.map((p) => p.id).sort())
    expect(ids).toContainEqual(['uv', 'warm'])
    expect(ids).toContainEqual(['pastel'])
  })

  it('keeps every profile alone at a tiny limit', () => {
    expect(groupSimilarProfiles(profiles, 0.1).every((group) => group.length === 1)).toBe(true)
  })
})

describe('mergedColors', () => {
  it('keeps the mean White brightness of the merged profiles', () => {
    const lum = (c: RGB) => { const lin = (v: number) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }; return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b) }
    const merged = mergedColors([{ colors: WARM }, { colors: UV }])
    expect(lum(merged.W)).toBeCloseTo((lum(WARM.W) + lum(UV.W)) / 2, 2)
  })
})

describe('mergeColorProfiles', () => {
  const base = settings([profile('warm', WARM, 2), profile('uv', UV, 3), profile('pastel', PASTEL)], {
    activeColorsId: 'uv', autoMatchedColorsId: 'warm',
  })

  it('replaces the merged profiles with one new profile in the first one\'s place', () => {
    const { settings: merged, profile: created } = mergeColorProfiles(base, ['warm', 'uv'], ' Bright stickers ', '2026-09-26T20:00:00.000Z')
    expect(merged.colors.map((p) => p.id)).toEqual([created.id, 'pastel'])
    expect(created.name).toBe('Bright stickers')
    expect(created.captures).toBe(5)
    expect(created.updatedAt).toBe('2026-09-26T20:00:00.000Z')
    expect(created.colors.W.r).toBe(created.colors.W.g)
    expect(created.colors.W.g).toBe(created.colors.W.b)
  })

  it('moves the selected and the automatically matched profile to the new one', () => {
    const { settings: merged, profile: created } = mergeColorProfiles(base, ['warm', 'uv'], 'Bright', '2026-09-26T20:00:00.000Z')
    expect(merged.activeColorsId).toBe(created.id)
    expect(merged.autoMatchedColorsId).toBe(created.id)
  })

  it('leaves other selections alone', () => {
    const other = { ...base, activeColorsId: AUTO_COLORS_ID, autoMatchedColorsId: 'pastel' }
    const { settings: merged } = mergeColorProfiles(other, ['warm', 'uv'], 'Bright', '2026-09-26T20:00:00.000Z')
    expect(merged.activeColorsId).toBe(AUTO_COLORS_ID)
    expect(merged.autoMatchedColorsId).toBe('pastel')
  })

  it('refuses fewer than two profiles, built-in colors, unknown ids and an empty name', () => {
    const at = '2026-09-26T20:00:00.000Z'
    expect(() => mergeColorProfiles(base, ['warm'], 'X', at)).toThrow()
    expect(() => mergeColorProfiles(base, ['warm', GENERIC_COLORS_ID], 'X', at)).toThrow()
    expect(() => mergeColorProfiles(base, ['warm', 'nope'], 'X', at)).toThrow()
    expect(() => mergeColorProfiles(base, ['warm', 'uv'], '  ', at)).toThrow()
  })
})

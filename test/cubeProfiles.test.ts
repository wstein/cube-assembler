/**
 * test/cubeProfiles.test.ts
 * Cube profile store handling (src/client/cubeProfiles.ts): parsing and
 * migrating stored settings, and picking/saving/deleting profiles.
 *
 * Run: npx vitest run test/cubeProfiles.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  parseProfileStore, activeProfile, profilesForSize, saveProfile, selectProfile, deleteProfile,
  genericProfile, profilePalette, withLearnedColors, withoutLearnedColors, suggestProfile, brandProfile, CUBE_STYLES, EMPTY_PROFILE_STORE, type CubeProfile,
} from '../src/client/cubeProfiles'

const rubiks: CubeProfile = { id: 'a', name: "Rubik's 3×3", size: 3, sampling: { stickerCore: 0.6 } }
const gocube: CubeProfile = { id: 'b', name: 'GoCube 3×3', size: 3, sampling: { stickerCore: 0.5 } }

describe('activeProfile', () => {
  it('falls back to the generic profile for a size without profiles', () => {
    expect(activeProfile(EMPTY_PROFILE_STORE, 7)).toEqual(genericProfile(7))
    expect(profilesForSize(EMPTY_PROFILE_STORE, 7)).toEqual([genericProfile(7)])
  })

  it('returns the selected profile of that size, else its first one', () => {
    let store = saveProfile(saveProfile(EMPTY_PROFILE_STORE, rubiks), gocube)
    expect(activeProfile(store, 3).id).toBe('b')
    store = selectProfile(store, 3, 'a')
    expect(activeProfile(store, 3).id).toBe('a')
    expect(activeProfile(deleteProfile(store, 'a'), 3).id).toBe('b')
  })
})

describe('saveProfile', () => {
  it('replaces a profile with the same id instead of adding a second', () => {
    const store = saveProfile(saveProfile(EMPTY_PROFILE_STORE, rubiks), { ...rubiks, name: 'Renamed' })
    expect(store.profiles).toHaveLength(1)
    expect(store.profiles[0].name).toBe('Renamed')
  })
})

describe('parseProfileStore', () => {
  it('round-trips a store', () => {
    const store = selectProfile(saveProfile(saveProfile(EMPTY_PROFILE_STORE, rubiks), gocube), 3, 'a')
    expect(parseProfileStore(JSON.parse(JSON.stringify(store)))).toEqual(store)
  })

  it('drops malformed profiles and active ids that point nowhere', () => {
    const parsed = parseProfileStore({
      profiles: [rubiks, { id: 'x', name: 'bad size', size: 9, sampling: rubiks.sampling }, { name: 'no id' }],
      active: { 3: 'a', 5: 'missing' },
    })
    expect(parsed).toEqual({ profiles: [rubiks], active: { 3: 'a' } })
  })

  it('migrates the earlier per-size settings into generic profiles', () => {
    const parsed = parseProfileStore({ 3: { backgroundGap: 0.05, stickerCore: 0.6 }, 9: { backgroundGap: 0, stickerCore: 0.6 } })
    expect(parsed.profiles).toEqual([{ ...genericProfile(3), sampling: { stickerCore: 0.6 } }])
    expect(activeProfile(parsed, 3).sampling.stickerCore).toBe(0.6)
  })

  it('ignores the old adjustable backdrop gap on saved profiles', () => {
    const parsed = parseProfileStore({ profiles: [{ ...rubiks, sampling: { backgroundGap: 0.3, stickerCore: 0.5 } }], active: { 3: 'a' } })
    expect(parsed.profiles[0].sampling).toEqual({ stickerCore: 0.5 })
  })

  it('returns an empty store for anything else', () => {
    expect(parseProfileStore(null)).toEqual(EMPTY_PROFILE_STORE)
    expect(parseProfileStore('nope')).toEqual(EMPTY_PROFILE_STORE)
  })
})

describe('learned colors', () => {
  const palette = {
    W: { r: 168.4, g: 172, b: 172 }, Y: { r: 182, g: 200, b: 38 }, O: { r: 217, g: 69, b: 38 },
    R: { r: 164, g: 22, b: 36 }, G: { r: 4, g: 142, b: 55 }, B: { r: 0, g: 58, b: 121.6 },
  }

  it('stores them rounded and gives them back as a palette', () => {
    const learned = withLearnedColors(rubiks, palette, new Date('2026-09-24T10:00:00Z'))
    expect(learned.learnedColors!.W).toEqual([168, 172, 172])
    expect(learned.learnedAt).toBe('2026-09-24T10:00:00.000Z')
    expect(profilePalette(learned)!.B).toEqual({ r: 0, g: 58, b: 122 })
    expect(profilePalette(withoutLearnedColors(learned))).toBeUndefined()
  })

  it('survives parsing, and incomplete color sets are dropped', () => {
    const learned = withLearnedColors(rubiks, palette, new Date())
    expect(parseProfileStore({ profiles: [learned], active: {} }).profiles[0]).toEqual(learned)
    const broken = { ...learned, learnedColors: { W: [1, 2, 3] } }
    expect(parseProfileStore({ profiles: [broken], active: {} }).profiles[0].learnedColors).toBeUndefined()
  })
})

describe('suggestProfile', () => {
  const hex = (h: string) => ({ r: parseInt(h.slice(1, 3), 16), g: parseInt(h.slice(3, 5), 16), b: parseInt(h.slice(5, 7), 16) })
  const palette = (colors: string[]) => Object.fromEntries(['W', 'Y', 'O', 'R', 'G', 'B'].map((k, i) => [k, hex(colors[i])]))
  const rubiksColors = palette(['#FFFFFF', '#FFD500', '#FF5800', '#B71234', '#009B48', '#0046AD'])
  const pastelColors = palette(['#FFFFFF', '#FFF3A0', '#FFB385', '#FF7A8A', '#8EE6A6', '#8AB6FF'])
  const at = new Date()
  const store = saveProfile(
    saveProfile(EMPTY_PROFILE_STORE, withLearnedColors(rubiks, rubiksColors, at)),
    withLearnedColors({ ...gocube, name: 'Pastel 3×3' }, pastelColors, at)
  )
  const selectedRubiks = store.profiles[0]
  const nudge = (p: Record<string, { r: number; g: number; b: number }>) =>
    Object.fromEntries(Object.entries(p).map(([k, c]) => [k, { r: c.r * 0.9, g: c.g * 0.9, b: c.b * 0.9 }]))

  it('suggests the cube whose colors a capture clearly matches better', () => {
    expect(suggestProfile(store, selectedRubiks, nudge(pastelColors))?.name).toBe('Pastel 3×3')
  })

  it('stays quiet when the selected cube matches best', () => {
    expect(suggestProfile(store, selectedRubiks, nudge(rubiksColors))).toBeNull()
  })

  it('stays quiet when the selected cube has no colors to compare yet', () => {
    expect(suggestProfile(store, withoutLearnedColors(selectedRubiks), pastelColors)).toBeNull()
  })

  it('only considers cubes of the same size', () => {
    const other = saveProfile(store, withLearnedColors({ ...gocube, id: 'c', size: 4, name: 'Pastel 4×4' }, pastelColors, at))
    const onlyFour = { ...other, profiles: other.profiles.filter((p) => p.id !== 'b') }
    expect(suggestProfile(onlyFour, selectedRubiks, pastelColors)).toBeNull()
  })
})

describe('brandProfile', () => {
  it('names the cube after brand and size, with the style\'s starting sampling', () => {
    const p = brandProfile(EMPTY_PROFILE_STORE, 'GoCube', 'stickerless', 3)
    expect(p.name).toBe('GoCube 3×3')
    expect(p.size).toBe(3)
    expect(p.sampling).toEqual(CUBE_STYLES.stickerless.sampling)
    expect(p.learnedColors).toBeUndefined()
  })

  it('numbers a second cube of the same brand and size', () => {
    let store = saveProfile(EMPTY_PROFILE_STORE, brandProfile(EMPTY_PROFILE_STORE, 'GoCube', 'stickerless', 3))
    const second = brandProfile(store, 'GoCube', 'stickered', 3)
    expect(second.name).toBe('GoCube 3×3 (2)')
    store = saveProfile(store, second)
    expect(brandProfile(store, 'GoCube', 'stickered', 3).name).toBe('GoCube 3×3 (3)')
    expect(brandProfile(store, 'GoCube', 'stickered', 4).name).toBe('GoCube 4×4')
  })
})

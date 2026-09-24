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
  genericProfile, EMPTY_PROFILE_STORE, type CubeProfile,
} from '../src/client/cubeProfiles'

const rubiks: CubeProfile = { id: 'a', name: "Rubik's 3×3", size: 3, sampling: { backgroundGap: 0.05, stickerCore: 0.6 } }
const gocube: CubeProfile = { id: 'b', name: 'GoCube 3×3', size: 3, sampling: { backgroundGap: 0.08, stickerCore: 0.5 } }

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
    expect(parsed.profiles).toEqual([{ ...genericProfile(3), sampling: { backgroundGap: 0.05, stickerCore: 0.6 } }])
    expect(activeProfile(parsed, 3).sampling.backgroundGap).toBe(0.05)
  })

  it('returns an empty store for anything else', () => {
    expect(parseProfileStore(null)).toEqual(EMPTY_PROFILE_STORE)
    expect(parseProfileStore('nope')).toEqual(EMPTY_PROFILE_STORE)
  })
})

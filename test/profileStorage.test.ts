import { describe, expect, it } from 'vitest'
import { EMPTY_SETTINGS } from '../src/client/profileSettings'
import {
  PROFILE_SETTINGS_KEY, LEGACY_PROFILE_KEY, loadProfileSettings, saveProfileSettings, parseSettingsFile,
} from '../src/client/profileStorage'

function memoryStorage(): Storage {
  const values = new Map<string, string>()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value) },
    removeItem: (key) => { values.delete(key) },
    clear: () => { values.clear() },
    key: (index) => [...values.keys()][index] ?? null,
    get length() { return values.size },
  }
}

describe('profile settings storage', () => {
  it('migrates old localStorage into a new key without changing the old key', () => {
    const storage = memoryStorage()
    const old = JSON.stringify({ profiles: [{ id: 'old', name: 'Old 3×3', size: 3, sampling: { backgroundGap: 0.2, stickerCore: 0.55 } }], active: { 3: 'old' } })
    storage.setItem(LEGACY_PROFILE_KEY, old)
    const loaded = loadProfileSettings(storage)
    expect(loaded.cubes[0].sampling).toEqual({ stickerCore: 0.55 })
    expect(storage.getItem(LEGACY_PROFILE_KEY)).toBe(old)
    expect(storage.getItem(PROFILE_SETTINGS_KEY)).toContain('"version":3')
    expect(loadProfileSettings(storage)).toEqual(loaded)
  })

  it('accepts a built-ins-only v3 settings file and rejects unrelated JSON', () => {
    const file = JSON.stringify({ type: 'cube-assembler-settings', version: 3, ...EMPTY_SETTINGS })
    expect(parseSettingsFile(JSON.parse(file))).toEqual(EMPTY_SETTINGS)
    expect(parseSettingsFile({ type: 'other', version: 3, ...EMPTY_SETTINGS })).toBeNull()
    const storage = memoryStorage()
    expect(saveProfileSettings(storage, EMPTY_SETTINGS)).toBe(true)
    expect(loadProfileSettings(storage)).toEqual(EMPTY_SETTINGS)
  })
})

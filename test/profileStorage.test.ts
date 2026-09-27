import { describe, expect, it } from 'vitest'
import { EMPTY_SETTINGS } from '../src/client/profileSettings'
import {
  PROFILE_SETTINGS_KEY, loadProfileSettings, saveProfileSettings, parseSettingsFile, settingsFile,
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
  it('writes the current profile format to cube-assembler-profiles-v1', () => {
    const storage = memoryStorage()
    expect(PROFILE_SETTINGS_KEY).toBe('cube-assembler-profiles-v1')
    expect(saveProfileSettings(storage, EMPTY_SETTINGS)).toBe(true)
    expect(JSON.parse(storage.getItem(PROFILE_SETTINGS_KEY)!)).toMatchObject({ version: 3, ...EMPTY_SETTINGS })
    expect(loadProfileSettings(storage)).toEqual(EMPTY_SETTINGS)
  })

  it('wipes earlier storage keys without migrating them', () => {
    const storage = memoryStorage()
    storage.setItem('cube-assembler-settings-v3', JSON.stringify({ version: 3, ...EMPTY_SETTINGS }))
    storage.setItem('cube-assembler-profiles', JSON.stringify({ profiles: [{ id: 'old' }] }))
    storage.setItem('cube-assembler-settings', '{}')
    expect(loadProfileSettings(storage)).toEqual(EMPTY_SETTINGS)
    expect(storage.getItem(PROFILE_SETTINGS_KEY)).toBeNull()
    expect(storage.getItem('cube-assembler-settings-v3')).toBeNull()
    expect(storage.getItem('cube-assembler-profiles')).toBeNull()
    expect(storage.getItem('cube-assembler-settings')).toBeNull()
  })

  it('exports and imports only the profiles file type', () => {
    expect(settingsFile(EMPTY_SETTINGS)).toMatchObject({ type: 'cube-assembler-profiles', version: 3 })
    expect(parseSettingsFile(settingsFile(EMPTY_SETTINGS))).toEqual(EMPTY_SETTINGS)
    expect(parseSettingsFile({ type: 'cube-assembler-settings', version: 3, ...EMPTY_SETTINGS })).toBeNull()
    expect(parseSettingsFile({ type: 'other', version: 3, ...EMPTY_SETTINGS })).toBeNull()
  })
})

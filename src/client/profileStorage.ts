import {
  EMPTY_SETTINGS, convertLegacySettings, parseProfileSettings, type ProfileSettings,
} from './profileSettings'

export const PROFILE_SETTINGS_KEY = 'cube-assembler-settings-v3'
export const LEGACY_PROFILE_KEY = 'cube-assembler-profiles'
export const SETTINGS_FILE_TYPE = 'cube-assembler-settings'

function isV3(value: unknown): value is Record<string, unknown> {
  const raw = value as Record<string, unknown> | null
  return raw?.version === 3 && Array.isArray(raw.cubes) && Array.isArray(raw.colors)
}

export function settingsFile(settings: ProfileSettings): Record<string, unknown> {
  return { type: SETTINGS_FILE_TYPE, version: 3, ...settings }
}

export function parseSettingsFile(value: unknown): ProfileSettings | null {
  const raw = value as Record<string, unknown> | null
  if (raw?.type === SETTINGS_FILE_TYPE && isV3(raw)) return parseProfileSettings(raw)
  if (raw?.type === LEGACY_PROFILE_KEY && Array.isArray(raw.profiles)) return convertLegacySettings(raw)
  if (raw?.type === 'cube-assembler-sampling' && raw.samplingBySize) return convertLegacySettings(raw.samplingBySize)
  return null
}

export function saveProfileSettings(storage: Pick<Storage, 'setItem'>, settings: ProfileSettings): boolean {
  try {
    storage.setItem(PROFILE_SETTINGS_KEY, JSON.stringify({ version: 3, ...settings }))
    return true
  } catch {
    return false
  }
}

export function loadProfileSettings(storage: Pick<Storage, 'getItem' | 'setItem'>, legacyCookie: unknown = null): ProfileSettings {
  try {
    const current = storage.getItem(PROFILE_SETTINGS_KEY)
    if (current) {
      const data = JSON.parse(current)
      if (isV3(data)) return parseProfileSettings(data)
    }
  } catch {
    // Corrupt or blocked storage falls through to the old format.
  }
  let old: unknown = legacyCookie
  try {
    const stored = storage.getItem(LEGACY_PROFILE_KEY)
    if (stored) old = JSON.parse(stored)
  } catch {
    // An old cookie is still usable when localStorage is blocked.
  }
  if (old === null) return EMPTY_SETTINGS
  const migrated = convertLegacySettings(old)
  saveProfileSettings(storage, migrated)
  return migrated
}

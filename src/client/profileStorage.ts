import {
  EMPTY_SETTINGS,
  parseProfileSettings,
  type ProfileSettings,
} from './profileSettings'

export const PROFILE_SETTINGS_KEY = 'cube-assembler-profiles-v1'
export const SETTINGS_FILE_TYPE = 'cube-assembler-profiles'

function isV3(value: unknown): value is Record<string, unknown> {
  const raw = value as Record<string, unknown> | null
  return (
    raw?.version === 3 && Array.isArray(raw.cubes) && Array.isArray(raw.colors)
  )
}

export function settingsFile(
  settings: ProfileSettings,
): Record<string, unknown> {
  return { type: SETTINGS_FILE_TYPE, version: 3, ...settings }
}

export function parseSettingsFile(value: unknown): ProfileSettings | null {
  const raw = value as Record<string, unknown> | null
  if (raw?.type === SETTINGS_FILE_TYPE && isV3(raw))
    return parseProfileSettings(raw)
  return null
}

export function saveProfileSettings(
  storage: Pick<Storage, 'setItem'>,
  settings: ProfileSettings,
): boolean {
  try {
    storage.setItem(
      PROFILE_SETTINGS_KEY,
      JSON.stringify({ version: 3, ...settings }),
    )
    return true
  } catch {
    return false
  }
}

export function loadProfileSettings(
  storage: Pick<Storage, 'getItem'>,
): ProfileSettings {
  try {
    const stored = storage.getItem(PROFILE_SETTINGS_KEY)
    if (stored) {
      const data = JSON.parse(stored)
      if (isV3(data)) return parseProfileSettings(data)
    }
  } catch {
    // Corrupt or blocked storage starts with the built-in profiles.
  }
  return EMPTY_SETTINGS
}

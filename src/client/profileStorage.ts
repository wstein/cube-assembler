// The profiles file and browser storage. The format and parsing are in
// src/core/profiles/ProfileStorage.res; the storage calls stay here.
import {
  parseSettingsFile as parseSettingsFileRes,
  parseStoredText,
  profileSettingsKey,
  settingsFile as settingsFileRes,
  settingsFileType,
  storedText,
} from '../core/profiles/ProfileStorage.gen'
import { EMPTY_SETTINGS, type ProfileSettings } from './profileSettings'

type Settings = Parameters<typeof storedText>[0]
const toRes = (settings: ProfileSettings) => settings as unknown as Settings

export const PROFILE_SETTINGS_KEY = profileSettingsKey
export const SETTINGS_FILE_TYPE = settingsFileType

export function settingsFile(
  settings: ProfileSettings,
): Record<string, unknown> {
  return settingsFileRes(toRes(settings))
}

// Settings from an imported profiles file, or null when it isn't one.
export function parseSettingsFile(value: unknown): ProfileSettings | null {
  return parseSettingsFileRes(value) as ProfileSettings | null
}

// False when the browser won't store it (storage blocked or full).
export function saveProfileSettings(
  storage: Pick<Storage, 'setItem'>,
  settings: ProfileSettings,
): boolean {
  try {
    storage.setItem(PROFILE_SETTINGS_KEY, storedText(toRes(settings)))
    return true
  } catch {
    return false
  }
}

export function loadProfileSettings(
  storage: Pick<Storage, 'getItem'>,
): ProfileSettings {
  try {
    return parseStoredText(
      storage.getItem(PROFILE_SETTINGS_KEY),
    ) as unknown as ProfileSettings
  } catch {
    // Blocked storage starts with the built-in profiles.
    return EMPTY_SETTINGS
  }
}

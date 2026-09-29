// Viewer preferences kept in first-party cookies. These hold only choices
// made in the app; profile definitions remain in local storage. Typed entry
// point for src/core/app/Preferences.res.
import {
  autoCaptureFramesRange,
  fixtureServerUrlCookie,
  readChoice as readChoiceRes,
  readNumber as readNumberRes,
  readPreference as readPreferenceRes,
  readSelection,
  selectedCaptureMode as selectedCaptureModeRes,
  selectedNotationFormat as selectedNotationFormatRes,
  swipeRanges,
  turnMsRange,
} from '../core/app/Preferences.gen'
import type { CaptureMode } from './capture/capturePhoto'
import {
  DEFAULT_FIXTURE_SERVER,
  loopbackFixtureServer,
} from './fixtures/fixtureUpload'

export {
  autoCaptureCookie as AUTO_CAPTURE_COOKIE,
  autoCaptureFramesCookie as AUTO_CAPTURE_FRAMES_COOKIE,
  autoRotateCookie as AUTO_ROTATE_COOKIE,
  viewHelpCookie as VIEW_HELP_COOKIE,
  seamWideCookie as SEAM_WIDE_COOKIE,
  captureModeCookie as CAPTURE_MODE_COOKIE,
  clearedCookie,
  colorProfileCookie as COLOR_PROFILE_COOKIE,
  cubeSizeCookie as CUBE_SIZE_COOKIE,
  cubeViewCookie as CUBE_VIEW_COOKIE,
  fixtureServerCookie as FIXTURE_SERVER_COOKIE,
  fixtureServerUrlCookie as FIXTURE_SERVER_URL_COOKIE,
  localUploadCookie as LOCAL_UPLOAD_COOKIE,
  localUploadShown,
  mirrorCookie as MIRROR_COOKIE,
  notationCookie as NOTATION_COOKIE,
  numberCookie,
  preferenceCookie,
  readAutoCaptureFrames,
  readScrambleOptions,
  readSelection,
  readSwipeTuning,
  readTurnFeel,
  scrambleInnerCookie as SCRAMBLE_INNER_COOKIE,
  scrambleLengthCookie as SCRAMBLE_LENGTH_COOKIE,
  selectedCubeSize,
  selectedCubeView,
  selectedTheme,
  selectionCookie,
  settingCookies as SETTING_COOKIES,
  soundCookie as SOUND_COOKIE,
  stickerlessCookie as STICKERLESS_COOKIE,
  swipeCommitCookie as SWIPE_COMMIT_COOKIE,
  swipeFlickCookie as SWIPE_FLICK_COOKIE,
  swipeStartCookie as SWIPE_START_COOKIE,
  themeCookie as THEME_COOKIE,
  turnMsCookie as TURN_MS_COOKIE,
  turnOvershootCookie as TURN_OVERSHOOT_COOKIE,
  turnSoundCookie as TURN_SOUND_COOKIE,
  turnSoundOn,
  vibrationCookie as VIBRATION_COOKIE,
  vibrationMsCookie as VIBRATION_MS_COOKIE,
  vibrationMsRange as VIBRATION_MS_RANGE,
  readVibrationMs,
  vibrationOn,
} from '../core/app/Preferences.gen'

export const TURN_MS_RANGE = turnMsRange
export const SWIPE_RANGES = swipeRanges
export const AUTO_CAPTURE_FRAMES_RANGE = autoCaptureFramesRange

export function readPreference(
  cookies: string,
  name: string,
  fallback = false,
): boolean {
  return readPreferenceRes(cookies, name, fallback)
}

// One of `choices`, else `fallback`.
export function readChoice<T extends string>(
  cookies: string,
  name: string,
  choices: readonly T[],
  fallback: T,
): T {
  return readChoiceRes(cookies, name, [...choices], fallback) as T
}

// A whole number kept between `min` and `max`, else `fallback`.
export function readNumber(
  cookies: string,
  name: string,
  range: { min: number; max: number; fallback: number },
): number {
  return readNumberRes(cookies, name, range)
}

export function selectedNotationFormat(cookies: string): 'wrg' | 'urf' {
  return selectedNotationFormatRes(cookies) as 'wrg' | 'urf'
}

export function selectedCaptureMode(cookies: string): CaptureMode {
  return selectedCaptureModeRes(cookies) as CaptureMode
}

export type ScrambleLength = 'short' | 'normal' | 'long'

export interface ScrambleOptions {
  length: ScrambleLength
  innerLayers: boolean
}

export function readFixtureServer(cookies: string): string {
  return (
    loopbackFixtureServer(
      readSelection(cookies, fixtureServerUrlCookie) ?? '',
    ) ?? DEFAULT_FIXTURE_SERVER
  )
}

export type Theme = 'system' | 'light' | 'dark'

// Viewer preferences kept in first-party cookies. These hold only choices
// made in the app; profile definitions remain in local storage.
import { AUTO_CAPTURE_STABLE_FRAMES } from './autoCapture'
import { DEFAULT_FIXTURE_SERVER, loopbackFixtureServer } from './fixtureUpload'
import type { CaptureMode } from './capturePhoto'
import {
  DEFAULT_HOLD_TIMINGS,
  DEFAULT_SWIPE_TUNING,
  type HoldTimings,
  type SwipeTuning,
} from './cubeGesture'
import { DEFAULT_TURN_MS } from './turnFeel'

export const MIRROR_COOKIE = 'cube-assembler-mirror'
export const AUTO_CAPTURE_COOKIE = 'cube-assembler-auto-capture'
export const SOUND_COOKIE = 'cube-assembler-capture-sound'
export const CUBE_SIZE_COOKIE = 'cube-assembler-cube-size'
export const COLOR_PROFILE_COOKIE = 'cube-assembler-color-profile'
export const CUBE_VIEW_COOKIE = 'cube-assembler-cube-view'
export const STICKERLESS_COOKIE = 'cube-assembler-stickerless'
export const AUTO_ROTATE_COOKIE = 'cube-assembler-auto-rotate'
// The 3D view's turn click; until set it follows the capture sound.
export const TURN_SOUND_COOKIE = 'cube-assembler-turn-sound'
// How long a quarter turn takes, and whether it snaps past like a magnet.
export const TURN_MS_COOKIE = 'cube-assembler-turn-ms'
export const TURN_OVERSHOOT_COOKIE = 'cube-assembler-turn-overshoot'
// How far a swipe moves before it turns, how far a turn must get to count,
// and how far a flick carries on (percent of a quarter turn, milliseconds).
export const SWIPE_START_COOKIE = 'cube-assembler-swipe-start-px'
export const SWIPE_COMMIT_COOKIE = 'cube-assembler-swipe-commit-percent'
export const SWIPE_FLICK_COOKIE = 'cube-assembler-swipe-flick-ms'
// How many matching live frames auto capture waits for.
export const AUTO_CAPTURE_FRAMES_COOKIE = 'cube-assembler-auto-capture-frames'
// How long scrambles are, and whether they turn inner layers.
export const SCRAMBLE_LENGTH_COOKIE = 'cube-assembler-scramble-length'
export const SCRAMBLE_INNER_COOKIE = 'cube-assembler-scramble-inner'
// A short vibration when a held sticker switches to a block or the cube.
export const VIBRATION_COOKIE = 'cube-assembler-vibration'
// Developer settings: where the published app finds the local fixture
// server, and whether saving a fixture offers Upload to localhost.
export const FIXTURE_SERVER_URL_COOKIE = 'cube-assembler-fixture-server-url'
export const LOCAL_UPLOAD_COOKIE = 'cube-assembler-local-upload'
// Light or dark colors, or whatever the system prefers.
export const THEME_COOKIE = 'cube-assembler-theme'
export const NOTATION_COOKIE = 'cube-assembler-notation'
export const CAPTURE_MODE_COOKIE = 'cube-assembler-capture-mode'
// How long a sticker is held before a drag turns a block or the whole cube.
export const WIDE_PRESS_COOKIE = 'cube-assembler-wide-press-ms'
export const CUBE_PRESS_COOKIE = 'cube-assembler-cube-press-ms'
// Set after an upload from the published app reached the local fixture server.
export const FIXTURE_SERVER_COOKIE = 'cube-assembler-fixture-server'
const ONE_YEAR = 365 * 24 * 60 * 60
const ATTRIBUTES = `Max-Age=${ONE_YEAR}; Path=/; SameSite=Lax`

export function readPreference(
  cookies: string,
  name: string,
  fallback = false,
): boolean {
  const value = readSelection(cookies, name)
  return value === '1' ? true : value === '0' ? false : fallback
}

export function preferenceCookie(name: string, on: boolean): string {
  return `${name}=${on ? 1 : 0}; ${ATTRIBUTES}`
}

export function readSelection(cookies: string, name: string): string | null {
  const entry = cookies
    .split(';')
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${name}=`))
  if (!entry) return null
  try {
    return decodeURIComponent(entry.slice(name.length + 1))
  } catch {
    return null
  }
}

export function selectionCookie(name: string, value: string): string {
  return `${name}=${encodeURIComponent(value)}; ${ATTRIBUTES}`
}

export function selectedCubeSize(cookies: string): number | null {
  const value = readSelection(cookies, CUBE_SIZE_COOKIE)
  return value && /^[2-7]$/.test(value) ? Number(value) : null
}

export function selectedCubeView(cookies: string): 'net' | '3d' | null {
  const value = readSelection(cookies, CUBE_VIEW_COOKIE)
  return value === 'net' || value === '3d' ? value : null
}

// Hold times stay between minMs and maxMs, and the whole cube comes at
// least gapMs after the block so both remain reachable.
export const HOLD_TIMING_LIMITS = { minMs: 200, maxMs: 3000, gapMs: 200 }

export function readHoldTimings(cookies: string): HoldTimings {
  const { minMs, maxMs, gapMs } = HOLD_TIMING_LIMITS
  const saved = (name: string, fallback: number) => {
    const value = Number.parseInt(readSelection(cookies, name) ?? '', 10)
    return Number.isFinite(value) ? value : fallback
  }
  const blockMs = Math.min(
    maxMs - gapMs,
    Math.max(minMs, saved(WIDE_PRESS_COOKIE, DEFAULT_HOLD_TIMINGS.blockMs)),
  )
  const cubeMs = Math.min(
    maxMs,
    Math.max(
      blockMs + gapMs,
      saved(CUBE_PRESS_COOKIE, DEFAULT_HOLD_TIMINGS.cubeMs),
    ),
  )
  return { blockMs, cubeMs }
}

export function holdTimingCookie(name: string, ms: number): string {
  return selectionCookie(name, String(Math.round(ms)))
}

// One of `choices`, else `fallback`.
export function readChoice<T extends string>(
  cookies: string,
  name: string,
  choices: readonly T[],
  fallback: T,
): T {
  const value = readSelection(cookies, name)
  return (choices as readonly string[]).includes(value ?? '')
    ? (value as T)
    : fallback
}

// A whole number kept between `min` and `max`, else `fallback`.
export function readNumber(
  cookies: string,
  name: string,
  { min, max, fallback }: { min: number; max: number; fallback: number },
): number {
  const value = Number.parseInt(readSelection(cookies, name) ?? '', 10)
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback
}

export function numberCookie(name: string, value: number): string {
  return selectionCookie(name, String(Math.round(value)))
}

export function clearedCookie(name: string): string {
  return `${name}=; Max-Age=0; Path=/; SameSite=Lax`
}

// The cookies the settings page edits, which Reset all settings clears.
// The cube, colors and view picked in the scanner are kept.
export const SETTING_COOKIES = [
  MIRROR_COOKIE,
  AUTO_CAPTURE_COOKIE,
  SOUND_COOKIE,
  WIDE_PRESS_COOKIE,
  CUBE_PRESS_COOKIE,
  NOTATION_COOKIE,
  CAPTURE_MODE_COOKIE,
  TURN_SOUND_COOKIE,
  TURN_MS_COOKIE,
  TURN_OVERSHOOT_COOKIE,
  SWIPE_START_COOKIE,
  SWIPE_COMMIT_COOKIE,
  SWIPE_FLICK_COOKIE,
  AUTO_CAPTURE_FRAMES_COOKIE,
  SCRAMBLE_LENGTH_COOKIE,
  SCRAMBLE_INNER_COOKIE,
  VIBRATION_COOKIE,
  FIXTURE_SERVER_URL_COOKIE,
  LOCAL_UPLOAD_COOKIE,
  THEME_COOKIE,
]

export function selectedNotationFormat(cookies: string): 'wrg' | 'urf' {
  return readChoice(cookies, NOTATION_COOKIE, ['wrg', 'urf'] as const, 'wrg')
}

export function selectedCaptureMode(cookies: string): CaptureMode {
  return readChoice(
    cookies,
    CAPTURE_MODE_COOKIE,
    ['cv', 'guide'] as const,
    'cv',
  )
}

export function turnSoundOn(cookies: string): boolean {
  return readPreference(
    cookies,
    TURN_SOUND_COOKIE,
    readPreference(cookies, SOUND_COOKIE),
  )
}

export const TURN_MS_RANGE = { min: 60, max: 400, fallback: DEFAULT_TURN_MS }

export function readTurnFeel(cookies: string): {
  turnMs: number
  overshoot: boolean
} {
  return {
    turnMs: readNumber(cookies, TURN_MS_COOKIE, TURN_MS_RANGE),
    overshoot: readPreference(cookies, TURN_OVERSHOOT_COOKIE, true),
  }
}

export const SWIPE_RANGES = {
  startPx: { min: 8, max: 40, fallback: DEFAULT_SWIPE_TUNING.startPx },
  commitPercent: {
    min: 15,
    max: 60,
    fallback: Math.round(DEFAULT_SWIPE_TUNING.commitFraction * 100),
  },
  flickMs: { min: 0, max: 240, fallback: DEFAULT_SWIPE_TUNING.flickMs },
}

export function readSwipeTuning(cookies: string): SwipeTuning {
  return {
    startPx: readNumber(cookies, SWIPE_START_COOKIE, SWIPE_RANGES.startPx),
    commitFraction:
      readNumber(cookies, SWIPE_COMMIT_COOKIE, SWIPE_RANGES.commitPercent) /
      100,
    flickMs: readNumber(cookies, SWIPE_FLICK_COOKIE, SWIPE_RANGES.flickMs),
  }
}

export const AUTO_CAPTURE_FRAMES_RANGE = {
  min: 2,
  max: 12,
  fallback: AUTO_CAPTURE_STABLE_FRAMES,
}

export function readAutoCaptureFrames(cookies: string): number {
  return readNumber(
    cookies,
    AUTO_CAPTURE_FRAMES_COOKIE,
    AUTO_CAPTURE_FRAMES_RANGE,
  )
}

export type ScrambleLength = 'short' | 'normal' | 'long'

export interface ScrambleOptions {
  length: ScrambleLength
  innerLayers: boolean
}

export function readScrambleOptions(cookies: string): ScrambleOptions {
  return {
    length: readChoice(
      cookies,
      SCRAMBLE_LENGTH_COOKIE,
      ['short', 'normal', 'long'] as const,
      'normal',
    ),
    innerLayers: readPreference(cookies, SCRAMBLE_INNER_COOKIE, true),
  }
}

export function vibrationOn(cookies: string): boolean {
  return readPreference(cookies, VIBRATION_COOKIE, true)
}

export function readFixtureServer(cookies: string): string {
  return (
    loopbackFixtureServer(
      readSelection(cookies, FIXTURE_SERVER_URL_COOKIE) ?? '',
    ) ?? DEFAULT_FIXTURE_SERVER
  )
}

export function localUploadShown(cookies: string): boolean {
  return readPreference(cookies, LOCAL_UPLOAD_COOKIE, true)
}

export type Theme = 'system' | 'light' | 'dark'

export function selectedTheme(cookies: string): Theme {
  return readChoice(
    cookies,
    THEME_COOKIE,
    ['system', 'light', 'dark'] as const,
    'system',
  )
}

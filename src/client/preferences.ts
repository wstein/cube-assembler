// Viewer preferences kept in first-party cookies. These hold only choices
// made in the app; profile definitions remain in local storage.
import { DEFAULT_HOLD_TIMINGS, type HoldTimings } from './cubeGesture'

export const MIRROR_COOKIE = 'cube-assembler-mirror'
export const AUTO_CAPTURE_COOKIE = 'cube-assembler-auto-capture'
export const SOUND_COOKIE = 'cube-assembler-capture-sound'
export const CUBE_SIZE_COOKIE = 'cube-assembler-cube-size'
export const COLOR_PROFILE_COOKIE = 'cube-assembler-color-profile'
export const CUBE_VIEW_COOKIE = 'cube-assembler-cube-view'
export const STICKERLESS_COOKIE = 'cube-assembler-stickerless'
export const AUTO_ROTATE_COOKIE = 'cube-assembler-auto-rotate'
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

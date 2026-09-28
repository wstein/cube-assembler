import { describe, expect, it } from 'vitest'
import {
  AUTO_CAPTURE_COOKIE,
  AUTO_ROTATE_COOKIE,
  COLOR_PROFILE_COOKIE,
  CUBE_SIZE_COOKIE,
  CUBE_VIEW_COOKIE,
  FIXTURE_SERVER_COOKIE,
  MIRROR_COOKIE,
  SOUND_COOKIE,
  STICKERLESS_COOKIE,
  preferenceCookie,
  readPreference,
  readSelection,
  selectionCookie,
  selectedCubeSize,
  selectedCubeView,
  CUBE_PRESS_COOKIE,
  HOLD_TIMING_LIMITS,
  WIDE_PRESS_COOKIE,
  holdTimingCookie,
  readHoldTimings,
} from '../src/client/preferences'

describe('preference cookies', () => {
  it('are off without a cookie', () => {
    for (const name of [MIRROR_COOKIE, AUTO_CAPTURE_COOKIE, SOUND_COOKIE]) {
      expect(readPreference('', name)).toBe(false)
      expect(readPreference('theme=dark', name)).toBe(false)
    }
  })

  it('read each stored choice among other cookies', () => {
    const cookies = `theme=dark; ${MIRROR_COOKIE}=1; ${AUTO_CAPTURE_COOKIE}=0; ${SOUND_COOKIE}=1`
    expect(readPreference(cookies, MIRROR_COOKIE)).toBe(true)
    expect(readPreference(cookies, AUTO_CAPTURE_COOKIE)).toBe(false)
    expect(readPreference(cookies, SOUND_COOKIE)).toBe(true)
  })

  it('store a choice as a first-party cookie for a year', () => {
    expect(preferenceCookie(MIRROR_COOKIE, true)).toBe(
      `${MIRROR_COOKIE}=1; Max-Age=31536000; Path=/; SameSite=Lax`,
    )
    expect(preferenceCookie(SOUND_COOKIE, false)).toBe(
      `${SOUND_COOKIE}=0; Max-Age=31536000; Path=/; SameSite=Lax`,
    )
  })

  it('have distinct names', () => {
    expect(
      new Set([
        MIRROR_COOKIE,
        AUTO_CAPTURE_COOKIE,
        SOUND_COOKIE,
        CUBE_SIZE_COOKIE,
        COLOR_PROFILE_COOKIE,
        FIXTURE_SERVER_COOKIE,
        CUBE_VIEW_COOKIE,
        STICKERLESS_COOKIE,
        AUTO_ROTATE_COOKIE,
      ]).size,
    ).toBe(9)
  })

  it('stores and reads the cube size and color profile selection', () => {
    expect(selectionCookie(CUBE_SIZE_COOKIE, '6')).toBe(
      `${CUBE_SIZE_COOKIE}=6; Max-Age=31536000; Path=/; SameSite=Lax`,
    )
    expect(selectionCookie(COLOR_PROFILE_COOKIE, 'colors/custom 1')).toBe(
      `${COLOR_PROFILE_COOKIE}=colors%2Fcustom%201; Max-Age=31536000; Path=/; SameSite=Lax`,
    )
    const cookies = `${CUBE_SIZE_COOKIE}=6; ${COLOR_PROFILE_COOKIE}=colors%2Fcustom%201`
    expect(selectedCubeSize(cookies)).toBe(6)
    expect(readSelection(cookies, COLOR_PROFILE_COOKIE)).toBe('colors/custom 1')
  })

  it('ignores malformed or unsupported cube-size cookies', () => {
    expect(selectedCubeSize('')).toBeNull()
    expect(selectedCubeSize(`${CUBE_SIZE_COOKIE}=8`)).toBeNull()
    expect(selectedCubeSize(`${CUBE_SIZE_COOKIE}=02`)).toBeNull()
    expect(selectedCubeSize(`${CUBE_SIZE_COOKIE}=%GG`)).toBeNull()
    expect(
      readSelection(`${COLOR_PROFILE_COOKIE}=%GG`, COLOR_PROFILE_COOKIE),
    ).toBeNull()
  })

  it('remembers only supported cube views and keeps stickerless as the default', () => {
    expect(selectedCubeView('')).toBeNull()
    expect(selectedCubeView(`${CUBE_VIEW_COOKIE}=3d`)).toBe('3d')
    expect(selectedCubeView(`${CUBE_VIEW_COOKIE}=net`)).toBe('net')
    expect(selectedCubeView(`${CUBE_VIEW_COOKIE}=other`)).toBeNull()
    expect(readPreference('', STICKERLESS_COOKIE, true)).toBe(true)
    expect(
      readPreference(`${STICKERLESS_COOKIE}=0`, STICKERLESS_COOKIE, true),
    ).toBe(false)
    expect(
      readPreference(`${STICKERLESS_COOKIE}=invalid`, STICKERLESS_COOKIE, true),
    ).toBe(true)
    expect(readPreference(`${AUTO_ROTATE_COOKIE}=1`, AUTO_ROTATE_COOKIE)).toBe(
      true,
    )
  })
})

describe('hold timing cookies', () => {
  it('uses 500 and 1200 ms until other times are saved', () => {
    expect(readHoldTimings('')).toEqual({ blockMs: 500, cubeMs: 1200 })
    const saved = [
      holdTimingCookie(WIDE_PRESS_COOKIE, 350),
      holdTimingCookie(CUBE_PRESS_COOKIE, 900),
    ]
      .map((cookie) => cookie.split(';')[0])
      .join('; ')
    expect(readHoldTimings(saved)).toEqual({ blockMs: 350, cubeMs: 900 })
  })

  it('keeps saved times in range and the whole cube after the block', () => {
    const cookies = (block: string, cube: string) =>
      `${WIDE_PRESS_COOKIE}=${block}; ${CUBE_PRESS_COOKIE}=${cube}`
    expect(readHoldTimings(cookies('50', '99999'))).toEqual({
      blockMs: HOLD_TIMING_LIMITS.minMs,
      cubeMs: HOLD_TIMING_LIMITS.maxMs,
    })
    expect(readHoldTimings(cookies('800', '600'))).toEqual({
      blockMs: 800,
      cubeMs: 800 + HOLD_TIMING_LIMITS.gapMs,
    })
    expect(readHoldTimings(cookies('soon', ''))).toEqual({
      blockMs: 500,
      cubeMs: 1200,
    })
  })
})

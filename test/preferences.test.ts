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
  CAPTURE_MODE_COOKIE,
  AUTO_CAPTURE_FRAMES_COOKIE,
  CUBE_PRESS_COOKIE,
  SCRAMBLE_INNER_COOKIE,
  SCRAMBLE_LENGTH_COOKIE,
  readScrambleOptions,
  readAutoCaptureFrames,
  SWIPE_COMMIT_COOKIE,
  SWIPE_FLICK_COOKIE,
  SWIPE_START_COOKIE,
  readSwipeTuning,
  TURN_MS_COOKIE,
  TURN_OVERSHOOT_COOKIE,
  readTurnFeel,
  TURN_SOUND_COOKIE,
  turnSoundOn,
  NOTATION_COOKIE,
  selectedCaptureMode,
  selectedNotationFormat,
  SETTING_COOKIES,
  clearedCookie,
  numberCookie,
  readChoice,
  readNumber,
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
  it('uses 400 and 900 ms until other times are saved', () => {
    expect(readHoldTimings('')).toEqual({ blockMs: 400, cubeMs: 900 })
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
      blockMs: 400,
      cubeMs: 900,
    })
  })
})

describe('setting cookies', () => {
  it('reads a choice, falling back on anything unknown', () => {
    const choices = ['wrg', 'urf'] as const
    expect(readChoice('x=urf', 'x', choices, 'wrg')).toBe('urf')
    expect(readChoice('x=abc', 'x', choices, 'wrg')).toBe('wrg')
    expect(readChoice('', 'x', choices, 'wrg')).toBe('wrg')
    expect(selectionCookie('x', 'urf')).toContain('x=urf')
  })

  it('reads a number kept within its range', () => {
    const range = { min: 60, max: 400, fallback: 160 }
    expect(readNumber('x=200', 'x', range)).toBe(200)
    expect(readNumber('x=9', 'x', range)).toBe(60)
    expect(readNumber('x=9999', 'x', range)).toBe(400)
    expect(readNumber('x=fast', 'x', range)).toBe(160)
    expect(numberCookie('x', 212.6)).toContain('x=213')
  })

  it('clears every setting cookie for a reset', () => {
    expect(SETTING_COOKIES).toContain(WIDE_PRESS_COOKIE)
    expect(SETTING_COOKIES).toContain(MIRROR_COOKIE)
    expect(SETTING_COOKIES).not.toContain(CUBE_SIZE_COOKIE)
    expect(clearedCookie('x')).toBe('x=; Max-Age=0; Path=/; SameSite=Lax')
  })
})

describe('remembered choices', () => {
  it('remembers the notation format and the capture mode', () => {
    expect(selectedNotationFormat('')).toBe('wrg')
    expect(selectedNotationFormat(`${NOTATION_COOKIE}=urf`)).toBe('urf')
    expect(selectedCaptureMode('')).toBe('cv')
    expect(selectedCaptureMode(`${CAPTURE_MODE_COOKIE}=guide`)).toBe('guide')
    expect(selectedCaptureMode(`${CAPTURE_MODE_COOKIE}=ml`)).toBe('cv')
    expect(SETTING_COOKIES).toEqual(
      expect.arrayContaining([NOTATION_COOKIE, CAPTURE_MODE_COOKIE]),
    )
  })
})

describe('turn sound', () => {
  it('follows the capture sound until it is set on its own', () => {
    expect(turnSoundOn('')).toBe(false)
    expect(turnSoundOn(`${SOUND_COOKIE}=1`)).toBe(true)
    expect(turnSoundOn(`${SOUND_COOKIE}=1; ${TURN_SOUND_COOKIE}=0`)).toBe(false)
    expect(turnSoundOn(`${SOUND_COOKIE}=0; ${TURN_SOUND_COOKIE}=1`)).toBe(true)
    expect(SETTING_COOKIES).toContain(TURN_SOUND_COOKIE)
  })
})

describe('turn feel cookies', () => {
  it('reads the turn speed and overshoot, 160 ms with overshoot by default', () => {
    expect(readTurnFeel('')).toEqual({ turnMs: 160, overshoot: true })
    expect(
      readTurnFeel(`${TURN_MS_COOKIE}=300; ${TURN_OVERSHOOT_COOKIE}=0`),
    ).toEqual({ turnMs: 300, overshoot: false })
    expect(readTurnFeel(`${TURN_MS_COOKIE}=5`).turnMs).toBe(60)
    expect(SETTING_COOKIES).toEqual(
      expect.arrayContaining([TURN_MS_COOKIE, TURN_OVERSHOOT_COOKIE]),
    )
  })
})

describe('swipe sensitivity cookies', () => {
  it('reads the swipe start, commit and flick, with the defaults unset', () => {
    expect(readSwipeTuning('')).toEqual({
      startPx: 18,
      commitFraction: 0.35,
      flickMs: 120,
    })
    expect(
      readSwipeTuning(
        `${SWIPE_START_COOKIE}=30; ${SWIPE_COMMIT_COOKIE}=50; ${SWIPE_FLICK_COOKIE}=0`,
      ),
    ).toEqual({ startPx: 30, commitFraction: 0.5, flickMs: 0 })
    expect(readSwipeTuning(`${SWIPE_COMMIT_COOKIE}=99`).commitFraction).toBe(
      0.6,
    )
    expect(SETTING_COOKIES).toEqual(
      expect.arrayContaining([
        SWIPE_START_COOKIE,
        SWIPE_COMMIT_COOKIE,
        SWIPE_FLICK_COOKIE,
      ]),
    )
  })
})

describe('auto capture steadiness', () => {
  it('waits for 5 matching frames unless set to 2 to 12', () => {
    expect(readAutoCaptureFrames('')).toBe(5)
    expect(readAutoCaptureFrames(`${AUTO_CAPTURE_FRAMES_COOKIE}=8`)).toBe(8)
    expect(readAutoCaptureFrames(`${AUTO_CAPTURE_FRAMES_COOKIE}=1`)).toBe(2)
    expect(readAutoCaptureFrames(`${AUTO_CAPTURE_FRAMES_COOKIE}=50`)).toBe(12)
    expect(SETTING_COOKIES).toContain(AUTO_CAPTURE_FRAMES_COOKIE)
  })
})

describe('scramble settings', () => {
  it('scrambles at normal length with inner layers by default', () => {
    expect(readScrambleOptions('')).toEqual({
      length: 'normal',
      innerLayers: true,
    })
    expect(
      readScrambleOptions(
        `${SCRAMBLE_LENGTH_COOKIE}=short; ${SCRAMBLE_INNER_COOKIE}=0`,
      ),
    ).toEqual({ length: 'short', innerLayers: false })
    expect(SETTING_COOKIES).toEqual(
      expect.arrayContaining([SCRAMBLE_LENGTH_COOKIE, SCRAMBLE_INNER_COOKIE]),
    )
  })
})

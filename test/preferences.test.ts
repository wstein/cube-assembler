import { describe, expect, it } from 'vitest'
import {
  AUTO_CAPTURE_COOKIE,
  MIRROR_COOKIE,
  SOUND_COOKIE,
  preferenceCookie,
  readPreference,
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
      new Set([MIRROR_COOKIE, AUTO_CAPTURE_COOKIE, SOUND_COOKIE]).size,
    ).toBe(3)
  })
})

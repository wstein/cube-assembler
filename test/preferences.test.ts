import { describe, expect, it } from 'vitest'
import { MIRROR_COOKIE, mirrorCookie, readMirrorPreference } from '../src/client/preferences'

describe('mirror preference cookie', () => {
  it('is off without a cookie', () => {
    expect(readMirrorPreference('')).toBe(false)
    expect(readMirrorPreference('theme=dark')).toBe(false)
  })

  it('reads the stored choice among other cookies', () => {
    expect(readMirrorPreference(`theme=dark; ${MIRROR_COOKIE}=1`)).toBe(true)
    expect(readMirrorPreference(`${MIRROR_COOKIE}=0; theme=dark`)).toBe(false)
  })

  it('stores the choice as a first-party cookie for a year', () => {
    expect(mirrorCookie(true)).toBe(`${MIRROR_COOKIE}=1; Max-Age=31536000; Path=/; SameSite=Lax`)
    expect(mirrorCookie(false)).toBe(`${MIRROR_COOKIE}=0; Max-Age=31536000; Path=/; SameSite=Lax`)
  })
})

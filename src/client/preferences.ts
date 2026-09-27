// Viewer preferences kept in a first-party cookie. Strictly necessary: it
// only remembers a choice made in the app, is read by nothing else, and is
// never sent to a third party, so it needs no consent.

export const MIRROR_COOKIE = 'cube-assembler-mirror'
const ONE_YEAR = 365 * 24 * 60 * 60

// Whether the live view is mirrored: off unless the viewer turned it on.
export function readMirrorPreference(cookies: string): boolean {
  return cookies
    .split(';')
    .some((cookie) => cookie.trim() === `${MIRROR_COOKIE}=1`)
}

export function mirrorCookie(mirrored: boolean): string {
  return `${MIRROR_COOKIE}=${mirrored ? 1 : 0}; Max-Age=${ONE_YEAR}; Path=/; SameSite=Lax`
}

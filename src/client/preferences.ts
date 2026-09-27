// Viewer preferences kept in first-party cookies. Strictly necessary: they
// only remember choices made in the app, are read by nothing else, and are
// never sent to a third party, so they need no consent. Each is off unless
// the viewer turned it on.

export const MIRROR_COOKIE = 'cube-assembler-mirror'
export const AUTO_CAPTURE_COOKIE = 'cube-assembler-auto-capture'
export const SOUND_COOKIE = 'cube-assembler-capture-sound'
const ONE_YEAR = 365 * 24 * 60 * 60

export function readPreference(cookies: string, name: string): boolean {
  return cookies
    .split(';')
    .some((cookie) => cookie.trim() === `${name}=1`)
}

export function preferenceCookie(name: string, on: boolean): string {
  return `${name}=${on ? 1 : 0}; Max-Age=${ONE_YEAR}; Path=/; SameSite=Lax`
}

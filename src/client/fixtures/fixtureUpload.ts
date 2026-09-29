import type { Fixture } from './fixtureZip'

const DEV_PROXY = '/fixture-upload'
export const DEFAULT_FIXTURE_SERVER = 'http://127.0.0.1:7100'

// Vite proxies the dev path to the separate localhost-only upload server.
// The published app has no proxy, so it calls that server directly, which
// allows it through CORS; the settings page can move it to another port.
export function fixtureUploadBase(
  dev: boolean,
  localServer = DEFAULT_FIXTURE_SERVER,
): string {
  return dev ? DEV_PROXY : localServer
}

const LOOPBACK_HOSTS = ['127.0.0.1', 'localhost', '[::1]']

// The upload server only ever runs on this computer, so an address set on
// the settings page must be a loopback origin without a path.
export function loopbackFixtureServer(address: string): string | null {
  try {
    const url = new URL(address.trim())
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    if (!LOOPBACK_HOSTS.includes(url.hostname)) return null
    if (url.pathname !== '/' || url.search || url.hash) return null
    return url.origin
  } catch {
    return null
  }
}

// Chrome asks before a public page may reach a local address. The published
// app therefore only checks in the background once an upload there worked;
// until then it waits for a click.
export function pollsFixtureUploadServer(
  dev: boolean,
  usedBefore: boolean,
): boolean {
  return dev || usedBefore
}

export async function fixtureUploadServerAvailable(
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal,
  base = DEV_PROXY,
): Promise<boolean> {
  try {
    const response = await fetcher(`${base}/ping`, {
      method: 'GET',
      cache: 'no-store',
      signal,
    })
    return response.status === 204
  } catch {
    return false
  }
}

export async function uploadFixtureToDevServer(
  fixture: Fixture,
  fetcher: typeof fetch = fetch,
  base = DEV_PROXY,
): Promise<void> {
  const form = new FormData()
  form.set('name', fixture.name)
  for (const [filename, bytes] of Object.entries(fixture.files)) {
    const type = filename.endsWith('.json')
      ? 'application/json'
      : filename.endsWith('.png')
        ? 'image/png'
        : 'image/jpeg'
    form.append('file', new Blob([bytes as BlobPart], { type }), filename)
  }
  const response = await fetcher(`${base}/upload`, {
    method: 'POST',
    headers: { 'X-Fixture-Upload': '1' },
    body: form,
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(
      typeof body?.error === 'string'
        ? body.error
        : `Upload failed (${response.status})`,
    )
  }
}

// The commit to save with a fixture. The dev server answers with the code's
// current commit on each request (see vite.config.ts); the commit built into
// the page is read once when the dev server starts, so it goes stale while
// it runs. Without an answer, the built-in commit is kept.
export async function currentAppCommit(
  builtIn: string,
  fetcher: typeof fetch = fetch,
): Promise<string> {
  try {
    const response = await fetcher('/__app-commit', {
      method: 'GET',
      cache: 'no-store',
    })
    if (!response.ok) return builtIn
    const body = await response.json()
    return typeof body?.commit === 'string' && body.commit
      ? body.commit
      : builtIn
  } catch {
    return builtIn
  }
}

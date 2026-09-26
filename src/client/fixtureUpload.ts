import type { Fixture } from './fixtureZip'

// Vite proxies this path to the separate localhost-only dev server. The
// production build never shows the upload action or configures the proxy.
export async function fixtureUploadServerAvailable(fetcher: typeof fetch = fetch, signal?: AbortSignal): Promise<boolean> {
  try {
    const response = await fetcher('/fixture-upload/upload', {
      method: 'POST', headers: { 'X-Fixture-Probe': '1' }, signal,
    })
    return response.status === 204
  } catch {
    return false
  }
}

export async function uploadFixtureToDevServer(fixture: Fixture, fetcher: typeof fetch = fetch): Promise<void> {
  const form = new FormData()
  form.set('name', fixture.name)
  for (const [filename, bytes] of Object.entries(fixture.files)) {
    const type = filename.endsWith('.json') ? 'application/json' : filename.endsWith('.png') ? 'image/png' : 'image/jpeg'
    form.append('file', new Blob([bytes as BlobPart], { type }), filename)
  }
  const response = await fetcher('/fixture-upload/upload', {
    method: 'POST',
    headers: { 'X-Fixture-Upload': '1' },
    body: form,
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(typeof body?.error === 'string' ? body.error : `Upload failed (${response.status})`)
  }
}

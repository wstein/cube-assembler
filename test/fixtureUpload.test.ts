import { describe, expect, it, vi } from 'vitest'
import type { Fixture } from '../src/client/fixtureZip'
import { fixtureUploadServerAvailable, uploadFixtureToDevServer } from '../src/client/fixtureUpload'

const fixture: Fixture = {
  name: 'capture-example',
  files: {
    'meta.json': new TextEncoder().encode('{"gridSize":3}'),
    ...Object.fromEntries(['u', 'r', 'f', 'd', 'l', 'b'].map((face) => [`face-${face}.jpg`, new Uint8Array([0xff, 0xd8, 0xff])])),
  },
}

describe('fixture upload client', () => {
  it('enables upload only when the server answers its POST probe', async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 204 }))
    expect(await fixtureUploadServerAvailable(fetcher)).toBe(true)
    expect(fetcher).toHaveBeenCalledWith('/fixture-upload/upload', expect.objectContaining({
      method: 'POST', headers: { 'X-Fixture-Probe': '1' },
    }))
    expect(await fixtureUploadServerAvailable(async () => new Response(null, { status: 500 }))).toBe(false)
    expect(await fixtureUploadServerAvailable(async () => { throw new Error('Offline') })).toBe(false)
  })

  it('sends the existing seven files in one multipart POST', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ ok: true, name: fixture.name }), { status: 201 }))
    await uploadFixtureToDevServer(fixture, fetcher)

    expect(fetcher).toHaveBeenCalledOnce()
    const [url, options] = fetcher.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/fixture-upload/upload')
    expect(options.method).toBe('POST')
    expect(options.headers).toEqual({ 'X-Fixture-Upload': '1' })
    const form = options.body as FormData
    expect(form.get('name')).toBe(fixture.name)
    expect(form.getAll('file').map((file) => (file as File).name).sort()).toEqual(Object.keys(fixture.files).sort())
  })

  it('shows a server rejection instead of claiming the fixture was saved', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ error: 'Fixture already exists' }), { status: 409 }))
    await expect(uploadFixtureToDevServer(fixture, fetcher)).rejects.toThrow('Fixture already exists')
  })
})

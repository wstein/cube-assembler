import { describe, expect, it, vi } from 'vitest'
import type { Fixture } from '../src/client/fixtureZip'
import {
  currentAppCommit,
  fixtureUploadBase,
  fixtureUploadServerAvailable,
  pollsFixtureUploadServer,
  uploadFixtureToDevServer,
} from '../src/client/fixtureUpload'

const fixture: Fixture = {
  name: 'capture-example',
  files: {
    'meta.json': new TextEncoder().encode('{"gridSize":3}'),
    ...Object.fromEntries(
      ['u', 'r', 'f', 'd', 'l', 'b'].map((face) => [
        `face-${face}.jpg`,
        new Uint8Array([0xff, 0xd8, 0xff]),
      ]),
    ),
  },
}

describe('fixture upload client', () => {
  it('enables upload only when the server answers its ping', async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 204 }))
    expect(await fixtureUploadServerAvailable(fetcher)).toBe(true)
    expect(fetcher).toHaveBeenCalledWith(
      '/fixture-upload/ping',
      expect.objectContaining({ method: 'GET' }),
    )
    expect(
      await fixtureUploadServerAvailable(
        async () => new Response(null, { status: 500 }),
      ),
    ).toBe(false)
    expect(
      await fixtureUploadServerAvailable(async () => {
        throw new Error('Offline')
      }),
    ).toBe(false)
  })

  it('sends the existing seven files in one multipart POST', async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(JSON.stringify({ ok: true, name: fixture.name }), {
          status: 201,
        }),
    )
    await uploadFixtureToDevServer(fixture, fetcher)

    expect(fetcher).toHaveBeenCalledOnce()
    const [url, options] = fetcher.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ]
    expect(url).toBe('/fixture-upload/upload')
    expect(options.method).toBe('POST')
    expect(options.headers).toEqual({ 'X-Fixture-Upload': '1' })
    const form = options.body as FormData
    expect(form.get('name')).toBe(fixture.name)
    expect(
      form
        .getAll('file')
        .map((file) => (file as File).name)
        .sort(),
    ).toEqual(Object.keys(fixture.files).sort())
  })

  it('shows a server rejection instead of claiming the fixture was saved', async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: 'Fixture already exists' }), {
          status: 409,
        }),
    )
    await expect(uploadFixtureToDevServer(fixture, fetcher)).rejects.toThrow(
      'Fixture already exists',
    )
  })
})

describe('the commit saved with a fixture', () => {
  it("asks the dev server for the code's current commit", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(JSON.stringify({ commit: 'efca9e9-dirty' }), {
          status: 200,
        }),
    )
    expect(await currentAppCommit('600f6c1-dirty', fetcher)).toBe(
      'efca9e9-dirty',
    )
    expect(fetcher).toHaveBeenCalledWith(
      '/__app-commit',
      expect.objectContaining({ cache: 'no-store' }),
    )
  })

  it('keeps the commit the page was built with when the server does not answer', async () => {
    expect(
      await currentAppCommit(
        '600f6c1',
        async () => new Response('Not found', { status: 404 }),
      ),
    ).toBe('600f6c1')
    expect(
      await currentAppCommit('600f6c1', async () => {
        throw new Error('Offline')
      }),
    ).toBe('600f6c1')
    expect(
      await currentAppCommit(
        '600f6c1',
        async () => new Response('{"commit":42}', { status: 200 }),
      ),
    ).toBe('600f6c1')
  })

  it('talks to the local server directly from the published app', async () => {
    expect(fixtureUploadBase(true)).toBe('/fixture-upload')
    const base = fixtureUploadBase(false)
    expect(base).toBe('http://127.0.0.1:7100')
    const ping = vi.fn(async () => new Response(null, { status: 204 }))
    expect(await fixtureUploadServerAvailable(ping, undefined, base)).toBe(true)
    expect(ping).toHaveBeenCalledWith(
      'http://127.0.0.1:7100/ping',
      expect.objectContaining({ method: 'GET' }),
    )
    const post = vi.fn(async () => new Response('{}', { status: 201 }))
    await uploadFixtureToDevServer(fixture, post, base)
    expect((post.mock.calls[0] as unknown as [string])[0]).toBe(
      'http://127.0.0.1:7100/upload',
    )
  })

  it('only polls from the published app after an upload there worked', () => {
    // Chrome asks visitors before a public page may reach localhost, so the
    // published app waits for a click until the server has been used once.
    expect(pollsFixtureUploadServer(true, false)).toBe(true)
    expect(pollsFixtureUploadServer(false, false)).toBe(false)
    expect(pollsFixtureUploadServer(false, true)).toBe(true)
  })
})

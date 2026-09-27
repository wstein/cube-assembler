import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { once } from 'node:events'
import type { Server } from 'node:http'
import { createFixtureUploadServer } from '../scripts/fixtureUploadServer.mjs'

const FACE_KEYS = ['u', 'r', 'f', 'd', 'l', 'b']
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xd9])

function fixtureForm(name = 'capture-test'): FormData {
  const form = new FormData()
  form.set('name', name)
  const faces = Object.fromEntries(
    FACE_KEYS.map((face) => [face, { photo: `face-${face}.jpg` }]),
  )
  const meta = {
    gridSize: 3,
    colorsURFDLB: FACE_KEYS.map((_, i) => 'WROGYB'[i].repeat(9)).join(' '),
    faces,
  }
  form.append(
    'file',
    new Blob([JSON.stringify(meta)], { type: 'application/json' }),
    'meta.json',
  )
  for (const face of FACE_KEYS)
    form.append(
      'file',
      new Blob([JPEG], { type: 'image/jpeg' }),
      `face-${face}.jpg`,
    )
  return form
}

describe('local fixture upload server', () => {
  let server: Server | undefined
  let root: string | undefined
  let url: string

  afterEach(async () => {
    if (server)
      await new Promise<void>((resolve) => server!.close(() => resolve()))
    if (root) await rm(root, { recursive: true, force: true })
  })

  async function start(
    log: (line: string) => void = () => {},
    options?: { allowedOrigins?: string[] },
  ) {
    root = await mkdtemp(join(tmpdir(), 'fixture-upload-'))
    const started = createFixtureUploadServer(root, log, options)
    server = started
    started.listen(0, '127.0.0.1')
    await once(started, 'listening')
    const address = started.address()
    if (!address || typeof address === 'string')
      throw new Error('Missing server port')
    url = `http://127.0.0.1:${address.port}`
  }

  async function upload(
    form: FormData,
    headers: Record<string, string> = { 'X-Fixture-Upload': '1' },
  ) {
    return fetch(`${url}/upload`, { method: 'POST', headers, body: form })
  }

  it('pings without exposing files, writes seven files, and refuses downloads', async () => {
    await start()
    const ping = await fetch(`${url}/ping`)
    expect(ping.status).toBe(204)
    expect(await ping.text()).toBe('')
    expect(await readdir(root!)).toEqual([])
    const response = await upload(fixtureForm())
    expect(response.status).toBe(201)
    expect((await readdir(join(root!, 'capture-test'))).sort()).toEqual([
      'face-b.jpg',
      'face-d.jpg',
      'face-f.jpg',
      'face-l.jpg',
      'face-r.jpg',
      'face-u.jpg',
      'meta.json',
    ])
    expect(
      JSON.parse(
        await readFile(join(root!, 'capture-test', 'meta.json'), 'utf8'),
      ).gridSize,
    ).toBe(3)
    expect((await fetch(`${url}/upload`)).status).toBe(405)
    expect((await fetch(`${url}/ping`, { method: 'POST' })).status).toBe(405)
    expect((await fetch(`${url}/meta.json`)).status).toBe(404)
  })

  it('stores size-prefixed fixture names as directory names', async () => {
    await start()
    const name = 'cube-3x3-2026-09-27T08-55-46'
    expect((await upload(fixtureForm(name))).status).toBe(201)
    expect(await readdir(root!)).toEqual([name])
    expect((await readdir(join(root!, name))).sort()).toEqual([
      'face-b.jpg',
      'face-d.jpg',
      'face-f.jpg',
      'face-l.jpg',
      'face-r.jpg',
      'face-u.jpg',
      'meta.json',
    ])
  })

  it('rejects cross-site form posts, unsafe names, incomplete batches and overwrites', async () => {
    await start()
    expect((await upload(fixtureForm(), {})).status).toBe(403)
    expect((await upload(fixtureForm('../escape'))).status).toBe(400)
    const incomplete = fixtureForm('missing-photo')
    incomplete.delete('file')
    expect((await upload(incomplete)).status).toBe(400)
    expect((await upload(fixtureForm())).status).toBe(201)
    expect((await upload(fixtureForm())).status).toBe(409)
    expect(await readdir(root!)).toEqual(['capture-test'])
  })

  it('traces ping, upload success and rejection without logging file contents', async () => {
    const lines: string[] = []
    await start((line) => lines.push(line))
    await fetch(`${url}/ping`)
    await upload(fixtureForm('trace-test'))
    await upload(fixtureForm('trace-test'))
    expect(lines).toHaveLength(3)
    expect(lines[0]).toMatch(/GET \/ping 204/)
    expect(lines[1]).toMatch(/POST \/upload 201.*trace-test/)
    expect(lines[2]).toMatch(/POST \/upload 409.*Fixture already exists/)
    expect(lines.join('\n')).not.toContain('colorsURFDLB')
  })

  it('lets the published app ping and upload across origins', async () => {
    await start()
    const origin = 'https://wstein.github.io'
    const preflight = await fetch(`${url}/upload`, {
      method: 'OPTIONS',
      headers: {
        Origin: origin,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'x-fixture-upload',
        'Access-Control-Request-Private-Network': 'true',
      },
    })
    expect(preflight.status).toBe(204)
    expect(preflight.headers.get('access-control-allow-origin')).toBe(origin)
    expect(preflight.headers.get('access-control-allow-methods')).toContain(
      'POST',
    )
    expect(
      preflight.headers.get('access-control-allow-headers')?.toLowerCase(),
    ).toContain('x-fixture-upload')
    expect(preflight.headers.get('access-control-allow-private-network')).toBe(
      'true',
    )
    const ping = await fetch(`${url}/ping`, { headers: { Origin: origin } })
    expect(ping.status).toBe(204)
    expect(ping.headers.get('access-control-allow-origin')).toBe(origin)
    const response = await upload(fixtureForm(), {
      'X-Fixture-Upload': '1',
      Origin: origin,
    })
    expect(response.status).toBe(201)
    expect(response.headers.get('access-control-allow-origin')).toBe(origin)
  })

  it('accepts the local dev server but refuses other sites', async () => {
    await start()
    const dev = await upload(fixtureForm('from-dev'), {
      'X-Fixture-Upload': '1',
      Origin: 'http://localhost:5173',
    })
    expect(dev.status).toBe(201)
    const evil = 'https://evil.example'
    const preflight = await fetch(`${url}/upload`, {
      method: 'OPTIONS',
      headers: { Origin: evil, 'Access-Control-Request-Method': 'POST' },
    })
    expect(preflight.status).toBe(403)
    expect(preflight.headers.get('access-control-allow-origin')).toBeNull()
    const ping = await fetch(`${url}/ping`, { headers: { Origin: evil } })
    expect(ping.headers.get('access-control-allow-origin')).toBeNull()
    const post = await upload(fixtureForm('from-evil'), {
      'X-Fixture-Upload': '1',
      Origin: evil,
    })
    expect(post.status).toBe(403)
    expect(await readdir(root!)).toEqual(['from-dev'])
  })

  it('takes the allowed origins as an option', async () => {
    await start(() => {}, { allowedOrigins: ['https://example.test'] })
    const allowed = await fetch(`${url}/ping`, {
      headers: { Origin: 'https://example.test' },
    })
    expect(allowed.headers.get('access-control-allow-origin')).toBe(
      'https://example.test',
    )
    const published = await fetch(`${url}/ping`, {
      headers: { Origin: 'https://wstein.github.io' },
    })
    expect(published.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('shows a status page at / without listing saved fixtures', async () => {
    await start()
    expect((await upload(fixtureForm('secret-name'))).status).toBe(201)
    const page = await fetch(`${url}/`)
    expect(page.status).toBe(200)
    expect(page.headers.get('content-type')).toMatch(/^text\/html/)
    expect(page.headers.get('content-security-policy')).toContain(
      "default-src 'none'",
    )
    const html = await page.text()
    expect(html).toContain('Fixture upload server')
    expect(html).toContain('https://wstein.github.io')
    expect(html).toContain('https://wstein.github.io/cube-assembler/')
    expect(html).not.toContain('secret-name')
    expect((await fetch(`${url}/`, { method: 'POST' })).status).toBe(405)
  })

  it('serves a distinct upload favicon without exposing fixtures', async () => {
    await start()
    const page = await fetch(`${url}/`)
    const html = await page.text()
    expect(html).toContain(
      '<link rel="icon" type="image/svg+xml" href="/favicon.svg">',
    )
    expect(page.headers.get('content-security-policy')).toContain(
      "img-src 'self'",
    )
    const icon = await fetch(`${url}/favicon.svg`)
    expect(icon.status).toBe(200)
    expect(icon.headers.get('content-type')).toBe('image/svg+xml')
    const uploadIcon = await readFile(
      join(__dirname, '../scripts/fixtureUploadFavicon.svg'),
      'utf8',
    )
    expect(await icon.text()).toBe(uploadIcon)
    expect(uploadIcon).not.toBe(
      await readFile(join(__dirname, '../public/favicon.svg'), 'utf8'),
    )
    expect((await fetch(`${url}/favicon.svg`, { method: 'POST' })).status).toBe(
      405,
    )
    expect((await fetch(`${url}/face-u.jpg`)).status).toBe(404)
  })
})

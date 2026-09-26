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
  const faces = Object.fromEntries(FACE_KEYS.map((face) => [face, { photo: `face-${face}.jpg` }]))
  const meta = { gridSize: 3, colorsURFDLB: FACE_KEYS.map((_, i) => 'WROGYB'[i].repeat(9)).join(' '), faces }
  form.append('file', new Blob([JSON.stringify(meta)], { type: 'application/json' }), 'meta.json')
  for (const face of FACE_KEYS) form.append('file', new Blob([JPEG], { type: 'image/jpeg' }), `face-${face}.jpg`)
  return form
}

describe('local fixture upload server', () => {
  let server: Server | undefined
  let root: string | undefined
  let url: string

  afterEach(async () => {
    if (server) await new Promise<void>((resolve) => server!.close(() => resolve()))
    if (root) await rm(root, { recursive: true, force: true })
  })

  async function start() {
    root = await mkdtemp(join(tmpdir(), 'fixture-upload-'))
    server = createFixtureUploadServer(root)
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Missing server port')
    url = `http://127.0.0.1:${address.port}`
  }

  async function upload(form: FormData, headers: Record<string, string> = { 'X-Fixture-Upload': '1' }) {
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
    expect(await readdir(join(root!, 'capture-test'))).toEqual([
      'face-b.jpg', 'face-d.jpg', 'face-f.jpg', 'face-l.jpg', 'face-r.jpg', 'face-u.jpg', 'meta.json',
    ])
    expect(JSON.parse(await readFile(join(root!, 'capture-test', 'meta.json'), 'utf8')).gridSize).toBe(3)
    expect((await fetch(`${url}/upload`)).status).toBe(405)
    expect((await fetch(`${url}/ping`, { method: 'POST' })).status).toBe(405)
    expect((await fetch(`${url}/`)).status).toBe(404)
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
})

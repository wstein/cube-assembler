import { createServer } from 'node:http'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const FACES = ['u', 'r', 'f', 'd', 'l', 'b']
const MAX_BYTES = 30 * 1024 * 1024

class UploadError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

function reply(res, status, message) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(status === 201 ? { ok: true, name: message } : { error: message }))
}

async function readBody(req) {
  if (Number(req.headers['content-length']) > MAX_BYTES) throw new UploadError(413, 'Upload too large')
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BYTES) throw new UploadError(413, 'Upload too large')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

function validFacelets(text, n) {
  return typeof text === 'string' && text.split(/\s+/).length === 6 &&
    text.split(/\s+/).every((face) => face.length === n * n && /^[WOGRBY]+$/.test(face))
}

function validateParts(form) {
  const name = form.get('name')
  if (typeof name !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(name)) {
    throw new UploadError(400, 'Invalid fixture name')
  }
  const entries = [...form.entries()]
  if (entries.length !== 8 || entries.some(([key]) => key !== 'name' && key !== 'file')) {
    throw new UploadError(400, 'Expected a name and seven files')
  }
  const files = form.getAll('file')
  if (files.length !== 7 || files.some((file) => typeof file === 'string')) {
    throw new UploadError(400, 'Expected seven files')
  }
  const byName = new Map(files.map((file) => [file.name, file]))
  if (byName.size !== 7 || !byName.has('meta.json')) {
    throw new UploadError(400, 'Expected meta.json and six distinct photos')
  }
  return { name, byName }
}

async function validateFixture(byName) {
  let meta
  try {
    meta = JSON.parse(await byName.get('meta.json').text())
  } catch {
    throw new UploadError(400, 'Invalid meta.json')
  }
  const n = meta?.gridSize
  if (!Number.isInteger(n) || n < 2 || n > 7 || !validFacelets(meta.colorsURFDLB, n)) {
    throw new UploadError(400, 'Invalid fixture metadata')
  }
  const expected = new Set(['meta.json'])
  for (const face of FACES) {
    const filename = meta.faces?.[face]?.photo
    if (typeof filename !== 'string' || !new RegExp(`^face-${face}\\.(jpg|png)$`).test(filename)) {
      throw new UploadError(400, 'Invalid photo reference')
    }
    expected.add(filename)
    const file = byName.get(filename)
    if (!file) throw new UploadError(400, 'Missing face photo')
    const bytes = new Uint8Array(await file.arrayBuffer())
    const jpeg = filename.endsWith('.jpg') && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    const png = filename.endsWith('.png') && [137, 80, 78, 71, 13, 10, 26, 10].every((byte, i) => bytes[i] === byte)
    if (!jpeg && !png) throw new UploadError(400, 'Invalid face photo')
  }
  if (expected.size !== byName.size || [...byName.keys()].some((filename) => !expected.has(filename))) {
    throw new UploadError(400, 'Unexpected file')
  }
}

export function createFixtureUploadServer(rootDir) {
  return createServer(async (req, res) => {
    if (req.url === '/ping') {
      if (req.method !== 'GET') return reply(res, 405, 'Method not allowed')
      res.writeHead(204, { 'Cache-Control': 'no-store' })
      return res.end()
    }
    if (req.url !== '/upload') return reply(res, 404, 'Not found')
    if (req.method !== 'POST') return reply(res, 405, 'Method not allowed')
    if (req.headers['x-fixture-upload'] !== '1') return reply(res, 403, 'Upload header required')
    if (!req.headers['content-type']?.startsWith('multipart/form-data;')) {
      return reply(res, 415, 'Multipart form required')
    }
    try {
      const body = await readBody(req)
      const request = new Request('http://localhost/upload', {
        method: 'POST', headers: { 'Content-Type': req.headers['content-type'] }, body,
      })
      const { name, byName } = validateParts(await request.formData())
      await validateFixture(byName)
      await mkdir(rootDir, { recursive: true })
      const folder = join(rootDir, name)
      try {
        await mkdir(folder)
      } catch (error) {
        if (error.code === 'EEXIST') throw new UploadError(409, 'Fixture already exists')
        throw error
      }
      try {
        for (const [filename, file] of byName) {
          await writeFile(join(folder, filename), Buffer.from(await file.arrayBuffer()), { flag: 'wx' })
        }
      } catch (error) {
        await rm(folder, { recursive: true, force: true })
        throw error
      }
      reply(res, 201, name)
    } catch (error) {
      reply(res, error instanceof UploadError ? error.status : 400,
        error instanceof UploadError ? error.message : 'Invalid upload')
    }
  })
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const port = 7100
  createFixtureUploadServer(join(process.cwd(), 'test', 'fixtures')).listen(port, '127.0.0.1', () => {
    process.stdout.write(`Fixture upload only: http://127.0.0.1:${port}/upload\n`)
  })
}

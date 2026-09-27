import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const FACES = ['u', 'r', 'f', 'd', 'l', 'b']
const MAX_BYTES = 30 * 1024 * 1024
const FAVICON = readFileSync(
  new URL('./fixtureUploadFavicon.svg', import.meta.url),
)
// The published app may upload here too. Loopback pages (the Vite dev server,
// a local preview) are always allowed; any other site is refused.
export const DEFAULT_ALLOWED_ORIGINS = ['https://wstein.github.io']
const LOOPBACK_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/

class UploadError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

function reply(res, status, message) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  })
  res.end(
    JSON.stringify(
      status === 201 ? { ok: true, name: message } : { error: message },
    ),
  )
}

async function readBody(req) {
  if (Number(req.headers['content-length']) > MAX_BYTES)
    throw new UploadError(413, 'Upload too large')
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
  return (
    typeof text === 'string' &&
    text.split(/\s+/).length === 6 &&
    text
      .split(/\s+/)
      .every((face) => face.length === n * n && /^[WOGRBY]+$/.test(face))
  )
}

function validateParts(form) {
  const name = form.get('name')
  if (
    typeof name !== 'string' ||
    !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(name)
  ) {
    throw new UploadError(400, 'Invalid fixture name')
  }
  const entries = [...form.entries()]
  if (
    entries.length !== 8 ||
    entries.some(([key]) => key !== 'name' && key !== 'file')
  ) {
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
  if (
    !Number.isInteger(n) ||
    n < 2 ||
    n > 7 ||
    !validFacelets(meta.colorsURFDLB, n)
  ) {
    throw new UploadError(400, 'Invalid fixture metadata')
  }
  const expected = new Set(['meta.json'])
  for (const face of FACES) {
    const filename = meta.faces?.[face]?.photo
    if (
      typeof filename !== 'string' ||
      !new RegExp(`^face-${face}\\.(jpg|png)$`).test(filename)
    ) {
      throw new UploadError(400, 'Invalid photo reference')
    }
    expected.add(filename)
    const file = byName.get(filename)
    if (!file) throw new UploadError(400, 'Missing face photo')
    const bytes = new Uint8Array(await file.arrayBuffer())
    const jpeg =
      filename.endsWith('.jpg') &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff
    const png =
      filename.endsWith('.png') &&
      [137, 80, 78, 71, 13, 10, 26, 10].every((byte, i) => bytes[i] === byte)
    if (!jpeg && !png) throw new UploadError(400, 'Invalid face photo')
  }
  if (
    expected.size !== byName.size ||
    [...byName.keys()].some((filename) => !expected.has(filename))
  ) {
    throw new UploadError(400, 'Unexpected file')
  }
}

const escapeHtml = (text) =>
  text.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ],
  )

// What a browser shows at /: that the server runs, who may upload, and how.
// It never lists or links saved fixtures.
function statusPage(rootDir, allowedOrigins) {
  const origins = ['localhost pages (any port)', ...allowedOrigins]
    .map((origin) => `<li><code>${escapeHtml(origin)}</code></li>`)
    .join('')
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Fixture upload server</title>
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<style>
  :root { color-scheme: light dark; --bg: #fafaf7; --fg: #1d1d1b; --muted: #5f5f5a; --ok: #1f7a3a; --card: #fff; --line: #e3e3dd; }
  @media (prefers-color-scheme: dark) { :root { --bg: #151514; --fg: #ededea; --muted: #a3a39d; --ok: #5cc27d; --card: #1f1f1d; --line: #33332f; } }
  body { margin: 0; background: var(--bg); color: var(--fg); font: 16px/1.5 system-ui, sans-serif; }
  main { max-width: 42rem; margin: 0 auto; padding: 2rem 1rem; }
  h1 { font-size: 1.5rem; margin: 0 0 .25rem; }
  .status { color: var(--ok); font-weight: 600; margin: 0 0 1.5rem; }
  section { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 1rem 1.25rem; margin-bottom: 1rem; }
  h2 { font-size: 1rem; margin: 0 0 .5rem; }
  ul, ol { margin: 0; padding-left: 1.25rem; }
  code { font: .9em ui-monospace, monospace; overflow-wrap: anywhere; }
  .muted { color: var(--muted); font-size: .9rem; }
  a { color: inherit; }
</style>
</head>
<body>
<main>
  <h1>Fixture upload server</h1>
  <p class="status">● Running · uploads go to <code>${escapeHtml(rootDir)}</code></p>
  <section>
    <h2>Save a capture as a test fixture</h2>
    <ol>
      <li>Open CubeAssembler: <a href="https://wstein.github.io/cube-assembler/">published app</a> or the dev server at <a href="http://localhost:5173/">localhost:5173</a>.</li>
      <li>Capture and review a cube, then choose <strong>Save as test fixture</strong>.</li>
      <li>Choose <strong>Upload to localhost</strong>. The first time on the published app, Chrome may ask to allow access to devices on your local network.</li>
    </ol>
  </section>
  <section>
    <h2>Uploads accepted from</h2>
    <ul>${origins}</ul>
    <p class="muted">Set <code>FIXTURE_UPLOAD_ORIGINS</code> (comma separated) to change the non-local sites.</p>
  </section>
  <section>
    <h2>Endpoints</h2>
    <ul>
      <li><code>GET /ping</code> answers 204 when the server runs.</li>
      <li><code>POST /upload</code> takes a name, <code>meta.json</code> and six face photos, with <code>X-Fixture-Upload: 1</code>. Existing fixtures are never overwritten.</li>
    </ul>
    <p class="muted">Listens on 127.0.0.1 only and never serves saved files.</p>
  </section>
</main>
</body>
</html>
`
}

export function createFixtureUploadServer(
  rootDir,
  log = console.log,
  { allowedOrigins = DEFAULT_ALLOWED_ORIGINS } = {},
) {
  return createServer(async (req, res) => {
    const started = performance.now()
    const origin = req.headers.origin
    const originAllowed =
      origin === undefined ||
      LOOPBACK_ORIGIN.test(origin) ||
      allowedOrigins.includes(origin)
    if (origin !== undefined && originAllowed) {
      res.setHeader('Access-Control-Allow-Origin', origin)
      res.setHeader('Vary', 'Origin')
    }
    const path = (req.url ?? '')
      .split('?')[0]
      .replace(/[\x00-\x1f\x7f]/g, '?')
      .slice(0, 120)
    const trace = (status, detail) =>
      log(
        `[fixture] ${req.method ?? '?'} ${path} ${status} ${detail} ${Math.round(performance.now() - started)}ms`,
      )
    const send = (status, message) => {
      reply(res, status, message)
      trace(status, message)
    }
    if (req.method === 'OPTIONS') {
      if (!originAllowed || (req.url !== '/ping' && req.url !== '/upload'))
        return send(403, 'Origin not allowed')
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST')
      res.setHeader('Access-Control-Allow-Headers', 'X-Fixture-Upload')
      res.setHeader('Access-Control-Max-Age', '600')
      // Chrome asks before a public site may reach a local address.
      if (req.headers['access-control-request-private-network'] === 'true')
        res.setHeader('Access-Control-Allow-Private-Network', 'true')
      res.writeHead(204, { 'Cache-Control': 'no-store' })
      res.end()
      return trace(204, `preflight ${origin ?? ''}`.trim())
    }
    if (req.url === '/') {
      if (req.method !== 'GET') return send(405, 'Method not allowed')
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'Content-Security-Policy':
          "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; frame-ancestors 'none'",
        'X-Content-Type-Options': 'nosniff',
      })
      res.end(statusPage(rootDir, allowedOrigins))
      return trace(200, 'status page')
    }
    if (req.url === '/favicon.svg') {
      if (req.method !== 'GET') return send(405, 'Method not allowed')
      res.writeHead(200, {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      })
      res.end(FAVICON)
      return trace(200, 'favicon')
    }
    if (req.url === '/ping') {
      if (req.method !== 'GET') return send(405, 'Method not allowed')
      res.writeHead(204, { 'Cache-Control': 'no-store' })
      res.end()
      return trace(204, 'ready')
    }
    if (req.url !== '/upload') return send(404, 'Not found')
    if (req.method !== 'POST') return send(405, 'Method not allowed')
    if (!originAllowed) return send(403, 'Origin not allowed')
    if (req.headers['x-fixture-upload'] !== '1')
      return send(403, 'Upload header required')
    if (!req.headers['content-type']?.startsWith('multipart/form-data;')) {
      return send(415, 'Multipart form required')
    }
    try {
      const body = await readBody(req)
      const request = new Request('http://localhost/upload', {
        method: 'POST',
        headers: { 'Content-Type': req.headers['content-type'] },
        body,
      })
      const { name, byName } = validateParts(await request.formData())
      await validateFixture(byName)
      await mkdir(rootDir, { recursive: true })
      const folder = join(rootDir, name)
      try {
        await mkdir(folder)
      } catch (error) {
        if (error.code === 'EEXIST')
          throw new UploadError(409, 'Fixture already exists')
        throw error
      }
      try {
        for (const [filename, file] of byName) {
          await writeFile(
            join(folder, filename),
            Buffer.from(await file.arrayBuffer()),
            { flag: 'wx' },
          )
        }
      } catch (error) {
        await rm(folder, { recursive: true, force: true })
        throw error
      }
      reply(res, 201, name)
      trace(201, `saved ${name} (7 files)`)
    } catch (error) {
      send(
        error instanceof UploadError ? error.status : 400,
        error instanceof UploadError ? error.message : 'Invalid upload',
      )
    }
  })
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const port = 7100
  const allowedOrigins = process.env.FIXTURE_UPLOAD_ORIGINS
    ? process.env.FIXTURE_UPLOAD_ORIGINS.split(',').map((o) => o.trim())
    : DEFAULT_ALLOWED_ORIGINS
  createFixtureUploadServer(
    join(process.cwd(), 'test', 'fixtures'),
    undefined,
    {
      allowedOrigins,
    },
  ).listen(port, '127.0.0.1', () => {
    process.stdout.write(
      `Fixture upload only: http://127.0.0.1:${port}/upload\n` +
        `Accepting uploads from localhost and ${allowedOrigins.join(', ')}\n`,
    )
  })
}

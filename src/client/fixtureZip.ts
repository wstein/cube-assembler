// Regression fixtures as zip files, made and read in the browser: a saved
// capture downloads as <name>.zip holding <name>/meta.json and its 6
// face-*.jpg photos - unzipped into test/fixtures/ it is a fixture
// test/fixtures.test.ts runs (see test/fixtures/README.md). Uploading
// takes the same zip back.

import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { wrgFaceletsToGrids } from './notationOutput'

export interface FixtureRequest {
  name?: string
  gridSize: number
  // Human-verified colors of all 6 faces as one WRG facelets string in
  // U R F D L B order (each face row-major, as photographed), e.g.
  // "GRRYOYWYW WYWROGORB ...". `detectedURFDLB` is the same for what
  // detection produced before any hand correction.
  colorsURFDLB: string
  detectedURFDLB?: string
  // Each face's photo as a JPEG/PNG data URL; any other per-face fields
  // (crop, camera settings, ...) are informational and stored as-is.
  faces: Record<string, { photo: string } & Record<string, unknown>>
  // Informational capture context (camera, white balance, etc), stored
  // as-is under `capture` for later debugging.
  meta?: unknown
}

export interface Fixture {
  name: string
  // Paths inside the fixture directory: meta.json and the photos.
  files: Record<string, Uint8Array>
}

const REQUIRED_FACES = ['u', 'r', 'f', 'd', 'l', 'b']

function dataUrlBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

// The fixture directory for a capture; throws on an incomplete one.
export function buildFixture(request: FixtureRequest, now = new Date()): Fixture {
  const faceEntries = Object.entries(request.faces ?? {}).map(([key, value]) => [key.toLowerCase(), value] as const)
  const faceKeys = new Set(faceEntries.map(([key]) => key))
  if (!REQUIRED_FACES.every((f) => faceKeys.has(f))) throw new Error('Expected all 6 faces (U, R, F, D, L, B)')
  if (!Number.isInteger(request.gridSize) || request.gridSize < 2 || request.gridSize > 7) {
    throw new Error('gridSize must be an integer between 2 and 7')
  }
  for (const key of ['colorsURFDLB', 'detectedURFDLB'] as const) {
    const value = request[key]
    if (value === undefined && key === 'detectedURFDLB') continue
    const grids = typeof value === 'string' ? wrgFaceletsToGrids(value) : null
    if (!grids || grids.U.length !== request.gridSize) {
      throw new Error(`${key} must be 6 space-separated ${request.gridSize}x${request.gridSize} faces of W/O/G/R/B/Y`)
    }
  }

  // The zip's folder name, and so the fixture's directory name.
  const rawName = request.name ?? `capture-${now.toISOString().replace(/[:.]/g, '-')}`
  const name = rawName.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 80)
  if (!name) throw new Error('Invalid fixture name')

  const files: Record<string, Uint8Array> = {}
  const faces: Record<string, { photo: string } & Record<string, unknown>> = {}
  for (const [faceKey, faceData] of faceEntries) {
    const match = /^data:image\/(jpeg|jpg|png);base64,(.+)$/.exec(faceData.photo ?? '')
    if (!match) throw new Error(`Face ${faceKey.toUpperCase()}: photo must be a JPEG/PNG data URL`)
    const photo = `face-${faceKey}.${match[1] === 'png' ? 'png' : 'jpg'}`
    files[photo] = dataUrlBytes(match[2])
    const { photo: _photo, ...extra } = faceData
    faces[faceKey] = { photo, ...extra }
  }
  const meta = {
    gridSize: request.gridSize,
    colorsURFDLB: request.colorsURFDLB,
    ...(request.detectedURFDLB !== undefined ? { detectedURFDLB: request.detectedURFDLB } : {}),
    faces,
    capture: request.meta ?? {},
  }
  files['meta.json'] = strToU8(JSON.stringify(meta, null, 2))
  return { name, files }
}

// The photos are JPEG/PNG already, so they're stored uncompressed.
export function zipFixture(fixture: Fixture): Uint8Array {
  return zipSync(Object.fromEntries(Object.entries(fixture.files).map(([path, data]) => [
    `${fixture.name}/${path}`,
    [data, { level: path.endsWith('.json') ? 6 : 0 }],
  ])))
}

// A fixture zip's files as File objects named as in its directory (so
// meta.json's `photo` names find them), from the folder holding
// meta.json. Throws when the zip has no meta.json.
export function unzipFixture(zip: Uint8Array): File[] {
  const entries = Object.entries(unzipSync(zip)).filter(([path]) => !path.startsWith('__MACOSX/') && !path.endsWith('/'))
  const meta = entries.find(([path]) => path === 'meta.json' || path.endsWith('/meta.json'))
  if (!meta) throw new Error('No meta.json in the zip')
  const folder = meta[0].slice(0, meta[0].length - 'meta.json'.length)
  return entries
    .filter(([path]) => path.startsWith(folder) && !path.slice(folder.length).includes('/'))
    .map(([path, data]) => new File([data as BlobPart], path.slice(folder.length), {
      type: path.endsWith('.json') ? 'application/json' : path.endsWith('.png') ? 'image/png' : 'image/jpeg',
    }))
}

export interface FixturePhoto {
  // The capture slot (u, r, f, d, l, b) and its file in the zip.
  face: string
  file: string
  bytes: Uint8Array
}

export interface FixtureSummary {
  photos: FixturePhoto[]
  // What meta.json records, as label/value pairs to show before saving.
  rows: Array<[string, string]>
}

const FACE_KEYS = ['u', 'r', 'f', 'd', 'l', 'b']
const SOURCE_NAMES: Record<string, string> = { camera: 'camera', 'image-file': 'image files', fixture: 'an uploaded fixture' }

// What a fixture holds - its photos and a readable digest of meta.json -
// so the customer sees what they're about to save or share.
export function summarizeFixture(fixture: Fixture): FixtureSummary {
  const meta = JSON.parse(strFromU8(fixture.files['meta.json']))
  const capture = meta.capture ?? {}
  const photos = FACE_KEYS.filter((face) => meta.faces[face]).map((face) => {
    const file = meta.faces[face].photo
    return { face, file, bytes: fixture.files[file] }
  })
  const rows: Array<[string, string]> = [['Cube', `${meta.gridSize}×${meta.gridSize}`]]
  if (meta.detectedURFDLB) {
    const fixed = [...meta.colorsURFDLB].filter((c, i) => c !== meta.detectedURFDLB[i]).length
    rows.push(['Fixed by hand', fixed === 0 ? 'nothing - detection was right' : `${fixed} sticker${fixed === 1 ? '' : 's'}`])
  } else {
    rows.push(['Fixed by hand', 'not recorded'])
  }
  rows.push(['Capture', capture.protocol ? 'guided (4 sides, then top and bottom)' : 'free order'])
  const sources = [...new Set(FACE_KEYS.map((face) => meta.faces[face]?.source).filter(Boolean))]
  if (sources.length) rows.push(['Photos from', sources.map((s) => SOURCE_NAMES[s as string] ?? s).join(', ')])
  if (capture.camera) {
    const { width, height } = capture.camera.granted ?? {}
    rows.push(['Camera', `${capture.camera.label}${width && height ? `, ${width}×${height}` : ''}`])
  }
  if (capture.profile?.name) rows.push(['Cube profile', capture.profile.name])
  if (capture.colorProfile?.name) {
    const used = capture.colorProfile
    rows.push(['Sticker colors', `${used.selection === 'automatic' ? 'Automatic → ' : ''}${used.name}`])
    const rgb = ['W', 'Y', 'O', 'R', 'G', 'B'].flatMap((color) => {
      const value = used.colors?.[color]
      return value && [value.r, value.g, value.b].every(Number.isFinite)
        ? [`${color} ${value.r},${value.g},${value.b}`] : []
    })
    if (rgb.length) rows.push(['Sticker RGB', rgb.join(' · ')])
  }
  if ('backgroundWhiteBalance' in capture) {
    const gains = Object.values(capture.backgroundWhiteBalance ?? {}) as Array<{ r: number; g: number; b: number }>
    const largest = Math.max(1, ...gains.flatMap(({ r, g, b }) => [r, g, b].map((v) => Math.max(v, 1 / v))))
    rows.push(['Backdrop balance', gains.length === 0 ? 'not applied' : largest < 1.005 ? 'sides already matched' : `sides matched, largest correction ×${largest.toFixed(2)}`])
  }
  if (capture.colorCalibration) {
    rows.push(['Colors learned', capture.colorCalibration.learnedColors ? 'from this capture' : 'no - standard colors used'])
  }
  if (capture.app) rows.push(['App', `${capture.app.version ?? '?'}${capture.app.commit ? ` (${capture.app.commit})` : ''}`])
  if (capture.capturedAt) rows.push(['Saved', new Date(capture.capturedAt).toLocaleString()])
  return { photos, rows }
}

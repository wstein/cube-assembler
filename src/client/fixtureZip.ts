// Regression fixtures as zip files, made and read in the browser (the
// layout and digest live in src/core/capture/FixtureZip.res): a saved
// capture downloads as <name>.zip holding <name>/meta.json and its 6
// face-*.jpg photos - unzipped into test/fixtures/ it is a fixture
// test/fixtures.test.ts runs (see test/fixtures/README.md). Uploading
// takes the same zip back.

import { fixtureLayout, summarizeMeta } from '../core/capture/FixtureZip.gen'

const encoder = new TextEncoder()
const decoder = new TextDecoder()

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

function dataUrlBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

// The fixture directory for a capture; throws on an incomplete one.
export function buildFixture(
  request: FixtureRequest,
  now = new Date(),
): Fixture {
  const layout = fixtureLayout(request, now.toISOString())
  const files: Record<string, Uint8Array> = {}
  for (const { file, base64 } of layout.photos)
    files[file] = dataUrlBytes(base64)
  files['meta.json'] = encoder.encode(JSON.stringify(layout.meta, null, 2))
  return { name: layout.name, files }
}

// The photos are JPEG/PNG already, so they're stored uncompressed.
export async function zipFixture(fixture: Fixture): Promise<Uint8Array> {
  const { zipSync } = await import('fflate')
  return zipSync(
    Object.fromEntries(
      Object.entries(fixture.files).map(([path, data]) => [
        `${fixture.name}/${path}`,
        [data, { level: path.endsWith('.json') ? 6 : 0 }],
      ]),
    ),
  )
}

// The combined upload picker also accepts a zip of photos without metadata.
// Flatten its one photo folder, leaving validation to the chosen import flow.
export async function unzipUploadFiles(zip: Uint8Array): Promise<File[]> {
  const { unzipSync } = await import('fflate')
  return Object.entries(unzipSync(zip))
    .filter(([path]) => {
      const name = path.split('/').at(-1) ?? ''
      return (
        !path.startsWith('__MACOSX/') &&
        !path.endsWith('/') &&
        name !== '.DS_Store' &&
        !name.startsWith('._')
      )
    })
    .map(([path, data]) => {
      const name = path.split('/').at(-1)!
      const lower = name.toLowerCase()
      return new File([data as BlobPart], name, {
        type: lower.endsWith('.json')
          ? 'application/json'
          : lower.endsWith('.png')
            ? 'image/png'
            : lower.endsWith('.webp')
              ? 'image/webp'
              : 'image/jpeg',
      })
    })
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

// What a fixture holds - its photos and a readable digest of meta.json -
// so the customer sees what they're about to save or share.
export function summarizeFixture(fixture: Fixture): FixtureSummary {
  const { photos, rows } = summarizeMeta(
    JSON.parse(decoder.decode(fixture.files['meta.json'])),
  )
  return {
    photos: photos.map(({ face, file }) => ({
      face,
      file,
      bytes: fixture.files[file],
    })),
    rows: [...rows],
  }
}

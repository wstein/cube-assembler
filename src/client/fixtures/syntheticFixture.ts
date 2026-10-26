// A fixture of a cube state that has no camera photos: its faces rendered
// (see src/core/vision/SyntheticFace.res) and saved like a capture. The
// request itself is built in src/core/capture/SyntheticFixture.res.
import type { CubeState } from '../../cube/cubeAssembly'
import type { ParityResult } from '../../cube/parity'
import {
  toWRGFacelets,
  wrgFaceletsToGrids,
} from '../../cube/notation/NotationOutput.gen'
import {
  fingerprintJson,
  syntheticRequest,
} from '../../core/capture/SyntheticFixture.gen'
import { renderFace, type SyntheticOptions } from '../vision/syntheticFace'
import { embedFingerprint } from './photoMetadata'
import { buildFixture, type Fixture, type FixtureRequest } from './fixtureZip'

// Side of each rendered photo, like the crops of real captures.
const PHOTO_PIXELS = 600
const FACES = ['u', 'r', 'f', 'd', 'l', 'b']

export interface SyntheticFixtureInput {
  cube: CubeState
  parity: ParityResult | null
  preset: string
  seed: number
  // Generator options (see SyntheticOptions), saved in the metadata so the
  // photos can be rendered again.
  options?: SyntheticOptions
  version: string
  commit: string
}

// Turns a photo's RGBA pixels into a JPEG/PNG data URL (a canvas in the
// browser).
export type EncodePhoto = (rgba: Uint8ClampedArray, size: number) => string

// The browser's encoder: a canvas as JPEG.
export const encodeCanvasPhoto: EncodePhoto = (rgba, size) => {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  if (!context) throw new Error('No canvas to render the synthetic photos on')
  context.putImageData(new ImageData(rgba as never, size, size), 0, 0)
  return canvas.toDataURL('image/jpeg', 0.92)
}

const JPEG_URL = 'data:image/jpeg;base64,'

// A JPEG data URL with the fingerprint in it; other encodings stay as they
// are.
function fingerprintPhoto(dataUrl: string, json: string): string {
  if (!dataUrl.startsWith(JPEG_URL)) return dataUrl
  const binary = atob(dataUrl.slice(JPEG_URL.length))
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  const marked = embedFingerprint(bytes, json)
  let out = ''
  for (let i = 0; i < marked.length; i += 0x8000)
    out += String.fromCharCode(...marked.subarray(i, i + 0x8000))
  return JPEG_URL + btoa(out)
}

export function buildSyntheticFixture(
  input: SyntheticFixtureInput,
  encode: EncodePhoto,
  now = new Date(),
): Fixture {
  const colors = toWRGFacelets(input.cube)
  const grids = wrgFaceletsToGrids(colors)
  if (!grids) throw new Error('The cube state has no six square faces')
  const options = input.options ?? {}
  const photos: Record<string, string> = {}
  const seeds: Record<string, number> = {}
  FACES.forEach((face, i) => {
    seeds[face] = input.seed + i
    photos[face] = fingerprintPhoto(
      encode(
        renderFace(
          grids[face.toUpperCase()],
          input.preset,
          seeds[face],
          PHOTO_PIXELS,
          options,
        ),
        PHOTO_PIXELS,
      ),
      fingerprintJson({
        preset: input.preset,
        seed: seeds[face],
        face,
        size: PHOTO_PIXELS,
        options,
        version: input.version,
        commit: input.commit,
      }),
    )
  })
  const request = syntheticRequest({
    colors,
    size: Math.sqrt(input.cube.u.length),
    preset: input.preset,
    seed: input.seed,
    seeds,
    photoSize: PHOTO_PIXELS,
    options,
    invalid: input.parity?.valid === false ? input.parity.result : undefined,
    version: input.version,
    commit: input.commit,
    photos,
    now: now.toISOString(),
  })
  return buildFixture(request as FixtureRequest, now)
}

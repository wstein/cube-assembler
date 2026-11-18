import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import Ajv2020 from 'ajv/dist/2020.js'
import jpeg from 'jpeg-js'
import { describe, expect, it } from 'vitest'
import { parityStatus } from '../src/client/capture/captureFlow'
import { readFixtureColors } from '../src/client/fixtures/fixtureFormat'
import {
  summarizeFixture,
  unzipUploadFiles,
  zipFixture,
} from '../src/client/fixtures/fixtureZip'
import { readFingerprint } from '../src/client/fixtures/photoMetadata'
import { buildSyntheticFixture } from '../src/client/fixtures/syntheticFixture'
import { NEUTRAL_GAINS } from '../src/client/vision/colorMath'
import { extractColorsFromImageData } from '../src/client/vision/faceDetection'
import { DEFAULT_SAMPLING } from '../src/client/vision/stickerColorGeometry'
import { randomCube } from '../src/cube/randomState'
import { toWRGFacelets } from '../src/cube/notation/NotationOutput.gen'
import { ALL_SIZES } from './cubeSizes'

// Synthetic fixtures of every size 2 to 15: a random valid cube is rendered
// to six JPEG faces, saved as a fixture, zipped and unzipped again, and the
// app's own detection reads the photos back as the cube's colors.
const FACES = ['u', 'r', 'f', 'd', 'l', 'b'] as const
const NOW = new Date('2026-11-18T12:00:00.000Z')
const decoder = new TextDecoder()

const encode = (rgba: Uint8ClampedArray, size: number) =>
  `data:image/jpeg;base64,${Buffer.from(
    jpeg.encode({ data: Buffer.from(rgba), width: size, height: size }, 92)
      .data,
  ).toString('base64')}`

const validate = new Ajv2020({ allErrors: true }).compile(
  JSON.parse(
    readFileSync(
      join(__dirname, '../public/schemas/fixture-meta-v1.schema.json'),
      'utf8',
    ),
  ),
)

function build(size: number) {
  const cube = randomCube(size, 40 + size)
  return {
    cube,
    fixture: buildSyntheticFixture(
      {
        cube,
        parity: parityStatus(cube, size),
        preset: 'clean',
        seed: 5,
        version: '0.1.0',
        commit: 'abc1234',
      },
      encode,
      NOW,
    ),
  }
}

describe.each(ALL_SIZES)('a synthetic fixture of size %i', (size) => {
  // Twelve 600 px renders and JPEG encodings: seconds on a busy machine.
  const timeout = 120_000

  it(
    'records the size and colors and validates against the published schema',
    () => {
      const { cube, fixture } = build(size)
      const meta = JSON.parse(decoder.decode(fixture.files['meta.json']))
      expect(fixture.name).toBe(`synt-${size}x${size}-2026-11-18T12-00-00`)
      expect(meta.gridSize).toBe(size)
      expect(meta.colorsURFDLB).toBe(toWRGFacelets(cube))
      expect(validate(meta), JSON.stringify(validate.errors)).toBe(true)
      expect(meta.tags).not.toContain('invalid-state')
      const colors = readFixtureColors(meta)!.colors
      for (const face of FACES)
        expect(colors[face.toUpperCase()], face).toHaveLength(size)
      const rows = Object.fromEntries(summarizeFixture(fixture).rows)
      expect(rows['Photos from']).toMatch(/synthetic/i)
    },
    timeout,
  )

  it(
    'survives a zip round trip and reads back as the cube by the app detection',
    async () => {
      const { fixture } = build(size)
      const meta = JSON.parse(decoder.decode(fixture.files['meta.json']))
      const files = await unzipUploadFiles(await zipFixture(fixture))
      expect(files.map((f) => f.name).sort()).toEqual(
        [...FACES.map((face) => `face-${face}.jpg`), 'meta.json'].sort(),
      )
      const unzipped = JSON.parse(
        await files.find((f) => f.name === 'meta.json')!.text(),
      )
      expect(unzipped).toEqual(meta)
      const colors = readFixtureColors(unzipped)!.colors
      for (const face of FACES) {
        const bytes = new Uint8Array(
          await files.find((f) => f.name === `face-${face}.jpg`)!.arrayBuffer(),
        )
        expect(JSON.parse(readFingerprint(bytes) ?? 'null')).toMatchObject({
          renderer: 'parametric/v1',
          face,
          size: 600,
        })
        const decoded = jpeg.decode(bytes, { useTArray: true })
        const read = extractColorsFromImageData(
          Uint8ClampedArray.from(decoded.data),
          decoded.width,
          decoded.height,
          size,
          NEUTRAL_GAINS,
          DEFAULT_SAMPLING,
        )
        expect(read.colors, `${size}x${size} face ${face}`).toEqual(
          colors[face.toUpperCase()],
        )
      }
    },
    timeout,
  )
})

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import Ajv2020 from 'ajv/dist/2020.js'
import jpeg from 'jpeg-js'
import { createSolvedCube } from '../src/cube/cubeAssembly'
import { toWRGFacelets } from '../src/cube/notation/NotationOutput.gen'
import { parityStatus } from '../src/client/capture/captureFlow'
import { readFixtureColors } from '../src/client/fixtures/fixtureFormat'
import { summarizeFixture } from '../src/client/fixtures/fixtureZip'
import {
  embedFingerprint,
  readFingerprint,
} from '../src/client/fixtures/photoMetadata'
import { buildSyntheticFixture } from '../src/client/fixtures/syntheticFixture'
import {
  renderFace,
  type SyntheticOptions,
} from '../src/client/vision/syntheticFace'
import { wrgFaceletsToGrids } from '../src/cube/notation/NotationOutput.gen'
import { extractColorsFromImageData } from '../src/client/vision/faceDetection'
import { NEUTRAL_GAINS } from '../src/client/vision/colorMath'
import { DEFAULT_SAMPLING } from '../src/client/vision/stickerColorGeometry'

// The browser encodes with a canvas; the tests use a JPEG encoder.
const encode = (rgba: Uint8ClampedArray, size: number) =>
  `data:image/jpeg;base64,${Buffer.from(
    jpeg.encode({ data: Buffer.from(rgba), width: size, height: size }, 92)
      .data,
  ).toString('base64')}`

const NOW = new Date('2026-10-27T12:30:45.000Z')
const decoder = new TextDecoder()

function build(
  cube = createSolvedCube(3),
  preset = 'clean',
  options?: SyntheticOptions,
) {
  return buildSyntheticFixture(
    {
      cube,
      parity: parityStatus(cube, 3),
      preset,
      seed: 3,
      options,
      version: '0.1.0',
      commit: 'abc1234',
    },
    encode,
    NOW,
  )
}
const metaOf = (fixture: { files: Record<string, Uint8Array> }) =>
  JSON.parse(decoder.decode(fixture.files['meta.json']))

// Only read-only metadata checks reuse this fixed default fixture. Keep the
// cached bytes private and give every caller independent mutable file buffers.
// Image-pipeline and byte-for-byte reconstruction cases still call build().
let cachedMetadataFixture: ReturnType<typeof build> | undefined
function metadataFixture() {
  cachedMetadataFixture ??= build()
  return structuredClone(cachedMetadataFixture)
}

describe('synthetic fixtures', () => {
  it('writes a fingerprint into every photo that says how it was made', () => {
    const fixture = build(createSolvedCube(3), 'dim-warm', {
      shadow: { strength: 0.2 },
    })
    for (const [i, face] of ['u', 'r', 'f', 'd', 'l', 'b'].entries()) {
      const text = readFingerprint(fixture.files[`face-${face}.jpg`])
      expect(JSON.parse(text ?? 'null')).toEqual({
        v: 1,
        renderer: 'parametric/v1',
        preset: 'dim-warm',
        seed: 3 + i,
        face,
        size: 600,
        options: { shadow: { strength: 0.2 } },
        app: { version: '0.1.0' },
      })
    }
  })

  it('is named and tagged synthetic, so people and tools both see it', () => {
    const fixture = metadataFixture()
    const meta = metaOf(fixture)
    expect(fixture.name).toBe('synt-3x3-2026-10-27T12-30-45')
    expect(meta.tags).toEqual(
      expect.arrayContaining([
        'synthetic',
        'software-rendered',
        'preset:clean',
      ]),
    )
    expect(meta.capture.synthetic).toMatchObject({
      renderer: 'parametric/v1',
      preset: 'clean',
      seed: 3,
    })
    for (const face of ['u', 'r', 'f', 'd', 'l', 'b'])
      expect(meta.faces[face]).toMatchObject({
        photo: `face-${face}.jpg`,
        source: 'synthetic',
      })
  })

  it('validates against the published fixture schema', () => {
    const schema = JSON.parse(
      readFileSync(
        join(__dirname, '../public/schemas/fixture-meta-v1.schema.json'),
        'utf8',
      ),
    )
    const validate = new Ajv2020({ allErrors: true }).compile(schema)
    expect(
      validate(metaOf(metadataFixture())),
      JSON.stringify(validate.errors),
    ).toBe(true)
  })

  it("holds the cube's colors, and the app reads its photos back as them", () => {
    const cube = createSolvedCube(3)
    const fixture = build(cube)
    const meta = metaOf(fixture)
    expect(meta.colorsURFDLB).toBe(toWRGFacelets(cube))
    const colors = readFixtureColors(meta)!.colors
    for (const face of ['u', 'r', 'f', 'd', 'l', 'b']) {
      const decoded = jpeg.decode(fixture.files[`face-${face}.jpg`], {
        useTArray: true,
      })
      const read = extractColorsFromImageData(
        Uint8ClampedArray.from(decoded.data),
        decoded.width,
        decoded.height,
        3,
        NEUTRAL_GAINS,
        DEFAULT_SAMPLING,
      )
      expect(read.colors, face).toEqual(colors[face.toUpperCase()])
    }
  })

  it('names the lighting preset in the tags and the summary', () => {
    const fixture = build(createSolvedCube(3), 'shadow')
    expect(metaOf(fixture).tags).toContain('preset:shadow')
    const rows = Object.fromEntries(summarizeFixture(fixture).rows)
    expect(rows['Photos from']).toMatch(/synthetic/i)
    expect(rows['Lighting']).toBe('shadow')
  })

  it('records an invalid state as such instead of refusing it', () => {
    const cube = createSolvedCube(3)
    // Two stickers swapped: not a cube anymore.
    const [a, b] = [cube.u[0], cube.r[0]]
    cube.u[0] = b
    cube.r[0] = a
    const fixture = build(cube)
    const meta = metaOf(fixture)
    expect(meta.tags).toContain('invalid-state')
    expect(meta.capture.synthetic.invalid).toEqual(expect.any(String))
    expect(meta.capture.synthetic.invalid.length).toBeGreaterThan(0)
    expect(Object.fromEntries(summarizeFixture(fixture).rows)['State']).toMatch(
      /invalid/i,
    )
  })

  it('marks a valid state as valid, without the invalid tag', () => {
    const meta = metaOf(metadataFixture())
    expect(meta.tags).not.toContain('invalid-state')
    expect(meta.capture.synthetic.invalid).toBeUndefined()
  })

  describe('can be rendered again from its metadata', () => {
    const FACES = ['u', 'r', 'f', 'd', 'l', 'b']

    // The photo the metadata alone asks for, as the file's bytes.
    function rerender(
      fixture: { files: Record<string, Uint8Array> },
      face: string,
    ) {
      const meta = metaOf(fixture)
      const { preset, seeds, size, options } = meta.capture.synthetic
      const grid = wrgFaceletsToGrids(meta.colorsURFDLB)![face.toUpperCase()]
      const photo = encode(
        renderFace(grid, preset, seeds[face], size, options),
        size,
      )
      return Buffer.from(photo.split(',')[1], 'base64')
    }

    // An isolated run builds twelve 600px JPEGs; allow for cold or busy runners.
    it('names the size, the seed of every face and the options', () => {
      const synthetic = metaOf(metadataFixture()).capture.synthetic
      expect(synthetic.size).toBe(600)
      expect(synthetic.seeds).toEqual({ u: 3, r: 4, f: 5, d: 6, l: 7, b: 8 })
      expect(synthetic.options).toEqual({})
      const own = {
        scatter: 1,
        tone: 0.5,
        logo: { row: 1, col: 1, color: 'B' },
      }
      expect(
        metaOf(build(createSolvedCube(3), 'real', own)).capture.synthetic
          .options,
      ).toEqual(own)
    }, 15_000)

    it.each([
      ['clean', undefined],
      ['bad-camera', undefined],
      ['real', { shading: 0.5, noise: 6 }],
    ])(
      'renders the %s photos byte for byte',
      (preset, options) => {
        const fixture = build(createSolvedCube(3), preset, options)
        for (const face of FACES) {
          // The saved photo is the re-rendered one plus its fingerprint.
          const saved = fixture.files[`face-${face}.jpg`]
          const marked = embedFingerprint(
            Uint8Array.from(rerender(fixture, face)),
            readFingerprint(saved) ?? '',
          )
          expect(
            Buffer.from(marked).equals(Buffer.from(saved)),
            `${preset} ${face}`,
          ).toBe(true)
        }
      },
      120_000,
    )
  })
})

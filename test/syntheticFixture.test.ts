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
import { buildSyntheticFixture } from '../src/client/fixtures/syntheticFixture'
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

function build(cube = createSolvedCube(3), preset = 'clean') {
  return buildSyntheticFixture(
    {
      cube,
      parity: parityStatus(cube, 3),
      preset,
      seed: 3,
      version: '0.1.0',
      commit: 'abc1234',
    },
    encode,
    NOW,
  )
}
const metaOf = (fixture: { files: Record<string, Uint8Array> }) =>
  JSON.parse(decoder.decode(fixture.files['meta.json']))

describe('synthetic fixtures', () => {
  it('is named and tagged synthetic, so people and tools both see it', () => {
    const fixture = build()
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
    expect(validate(metaOf(build())), JSON.stringify(validate.errors)).toBe(
      true,
    )
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
    const meta = metaOf(build())
    expect(meta.tags).not.toContain('invalid-state')
    expect(meta.capture.synthetic.invalid).toBeUndefined()
  })
})

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  PRESETS,
  renderFace,
  type SyntheticOptions,
} from '../src/client/vision/syntheticFace'

// docs/synthetic-face-generator-spec.md tells other implementations how to
// render the same photos. Its test vectors (section 11) must be what this
// generator renders, so the spec and the generator change together.
const spec = readFileSync(
  join(__dirname, '../docs/synthetic-face-generator-spec.md'),
  'utf8',
)
const vectors = spec.slice(spec.indexOf('## 11. Test vectors'))
const rows = vectors.split('\n').filter((line) => line.startsWith('|'))

const GRID = [
  ['W', 'Y', 'O'],
  ['R', 'G', 'B'],
  ['B', 'W', 'R'],
]
const SEED = 7
const SIZE = 96

// Every vector row of the spec, with the options the row names.
const CASES: [string, SyntheticOptions][] = [
  ['clean', {}],
  ['scatter', {}],
  ['real', {}],
  ['gradient', {}],
  ['shadow', {}],
  ['dim-warm', {}],
  ['glare', {}],
  ['noise', {}],
  ['bad-camera', {}],
  ['clean', { lightness: 3 }],
  ['clean', { palette: { W: { r: 200, g: 40, b: 40 } } }],
  ['clean', { logo: { row: 0, col: 0, color: 'B', size: 0.5 } }],
  ['clean', { noise: 12 }],
  ['clean', { blur: 3 }],
  ['clean', { brightness: 0.5 }],
  ['clean', { tone: 1 }],
  ['clean', { shading: 1 }],
  ['clean', { faceShift: 1 }],
  ['clean', { geometry: { gap: 0.2, radius: 0.3, margin: 0.06 } }],
  ['real', { tone: 0.5, shading: 2, faceShift: 0.3, noise: 6 }],
]

const pixel = (pixels: Uint8ClampedArray, x: number, y: number) => {
  const i = (y * SIZE + x) * 4
  return `${pixels[i]},${pixels[i + 1]},${pixels[i + 2]},${pixels[i + 3]}`
}

describe('the generator specification', () => {
  it('lists every preset of the generator', () => {
    for (const preset of PRESETS)
      expect(spec, preset).toContain(`\`${preset}\``)
  })

  it.each(CASES)('has the vector of %s %j', (preset, options) => {
    const pixels = renderFace(GRID, preset, SEED, SIZE, options)
    const sha = createHash('sha256')
      .update(Buffer.from(pixels.buffer, pixels.byteOffset, pixels.length))
      .digest('hex')
    const row = rows.find((line) => line.includes(sha))
    expect(row, `${preset} ${JSON.stringify(options)} ${sha}`).toBeDefined()
    expect(row?.split('|')[1].trim()).toBe(preset)
    for (const [x, y] of [
      [48, 48],
      [10, 10],
      [80, 20],
    ])
      expect(row).toContain(pixel(pixels, x, y))
  })

  it('has no vector row the generator does not render', () => {
    const shas = new Set(
      CASES.map(([preset, options]) => {
        const pixels = renderFace(GRID, preset, SEED, SIZE, options)
        return createHash('sha256')
          .update(Buffer.from(pixels.buffer, pixels.byteOffset, pixels.length))
          .digest('hex')
      }),
    )
    const listed = rows.flatMap((line) => line.match(/`([0-9a-f]{64})`/) ?? [])
    expect(listed.length).toBeGreaterThan(0)
    for (const sha of listed.filter((s) => s.length === 64))
      expect(shas.has(sha), sha).toBe(true)
  })
})

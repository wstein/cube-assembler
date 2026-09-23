/**
 * test/fixtures.test.ts
 * Runs the real color-detection pipeline against every saved fixture in
 * test/fixtures/: real photos plus the human-verified (post-correction)
 * color grid, saved via the review wizard's "Send to server" button
 * (POST /api/fixtures in server/Server.ts). Each fixture becomes a
 * permanent regression check - a misclassification a human caught once
 * stays caught, instead of only living in a bug report.
 *
 * Faithfully reproduces runGlobalWhiteBalance's actual flow (imageProcessing.ts),
 * not just a single face's raw classification: extract each of the 6
 * faces with neutral gains, pool every sticker's sample across the whole
 * capture, run learnStickerColors once, and compare the resulting labels
 * against the fixture's ground truth - a raw per-cell nearest-canonical
 * check alone would flag cases the real app's cross-face recalibration
 * already fixes, which aren't real regressions.
 *
 * Fixtures are opt-in (test/fixtures/ starts empty) - this test reports 0
 * fixtures found rather than failing when none exist yet.
 *
 * Run: npx vitest run test/fixtures.test.ts
 */
import { describe, it, expect } from 'vitest'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import jpeg from 'jpeg-js'
import { extractColorsFromImageData, learnStickerColors, NEUTRAL_GAINS, type StickerSample } from '../src/client/imageProcessing'

const FIXTURES_DIR = join(__dirname, 'fixtures')
const FACE_ORDER = ['u', 'r', 'f', 'd', 'l', 'b']

interface FixtureMeta {
  gridSize: number
  faces: Record<string, { colors: string[][]; photo: string }>
}

function loadFixtureNames(): string[] {
  if (!existsSync(FIXTURES_DIR)) return []
  return readdirSync(FIXTURES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => existsSync(join(FIXTURES_DIR, name, 'meta.json')))
    .sort()
}

const fixtureNames = loadFixtureNames()

describe('real-capture regression fixtures', () => {
  if (fixtureNames.length === 0) {
    it.skip('no fixtures saved yet - use the review wizard\'s "Send to server" button to add one', () => {})
    return
  }

  for (const name of fixtureNames) {
    it(`"${name}" reproduces the human-verified colors through the full pipeline`, () => {
      const meta: FixtureMeta = JSON.parse(readFileSync(join(FIXTURES_DIR, name, 'meta.json'), 'utf8'))
      for (const faceKey of FACE_ORDER) {
        expect(meta.faces[faceKey], `fixture "${name}" is missing face ${faceKey.toUpperCase()}`).toBeDefined()
      }

      const samples: StickerSample[] = []
      const locations: { face: string; row: number; col: number }[] = []

      for (const faceKey of FACE_ORDER) {
        const faceData = meta.faces[faceKey]
        const photoPath = join(FIXTURES_DIR, name, faceData.photo)
        const decoded = jpeg.decode(readFileSync(photoPath), { useTArray: true })
        const pixelData = Uint8ClampedArray.from(decoded.data)
        const result = extractColorsFromImageData(pixelData, decoded.width, decoded.height, meta.gridSize, NEUTRAL_GAINS)

        for (let r = 0; r < meta.gridSize; r++) {
          for (let c = 0; c < meta.gridSize; c++) {
            samples.push({ rgb: result.cellColors[r][c], colorGuess: result.colors[r][c] })
            locations.push({ face: faceKey, row: r, col: c })
          }
        }
      }

      const learned = learnStickerColors(samples)
      expect(learned, `fixture "${name}": learnStickerColors returned null (too few samples?)`).not.toBeNull()

      const finalColors: Record<string, string[][]> = {}
      for (const faceKey of FACE_ORDER) {
        finalColors[faceKey] = Array.from({ length: meta.gridSize }, () => new Array<string>(meta.gridSize).fill(''))
      }
      samples.forEach((_, i) => {
        const { face, row, col } = locations[i]
        finalColors[face][row][col] = learned!.labelsBySampleIndex[i]
      })

      for (const faceKey of FACE_ORDER) {
        expect(finalColors[faceKey], `fixture "${name}", face ${faceKey.toUpperCase()}`).toEqual(meta.faces[faceKey].colors)
      }
    })
  }
})

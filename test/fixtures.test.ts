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
import { wrgFaceletsToGrids } from '../src/client/notationOutput'
import { DEFAULT_SAMPLING, extractColorsFromImageData, learnStickerColors, limitBackgroundGain, NEUTRAL_GAINS, type RGB, type SamplingGeometry, type StickerSample } from '../src/client/imageProcessing'

const FIXTURES_DIR = join(__dirname, 'fixtures')
const FACE_ORDER = ['u', 'r', 'f', 'd', 'l', 'b']

// Largest per-channel difference allowed between this test's reading of a
// sticker (jpeg-js decode) and the browser's recorded one. Photos are saved
// at full chroma resolution (see cropFaceRegionToDataUrl), where the two
// decoders agree to within a few levels per pixel; a bigger gap means the
// test is no longer reproducing what the app saw.
const MAX_READING_DRIFT = 3

interface FixtureMeta {
  gridSize: number
  // Human-verified colors, all 6 faces as one WRG facelets string in
  // U R F D L B order, each face row-major as photographed.
  colorsURFDLB: string
  // `readings`: what the browser measured for each sticker (row-major RGB,
  // after the face's gain) - absent on fixtures saved before it was recorded.
  faces: Record<string, { photo: string; readings?: number[][] }>
  // Free-text labels a human can add by hand to meta.json (e.g. "pastel",
  // "office-lighting") - combined with tags auto-derived from `capture`
  // below so a cluster of failures under one condition is visible from
  // the test titles alone, without any separate reporting step.
  tags?: string[]
  // Informational capture context saved by the app (camera, white
  // balance, light source) - see src/client/index.tsx's
  // handleSendFixtureToServer. Shape isn't load-bearing here, only used
  // to derive display tags.
  capture?: {
    camera?: { label?: string }
    // Cube profile used for the capture (see cubeProfiles.ts).
    profile?: { name?: string } | null
    whiteBalance?: { mode?: string; lightSource?: string | null }
    // Per-face gains the app actually applied before classification (see
    // computeBackgroundGain / runGlobalWhiteBalance) - replayed below so the
    // test reproduces the real pipeline. Absent on fixtures saved before
    // the app started recording them; those replay with neutral gains.
    backgroundWhiteBalance?: Record<string, RGB>
    // Sampling setup (face border, sticker gap) the capture used - see
    // SamplingGeometry. Absent on older fixtures, which used the default.
    sampling?: SamplingGeometry
  }
  // Marks a fixture as a known, not-yet-fixed limitation rather than a
  // regression to guard against - e.g. a genuine palette-geometry case
  // with no close neighbor, or a real gap a future algorithm change
  // (see A1/A2 in the design discussion) is meant to close. Runs via
  // it.fails: the fixture must keep failing for exactly this reason, and
  // the moment it starts passing, the test itself fails - forcing a
  // human to notice and remove the flag rather than the fix going
  // unnoticed.
  expectedFail?: { reason: string }
}

// Tags shown in each test's title so a pattern across failures (e.g.
// "3 failures, all light:Fluorescent (green cast)") is visible directly
// in normal `npm test` output - no separate aggregation/reporting step
// needed for T2's "diagnose, don't just alarm" goal.
function fixtureTags(meta: FixtureMeta): string[] {
  const tags = new Set(meta.tags ?? [])
  if (meta.capture?.camera?.label) tags.add(`camera:${meta.capture.camera.label}`)
  if (meta.capture?.profile?.name) tags.add(`cube:${meta.capture.profile.name}`)
  if (meta.capture?.whiteBalance?.mode) tags.add(`wb:${meta.capture.whiteBalance.mode}`)
  if (meta.capture?.whiteBalance?.lightSource) tags.add(`light:${meta.capture.whiteBalance.lightSource}`)
  return [...tags].sort()
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
    const meta: FixtureMeta = JSON.parse(readFileSync(join(FIXTURES_DIR, name, 'meta.json'), 'utf8'))
    const tags = fixtureTags(meta)
    const tagSuffix = tags.length > 0 ? ` [${tags.join(', ')}]` : ''
    const title = meta.expectedFail
      ? `"${name}"${tagSuffix} [known-hard: ${meta.expectedFail.reason}]`
      : `"${name}"${tagSuffix} reproduces the human-verified colors through the full pipeline`
    // Known-hard fixtures run via it.fails: they're expected to keep
    // failing for the stated reason, and it.fails itself fails the suite
    // the moment they start passing - so a fix has to be noticed and the
    // expectedFail flag removed, rather than silently going unnoticed.
    const runTest = meta.expectedFail ? it.fails : it

    runTest(title, () => {
      for (const faceKey of FACE_ORDER) {
        expect(meta.faces[faceKey], `fixture "${name}" is missing face ${faceKey.toUpperCase()}`).toBeDefined()
      }
      const expectedColors = wrgFaceletsToGrids(meta.colorsURFDLB ?? '')
      expect(expectedColors, `fixture "${name}": colorsURFDLB missing or malformed`).not.toBeNull()

      const samples: StickerSample[] = []
      const locations: { face: string; row: number; col: number }[] = []

      for (const faceKey of FACE_ORDER) {
        const faceData = meta.faces[faceKey]
        const photoPath = join(FIXTURES_DIR, name, faceData.photo)
        const decoded = jpeg.decode(readFileSync(photoPath), { useTArray: true })
        const pixelData = Uint8ClampedArray.from(decoded.data)
        // Same per-face gain the app's runGlobalWhiteBalance re-detects with -
        // using NEUTRAL_GAINS here instead made this test disagree with what
        // the customer actually saw (a fixture the app classified perfectly
        // failed here, purely because its strong per-face correction was
        // skipped).
        // Limited like runGlobalWhiteBalance does, so gains recorded under
        // an older, looser clamp replay with today's limit.
        const recordedGains = meta.capture?.backgroundWhiteBalance?.[faceKey.toUpperCase()]
        const gains = recordedGains ? limitBackgroundGain(recordedGains) : NEUTRAL_GAINS
        const sampling = meta.capture?.sampling ?? DEFAULT_SAMPLING
        const result = extractColorsFromImageData(pixelData, decoded.width, decoded.height, meta.gridSize, gains, sampling)

        if (faceData.readings) {
          const drift = Math.max(...result.cellColors.flat().map((rgb, i) => {
            const [r, g, b] = faceData.readings![i]
            return Math.max(Math.abs(rgb.r - r), Math.abs(rgb.g - g), Math.abs(rgb.b - b))
          }))
          expect(drift, `fixture "${name}", face ${faceKey.toUpperCase()}: sticker readings differ from the browser's by up to ${drift.toFixed(1)} levels`).toBeLessThanOrEqual(MAX_READING_DRIFT)
        }

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
        expect(finalColors[faceKey], `fixture "${name}", face ${faceKey.toUpperCase()}`).toEqual(expectedColors![faceKey.toUpperCase()])
      }
    })
  }
})

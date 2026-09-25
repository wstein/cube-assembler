/**
 * test/fixtures.test.ts
 * Runs the real color-detection pipeline against every saved fixture in
 * test/fixtures/: real photos plus the human-verified (post-correction)
 * color grid, saved with the app's "Save as test fixture" button (a zip
 * to unzip into test/fixtures/, see fixtureZip.ts). Each fixture becomes a
 * permanent regression check - a misclassification a human caught once
 * stays caught, instead of only living in a bug report.
 *
 * Runs runGlobalWhiteBalance's actual flow (imageProcessing.ts), not just a
 * single face's raw classification: extract each of the 6 faces with
 * neutral gains, run the app's own cross-face step (classifyAcrossFaces)
 * over them, and compare the resulting labels
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
import { readFixtureColors } from '../src/client/fixtureFormat'
import { solveGuidedCapture, orientationFreeSignature, type FaceKey } from '../src/client/cubeAssembly'
import { DEFAULT_SAMPLING, STICKER_MEASUREMENT, classifyAcrossFaces, extractColorsFromImageData, NEUTRAL_GAINS, type ColorDetectionResult, type RGB, type SamplingGeometry } from '../src/client/imageProcessing'

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
  // capture-slot order, each face row-major as photographed - or, in
  // fixtures saved before that format, per face as faces.u.colors (see
  // readFixtureColors).
  colorsURFDLB?: string
  // `readings`: what the browser measured for each sticker (row-major RGB,
  // after the face's gain) - absent on fixtures saved before it was recorded.
  faces: Record<string, { photo: string; readings?: number[][]; colors?: string[][] }>
  // Free-text labels a human can add by hand to meta.json (e.g. "pastel",
  // "office-lighting") - combined with tags auto-derived from `capture`
  // below so a cluster of failures under one condition is visible from
  // the test titles alone, without any separate reporting step.
  tags?: string[]
  // Informational capture context saved by the app (camera, white
  // balance, light source) - see src/client/index.tsx's
  // handleSaveFixture. Shape isn't load-bearing here, only used
  // to derive display tags.
  capture?: {
    camera?: { label?: string }
    // Cube profile used for the capture (see cubeProfiles.ts).
    profile?: { name?: string } | null
    // Set when the faces were captured with the guided protocol (4 sides
    // turning one way, then top and bottom) - capture slots u..b are then
    // those steps in order - together with the cube the customer approved.
    protocol?: string | null
    // How the per-face readings were measured (see stickerColor); absent
    // on fixtures from before it was recorded, which used the trimmed mean.
    measurement?: string
    assembledURFDLB?: string | null
    whiteBalance?: { mode?: string; lightSource?: string | null }
    // Per-face background gains older versions applied before
    // classification. No longer replayed: the app stopped applying them.
    backgroundWhiteBalance?: Record<string, RGB> | null
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
    it.skip('no fixtures saved yet - use the app\'s "Save as test fixture" button to add one', () => {})
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
      const expectedColors = readFixtureColors(meta)?.colors ?? null
      expect(expectedColors, `fixture "${name}": colors missing or malformed`).not.toBeNull()

      const measured: Record<string, ColorDetectionResult> = {}

      for (const faceKey of FACE_ORDER) {
        const faceData = meta.faces[faceKey]
        const photoPath = join(FIXTURES_DIR, name, faceData.photo)
        const decoded = jpeg.decode(readFileSync(photoPath), { useTArray: true })
        const pixelData = Uint8ClampedArray.from(decoded.data)
        // Neutral, like the app: it no longer applies the per-face background
        // gains older fixtures recorded (they swapped red and orange on real
        // captures - see finalizeAllFacesCaptured in index.tsx).
        const gains = NEUTRAL_GAINS
        const sampling = meta.capture?.sampling ?? DEFAULT_SAMPLING
        const result = extractColorsFromImageData(pixelData, decoded.width, decoded.height, meta.gridSize, gains, sampling)

        // Readings taken with a different measurement, or with the per-face
        // background gains older versions applied, can't be compared.
        if (faceData.readings && meta.capture?.measurement === STICKER_MEASUREMENT && !meta.capture?.backgroundWhiteBalance) {
          const drift = Math.max(...result.cellColors.flat().map((rgb, i) => {
            const [r, g, b] = faceData.readings![i]
            return Math.max(Math.abs(rgb.r - r), Math.abs(rgb.g - g), Math.abs(rgb.b - b))
          }))
          expect(drift, `fixture "${name}", face ${faceKey.toUpperCase()}: sticker readings differ from the browser's by up to ${drift.toFixed(1)} levels`).toBeLessThanOrEqual(MAX_READING_DRIFT)
        }

        measured[faceKey] = result
      }

      // The same cross-face step the app runs (runGlobalWhiteBalance).
      const classified = classifyAcrossFaces(measured)
      expect(classified.applied, `fixture "${name}": the cross-face step found too few samples`).toBe(true)

      for (const faceKey of FACE_ORDER) {
        expect(classified.faces[faceKey].colors, `fixture "${name}", face ${faceKey.toUpperCase()}`).toEqual(expectedColors![faceKey.toUpperCase()])
      }
    })
  }
})

// Guided captures also replay how the faces fit together: the guided search
// on the saved (human-verified) colors must find the cube the customer
// approved - as one of its answers, since some patterns genuinely fit more
// than one way.
describe('guided-capture fixtures reassemble into the approved cube', () => {
  const guided = fixtureNames
    .map((name) => ({ name, meta: JSON.parse(readFileSync(join(FIXTURES_DIR, name, 'meta.json'), 'utf8')) as FixtureMeta }))
    .filter(({ meta }) => meta.capture?.protocol && meta.capture.assembledURFDLB)
  if (guided.length === 0) {
    it.skip('no guided-capture fixtures saved yet', () => {})
    return
  }
  for (const { name, meta } of guided) {
    it(`"${name}"`, () => {
      const slots = readFixtureColors(meta)!.colors
      const [s1, s2, s3, s4, cap1, cap2] = ['U', 'R', 'F', 'D', 'L', 'B'].map((k) => slots[k])
      const solution = solveGuidedCapture({ sides: [s1, s2, s3, s4], caps: [cap1, cap2] })!
      expect(solution.fullyValid, `fixture "${name}": the guided search found no valid cube`).toBe(true)
      const approved = orientationFreeSignature(wrgFaceletsToGrids(meta.capture!.assembledURFDLB!) as Record<FaceKey, string[][]>)
      expect(solution.alternatives.map((a) => orientationFreeSignature(a.faces))).toContain(approved)
    })
  }
})

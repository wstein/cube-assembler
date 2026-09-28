import type { CubeState } from '../cube/cubeAssembly'
import {
  gridsToWRGFacelets,
  toWRGFacelets,
} from '../cube/notation/NotationOutput.gen'
import { FACE_ORDER, GUIDED_PROTOCOL } from './captureSteps'
import type { FaceCaptureData } from './captureTypes'
import type { AutomaticResolution } from './colorProfileLearning'
import { computeColorStats } from './colorStats'
import type { FixtureDownloadData } from './fixtureDownloadDialog'
import type { FixtureUploadMetadata } from './readFixtureUpload'
import {
  buildFixture,
  summarizeFixture,
  zipFixture,
  type Fixture,
} from './fixtureZip'
import {
  BACKGROUND_WB_METHOD,
  CROP_JPEG_QUALITY,
  STICKER_MEASUREMENT,
  type ColorDetectionResult,
  type RGB,
  type SamplingGeometry,
} from './imageProcessing'
import type { UsedColorProfile } from './profileSettings'
import type { CameraInfo } from './useCameraStream'

// Everything a saved fixture records about a capture, besides its faces.
export interface CaptureFixtureInput {
  capturedFaces: Record<string, FaceCaptureData>
  puzzleSize: number
  version: string
  commit: string
  userAgent: string
  devicePixelRatio: number
  mirrored: boolean
  cameraInfo: CameraInfo | null
  captureProfile: { id?: string; name: string } | null
  resolvedColorProfile: UsedColorProfile | null
  automaticResolution: AutomaticResolution | null
  resolvedColorReference: Record<string, RGB> | null
  guided: boolean
  cube: CubeState | null
  appliedBackgroundGains: Record<string, RGB> | null
  sampling: SamplingGeometry
  calibrationApplied: boolean
  learnedPalette: Record<string, RGB> | null
}

// Only a complete capture with all six photos can be saved.
export function canSaveCaptureFixture(
  capturedFaces: Record<string, FaceCaptureData>,
): boolean {
  return FACE_ORDER.every((f) => capturedFaces[f]?.croppedImage)
}

// Packs a capture - each face's actual photo plus its (human-reviewed)
// color grid - into a fixture: unzipped into test/fixtures/, it is a
// permanent regression fixture (see test/fixtures.test.ts). Throws on an
// incomplete capture.
export function buildCaptureFixture(
  {
    capturedFaces,
    puzzleSize,
    version,
    commit,
    userAgent,
    devicePixelRatio,
    mirrored,
    cameraInfo,
    captureProfile,
    resolvedColorProfile,
    automaticResolution,
    resolvedColorReference,
    guided,
    cube,
    appliedBackgroundGains,
    sampling,
    calibrationApplied,
    learnedPalette,
  }: CaptureFixtureInput,
  now = new Date(),
): Fixture {
  const faces: Record<string, { photo: string } & Record<string, unknown>> = {}
  for (const f of FACE_ORDER) {
    const face = capturedFaces[f]
    faces[f] = {
      photo: face.croppedImage!,
      // What the browser measured for each sticker (row-major, after the
      // face's gain) and detection's confidence in it, 0-100 - lets
      // the fixture test check its own JPEG decode reads the same.
      readings: face.cellColors
        ?.flat()
        .map(({ r, g, b }) => [r, g, b].map((v) => Math.round(v * 10) / 10)),
      confidences: face.cellConfidences?.flat().map((c) => Math.round(c * 100)),
      source: face.source,
      capturedAt: new Date(face.timestamp).toISOString(),
      background: face.backgroundColor,
      frame: face.frame,
      crop: face.crop,
      sharpness:
        face.sharpness !== undefined
          ? Math.round(face.sharpness * 10) / 10
          : undefined,
      camera: face.cameraSettings,
      previewColorProfile: face.previewColorProfile,
    }
  }
  const meta = {
    capturedAt: new Date().toISOString(),
    app: { version, commit },
    userAgent,
    devicePixelRatio,
    photo: { format: 'image/jpeg', quality: CROP_JPEG_QUALITY },
    mirrored,
    // Only meaningful when at least one face was shot with it - not for
    // a re-saved uploaded fixture or imported image files.
    camera: FACE_ORDER.some((f) => capturedFaces[f].source === 'camera')
      ? cameraInfo
      : null,
    // The cube profile the capture was taken with - same condition as
    // camera, since a re-saved upload wasn't shot with the current one.
    profile: FACE_ORDER.some((f) => capturedFaces[f].source === 'camera')
      ? captureProfile
      : null,
    // One resolved profile for the complete capture. The actual common
    // palette learned from all six photos is recorded below.
    colorProfile: resolvedColorProfile,
    // Why Automatic chose it: the reason and the nearest saved profiles.
    colorResolution: automaticResolution && {
      reason: automaticResolution.reason,
      nearest: automaticResolution.nearest.map(({ profile, fit }) => ({
        id: profile.id,
        name: profile.name,
        fit,
      })),
    },
    // A saved/manual profile acts as the six-face classification prior.
    // Automatic without a clear match uses only this capture's colors.
    colorReference: resolvedColorReference,
    // How the photos were taken (see CAPTURE_STEPS) and the cube they
    // were approved as - the fixture test puts the photos together
    // again and checks it gets that cube.
    protocol: guided ? GUIDED_PROTOCOL : null,
    // How the per-face `readings` were measured (see stickerColor).
    measurement: STICKER_MEASUREMENT,
    assembledURFDLB: cube ? toWRGFacelets(cube) : null,
    // Two corrections run after all 6 faces are in: each face's
    // backdrop brought to the median of all six (backgroundWhiteBalance,
    // per-face gains - see computeBackgroundGains; each face's backdrop
    // reading is recorded per face), then the 6 colors learned from
    // this capture's own stickers (colorCalibration).
    backgroundWhiteBalance: appliedBackgroundGains,
    backgroundWhiteBalanceMethod: appliedBackgroundGains
      ? BACKGROUND_WB_METHOD
      : null,
    // Face border and sticker gap used to sample every face (see
    // SamplingGeometry) - replayed by the fixture test.
    sampling,
    // The 6 colors learned from this capture's stickers, which every
    // sticker was classified against (null when there weren't enough
    // stickers to learn from and the canonical colors were used).
    colorCalibration: {
      applied: calibrationApplied,
      learnedColors: learnedPalette
        ? Object.fromEntries(
            Object.entries(learnedPalette).map(([color, { r, g, b }]) => [
              color,
              [r, g, b].map((v) => Math.round(v * 10) / 10),
            ]),
          )
        : null,
    },
    // Per-color detected count/lightness/chroma/hue spread across all 6
    // faces at confirm time (see computeColorStats) - no longer shown
    // live in the review wizard (raw OKLCH ranges aren't actionable
    // mid-capture), but valuable here for offline analysis of a
    // reported detection problem against this exact fixture.
    colorStats: computeColorStats(capturedFaces, puzzleSize),
  }
  return buildFixture(
    {
      gridSize: puzzleSize,
      colorsURFDLB: gridsToWRGFacelets(
        Object.fromEntries(FACE_ORDER.map((f) => [f, capturedFaces[f].colors])),
      ),
      // What detection said before any hand correction - the diff
      // against colorsURFDLB is exactly what a human had to fix.
      detectedURFDLB: FACE_ORDER.every((f) => capturedFaces[f].detectedColors)
        ? gridsToWRGFacelets(
            Object.fromEntries(
              FACE_ORDER.map((f) => [f, capturedFaces[f].detectedColors!]),
            ),
          )
        : undefined,
      faces,
      meta,
    },
    now,
  )
}

// The download dialog's contents for a fixture, with its photos as object
// URLs the dialog revokes when it closes.
export function fixtureDownloadFor(fixture: Fixture): FixtureDownloadData {
  const summary = summarizeFixture(fixture)
  return {
    fixture,
    name: fixture.name,
    zip: zipFixture(fixture),
    summary,
    photoUrls: summary.photos.map((p) =>
      URL.createObjectURL(
        new Blob([p.bytes as BlobPart], {
          type: p.file.endsWith('.png') ? 'image/png' : 'image/jpeg',
        }),
      ),
    ),
  }
}

type FixtureCapture = NonNullable<FixtureUploadMetadata['capture']>

// The reason Automatic chose its profile, as recorded in a fixture; the
// nearest profiles keep only their names and fit.
export function recordedAutomaticResolution(
  recorded: FixtureCapture['colorResolution'],
): AutomaticResolution | null {
  return recorded?.reason
    ? {
        profile: null,
        reason: recorded.reason,
        nearest: (recorded.nearest ?? []).map(({ id, name, fit }) => ({
          profile: { id, name, colors: {}, captures: 0 },
          fit,
        })),
      }
    : null
}

// Puts what detection reads today on each uploaded face, and counts the
// stickers where it differs from the saved colors. Without the saved
// corrections the detected colors become the colors too.
export function applyFixtureDetection(
  entries: Record<string, FaceCaptureData>,
  detected: Record<string, ColorDetectionResult>,
  ignoreCorrections: boolean,
): number {
  let mismatches = 0
  for (const [f, entry] of Object.entries(entries)) {
    const det = detected[f]
    entry.detectedColors = det.colors
    entry.cellColors = det.cellColors
    entry.cellConfidences = det.cellConfidences
    entry.cellLookalikes = det.cellLookalikes
    entry.confidence = det.confidence
    entry.colors.forEach((row, r) =>
      row.forEach((color, c) => {
        if (det.colors[r][c] !== color) mismatches++
      }),
    )
    if (ignoreCorrections) entry.colors = det.colors.map((row) => [...row])
  }
  return mismatches
}

export function fixtureLoadedMessage(
  mismatches: number,
  ignoreCorrections: boolean,
): string {
  const stickers = `${mismatches} sticker${mismatches === 1 ? '' : 's'}`
  return mismatches === 0
    ? `✓ Loaded fixture - detection matches all stickers.`
    : ignoreCorrections
      ? `✓ Loaded fixture with detected colors only - dropped the saved choice on ${stickers}.`
      : `✓ Loaded fixture - detection differs on ${stickers} (marked in the review).`
}

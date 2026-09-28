// Saving and loading capture fixtures; what a fixture records lives in
// src/core/capture/CaptureFixture.res.
import {
  canSaveCaptureFixture as canSaveCaptureFixtureRes,
  captureFixtureRequest,
  fixtureLoadedMessage,
  recordedAutomaticResolution as recordedAutomaticResolutionRes,
} from '../core/capture/CaptureFixture.gen'
import type { CubeState } from '../cube/cubeAssembly'
import type { FaceCaptureData } from './captureTypes'
import type { AutomaticResolution } from './colorProfileLearning'
import type { FixtureDownloadData } from './fixtureDownloadDialog'
import type { FixtureUploadMetadata } from './readFixtureUpload'
import {
  buildFixture,
  summarizeFixture,
  zipFixture,
  type Fixture,
  type FixtureRequest,
} from './fixtureZip'
import type {
  ColorDetectionResult,
  RGB,
  SamplingGeometry,
} from './imageProcessing'
import type { UsedColorProfile } from './profileSettings'
import type { CameraInfo } from './useCameraStream'

type ResFaces = Parameters<typeof canSaveCaptureFixtureRes>[0]

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
  return canSaveCaptureFixtureRes(capturedFaces as ResFaces)
}

// Packs a capture - each face's actual photo plus its (human-reviewed)
// color grid - into a fixture (see captureFixtureRequest): unzipped into
// test/fixtures/, it is a permanent regression fixture. Throws on an
// incomplete capture.
export function buildCaptureFixture(
  input: CaptureFixtureInput,
  now = new Date(),
): Fixture {
  return buildFixture(
    captureFixtureRequest(
      input as unknown as Parameters<typeof captureFixtureRequest>[0],
    ) as FixtureRequest,
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
  return recordedAutomaticResolutionRes(recorded)
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

export { fixtureLoadedMessage }

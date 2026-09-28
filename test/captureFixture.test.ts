import { describe, expect, it } from 'vitest'
import {
  applyFixtureDetection,
  buildCaptureFixture,
  canSaveCaptureFixture,
  fixtureLoadedMessage,
  recordedAutomaticResolution,
  type CaptureFixtureInput,
} from '../src/client/captureFixture'
import type { FaceCaptureData } from '../src/client/captureTypes'
import type { ColorDetectionResult } from '../src/client/imageProcessing'

const SOLVED: Record<string, string> = {
  U: 'W',
  R: 'R',
  F: 'G',
  D: 'Y',
  L: 'O',
  B: 'B',
}

function faces(source: FaceCaptureData['source']) {
  return Object.fromEntries(
    Object.entries(SOLVED).map(([face, color]) => [
      face,
      {
        colors: [
          [color, color],
          [color, color],
        ],
        detectedColors: [
          [color, color],
          [color, color],
        ],
        cellColors: [
          [
            { r: 10.04, g: 20, b: 30 },
            { r: 10, g: 20, b: 30 },
          ],
          [
            { r: 10, g: 20, b: 30 },
            { r: 10, g: 20, b: 30 },
          ],
        ],
        confidence: 0.9,
        croppedImage: 'data:image/jpeg;base64,AAAA',
        source,
        timestamp: Date.UTC(2026, 8, 28),
      } satisfies FaceCaptureData,
    ]),
  )
}

function input(
  overrides: Partial<CaptureFixtureInput> = {},
): CaptureFixtureInput {
  return {
    capturedFaces: faces('image-file'),
    puzzleSize: 2,
    version: '1.2.3',
    commit: 'abc1234',
    userAgent: 'test',
    devicePixelRatio: 2,
    mirrored: true,
    cameraInfo: null,
    captureProfile: { id: 'generic-2', name: 'Generic 2x2' },
    resolvedColorProfile: null,
    automaticResolution: null,
    resolvedColorReference: null,
    guided: false,
    cube: null,
    appliedBackgroundGains: null,
    sampling: { stickerCore: 0.6 },
    calibrationApplied: false,
    learnedPalette: null,
    ...overrides,
  }
}

const metaOf = (fixture: { files: Record<string, Uint8Array> }) =>
  JSON.parse(new TextDecoder().decode(fixture.files['meta.json']))

describe('capture fixtures', () => {
  it('needs all six photos before saving', () => {
    const complete = faces('camera')
    expect(canSaveCaptureFixture(complete)).toBe(true)
    const { B: _back, ...missing } = complete
    expect(canSaveCaptureFixture(missing)).toBe(false)
  })

  it('records the capture context with the colors and photos', () => {
    const fixture = buildCaptureFixture(
      input({
        guided: true,
        learnedPalette: { W: { r: 250.04, g: 249.96, b: 240 } },
        calibrationApplied: true,
      }),
      new Date('2026-09-28T10:00:00Z'),
    )
    expect(fixture.name).toBe('cube-2x2-2026-09-28T10-00-00')
    expect(Object.keys(fixture.files).sort()).toContain('face-u.jpg')
    const meta = metaOf(fixture)
    expect(meta.colorsURFDLB).toBe('WWWW RRRR GGGG YYYY OOOO BBBB')
    expect(meta.detectedURFDLB).toBe(meta.colorsURFDLB)
    expect(meta.faces.u.readings[0]).toEqual([10, 20, 30])
    expect(meta.faces.u.confidences).toBeUndefined()
    expect(meta.capture).toMatchObject({
      app: { version: '1.2.3', commit: 'abc1234' },
      mirrored: true,
      protocol: 'sides-then-top-bottom/v1',
      colorCalibration: {
        applied: true,
        learnedColors: { W: [250, 250, 240] },
      },
      colorStats: { W: { count: 4, expected: 4 } },
    })
  })

  it('keeps the camera and cube profile only for camera captures', () => {
    const cameraInfo = { label: 'Webcam' } as CaptureFixtureInput['cameraInfo']
    const uploaded = metaOf(buildCaptureFixture(input({ cameraInfo })))
    expect(uploaded.capture.camera).toBeNull()
    expect(uploaded.capture.profile).toBeNull()
    const shot = metaOf(
      buildCaptureFixture(
        input({ cameraInfo, capturedFaces: faces('camera') }),
      ),
    )
    expect(shot.capture.camera).toEqual(cameraInfo)
    expect(shot.capture.profile).toEqual({
      id: 'generic-2',
      name: 'Generic 2x2',
    })
  })

  it('restores the recorded Automatic reason with named nearest profiles', () => {
    expect(recordedAutomaticResolution(null)).toBeNull()
    expect(
      recordedAutomaticResolution({
        reason: 'nearest',
        nearest: [{ id: 'matte', name: 'Matte', fit: 91 }],
      }),
    ).toEqual({
      profile: null,
      reason: 'nearest',
      nearest: [
        {
          profile: { id: 'matte', name: 'Matte', colors: {}, captures: 0 },
          fit: 91,
        },
      ],
    })
  })

  it('marks uploaded stickers where detection differs from the saved colors', () => {
    const detect = (color: string): ColorDetectionResult =>
      ({
        colors: [
          [color, 'O'],
          [color, color],
        ],
        confidence: 0.7,
      }) as ColorDetectionResult
    const entries = faces('fixture')
    const detected = Object.fromEntries(
      Object.entries(SOLVED).map(([face, color]) => [face, detect(color)]),
    )
    expect(applyFixtureDetection(entries, detected, false)).toBe(5)
    expect(entries.U.colors[0][1]).toBe('W')
    expect(entries.U.detectedColors?.[0][1]).toBe('O')
    expect(entries.U.confidence).toBe(0.7)

    const reset = faces('fixture')
    expect(applyFixtureDetection(reset, detected, true)).toBe(5)
    expect(reset.U.colors[0][1]).toBe('O')
  })

  it('says how far detection strayed from the saved colors', () => {
    expect(fixtureLoadedMessage(0, false)).toBe(
      '✓ Loaded fixture - detection matches all stickers.',
    )
    expect(fixtureLoadedMessage(1, false)).toContain('differs on 1 sticker ')
    expect(fixtureLoadedMessage(3, true)).toContain(
      'dropped the saved choice on 3 stickers',
    )
  })
})

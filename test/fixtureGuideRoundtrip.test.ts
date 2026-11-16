import { afterEach, expect, it, vi } from 'vitest'
import {
  buildCaptureFixture,
  type CaptureFixtureInput,
} from '../src/client/capture/captureFixture'
import { recordGuide as recordCurrentGuide } from '../src/client/capture/captureRecovery'
import {
  captureProtocol,
  physicalProtocol,
} from '../src/client/capture/guidedCaptureProtocol'
import { readFixtureUpload } from '../src/client/fixtures/readFixtureUpload'
import { planFixtureUpload } from '../src/core/capture/FixtureUpload.gen'
// Historical v2 observations are explicit; the current camera now records v3.
const recordV2Guide = (slot: string, mirrored: boolean, retake: boolean) => {
  const guide = recordCurrentGuide(slot, mirrored, retake)
  return (
    guide && {
      ...guide,
      protocol: retake ? guide.protocol : physicalProtocol,
      displayedArrow:
        retake || guide.step === 0 ? null : guide.step < 4 ? 270 : 0,
    }
  )
}
const slots = ['U', 'R', 'F', 'D', 'L', 'B']
const colors = ['G', 'R', 'B', 'O', 'Y', 'W']
function input(): CaptureFixtureInput {
  return {
    capturedFaces: Object.fromEntries(
      slots.map((slot, i) => [
        slot,
        {
          colors: [
            [colors[i], colors[i]],
            [colors[i], colors[i]],
          ],
          captureGuide: recordV2Guide(slot, true, false)!,
          confidence: 1,
          timestamp: 0,
          source: 'camera' as const,
          croppedImage: 'data:image/jpeg;base64,/9j/2Q==',
        },
      ]),
    ),
    puzzleSize: 2,
    version: 'test',
    commit: 'test',
    userAgent: 'test',
    devicePixelRatio: 1,
    mirrored: true,
    cameraInfo: null,
    captureProfile: null,
    resolvedColorProfile: null,
    automaticResolution: null,
    resolvedColorReference: null,
    guided: true,
    cube: null,
    appliedBackgroundGains: null,
    sampling: { stickerCore: 0.6 },
    calibrationApplied: false,
    learnedPalette: null,
  }
}
class FixtureReader {
  result: string | null = null
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  readAsDataURL(file: File) {
    void file
      .arrayBuffer()
      .then((bytes) => {
        this.result = `data:${file.type};base64,${Buffer.from(bytes).toString('base64')}`
        this.onload?.()
      })
      .catch(() => this.onerror?.())
  }
}
afterEach(() => vi.unstubAllGlobals())
it.each([
  'sides-then-top-bottom/v2',
  'left-front-right-back-up-down/v3',
  'right-back-left-front-up-down/v3',
])(
  'retains %s guides through the import plan, browser entries and reexport',
  async (protocol) => {
    vi.stubGlobal('FileReader', FixtureReader)
    const original = input()
    if (protocol !== physicalProtocol)
      for (const slot of slots)
        original.capturedFaces[slot].captureGuide = recordCurrentGuide(
          slot,
          protocol.startsWith('right-'),
          false,
        )!
    const fixture = buildCaptureFixture(original)
    const meta = JSON.parse(
      new TextDecoder().decode(fixture.files['meta.json']),
    )
    const plan = planFixtureUpload(
      meta,
      'meta.json',
      Object.keys(fixture.files).filter((name) => name !== 'meta.json'),
      1,
    )
    expect(plan.ok).toBe(true)
    if (!plan.ok) throw new Error(plan.message)
    for (const face of plan.faces)
      expect(face.captureGuide).toEqual(
        original.capturedFaces[face.face].captureGuide,
      )
    const files = Object.entries(fixture.files).map(
      ([name, bytes]) =>
        new File([new Uint8Array(bytes).buffer], name, {
          type: name.endsWith('.json') ? 'application/json' : 'image/jpeg',
        }),
    )
    const loaded = await readFixtureUpload(files)
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) throw new Error(loaded.message)
    expect(
      captureProtocol(loaded.entries, loaded.meta.capture?.protocol ?? null),
    ).toBe(protocol)
    const exported = buildCaptureFixture({
      ...original,
      capturedFaces: loaded.entries,
      uploadedProtocol: loaded.meta.capture?.protocol ?? undefined,
    })
    expect(
      JSON.parse(new TextDecoder().decode(exported.files['meta.json'])).capture
        .protocol,
    ).toBe(protocol)
  },
)
it('does not fabricate missing or malformed guides and preserves mixed retake provenance without claiming v2', () => {
  const fixture = buildCaptureFixture(input())
  const meta = JSON.parse(new TextDecoder().decode(fixture.files['meta.json']))
  meta.faces.u.captureGuide = {
    ...meta.faces.u.captureGuide,
    protocol: 'sides-then-top-bottom/v1',
  }
  meta.faces.r.captureGuide = {
    ...meta.faces.r.captureGuide,
    protocol: 'retake/v1',
  }
  meta.faces.f.captureGuide = { ...meta.faces.f.captureGuide, mirrored: 'true' }
  delete meta.faces.d.captureGuide
  meta.faces.l.captureGuide = {
    ...meta.faces.l.captureGuide,
    protocol: 'future/v99',
  }
  const plan = planFixtureUpload(
    meta,
    'meta.json',
    Object.keys(fixture.files),
    1,
  )
  if (!plan.ok) throw new Error(plan.message)
  const entries = Object.fromEntries(
    plan.faces.map((face) => [
      face.face,
      {
        colors: face.colors,
        timestamp: face.timestamp,
        captureGuide: face.captureGuide,
        confidence: 1,
      },
    ]),
  )
  expect(entries.U.captureGuide?.protocol).toBe('sides-then-top-bottom/v1')
  expect(entries.B.captureGuide?.protocol).toBe(physicalProtocol)
  expect(entries.R.captureGuide?.protocol).toBe('retake/v1')
  expect(entries.F.captureGuide).toBeUndefined()
  expect(entries.D.captureGuide).toBeUndefined()
  expect(entries.L.captureGuide).toBeUndefined()
  expect(captureProtocol(entries, physicalProtocol)).toBeNull()
})

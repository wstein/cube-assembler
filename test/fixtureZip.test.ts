import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { strToU8, zipSync } from 'fflate'
import { buildFixture, summarizeFixture, unzipFixture, zipFixture, type FixtureRequest } from '../src/client/fixtureZip'

const DIR = join(__dirname, 'fixtures', 'synthetic-sanity-check')
const saved = JSON.parse(readFileSync(join(DIR, 'meta.json'), 'utf8'))
const photo = (face: string) => readFileSync(join(DIR, saved.faces[face].photo))

// What the app sends for the checked-in synthetic fixture.
function request(extra: Partial<FixtureRequest> = {}): FixtureRequest {
  return {
    name: 'synthetic',
    gridSize: saved.gridSize,
    colorsURFDLB: saved.colorsURFDLB,
    faces: Object.fromEntries(Object.keys(saved.faces).map((face) => [
      face,
      { photo: `data:image/jpeg;base64,${photo(face).toString('base64')}`, source: 'camera' },
    ])),
    meta: { app: { version: '0.1.0', commit: 'abc1234' } },
    ...extra,
  }
}

describe('fixture zips', () => {
  it('round-trips a capture into the test/fixtures/<name>/ layout', async () => {
    const zip = zipFixture(buildFixture(request()))
    const files = unzipFixture(zip)
    expect(files.map((f) => f.name).sort()).toEqual(['face-b.jpg', 'face-d.jpg', 'face-f.jpg', 'face-l.jpg', 'face-r.jpg', 'face-u.jpg', 'meta.json'])
    for (const face of Object.keys(saved.faces)) {
      const file = files.find((f) => f.name === `face-${face}.jpg`)!
      expect(Buffer.from(await file.arrayBuffer()).equals(photo(face))).toBe(true)
    }
    const meta = JSON.parse(await files.find((f) => f.name === 'meta.json')!.text())
    expect(meta).toEqual({
      gridSize: saved.gridSize,
      colorsURFDLB: saved.colorsURFDLB,
      faces: Object.fromEntries(Object.keys(saved.faces).map((face) => [face, { photo: `face-${face}.jpg`, source: 'camera' }])),
      capture: { app: { version: '0.1.0', commit: 'abc1234' } },
    })
  })

  it('names an unnamed fixture by time and keeps names path-safe', () => {
    expect(buildFixture(request({ name: undefined }), new Date('2026-09-25T18:50:01.234Z')).name).toBe('capture-2026-09-25T18-50-01-234Z')
    expect(buildFixture(request({ name: '../../etc/passwd' })).name).toBe('------etc-passwd')
  })

  it('refuses incomplete captures', () => {
    const { u: _u, ...fiveFaces } = request().faces
    expect(() => buildFixture(request({ faces: fiveFaces }))).toThrow('Expected all 6 faces')
    expect(() => buildFixture(request({ gridSize: 4 }))).toThrow('colorsURFDLB must be 6 space-separated 4x4 faces')
    expect(() => buildFixture(request({ faces: { ...request().faces, u: { photo: 'not a data url' } } }))).toThrow('Face U: photo must be')
  })

  it('reads a fixture folder zipped by hand (nested, compressed, with macOS extras)', async () => {
    const zip = zipSync({
      'Downloads/my-fixture/meta.json': strToU8('{"gridSize":3}'),
      'Downloads/my-fixture/face-u.jpg': [new Uint8Array([1, 2, 3]), { level: 9 }],
      'Downloads/other.txt': strToU8('not part of it'),
      '__MACOSX/Downloads/my-fixture/._meta.json': strToU8('resource fork'),
    })
    const files = unzipFixture(zip)
    expect(files.map((f) => f.name).sort()).toEqual(['face-u.jpg', 'meta.json'])
    expect(await files.find((f) => f.name === 'meta.json')!.text()).toBe('{"gridSize":3}')
  })

  it('says when a zip holds no fixture', () => {
    expect(() => unzipFixture(zipSync({ 'notes.txt': strToU8('hi') }))).toThrow('No meta.json in the zip')
  })

  it('summarizes what a fixture holds', () => {
    const colors: string = saved.colorsURFDLB
    const summary = summarizeFixture(buildFixture(request({
      detectedURFDLB: `Y${colors.slice(1, -1)}W`,
      meta: {
        capturedAt: '2026-09-25T18:50:01.234Z',
        app: { version: '0.1.0', commit: 'abc1234' },
        camera: { label: 'FaceTime HD Camera', granted: { width: 1920, height: 1080 } },
        profile: { name: 'QiYi 3×3' },
        protocol: 'sides-then-top-bottom/v1',
        colorCalibration: { applied: true, learnedColors: { W: [250, 250, 250] } },
      },
    })))
    expect(summary.photos.map((p) => [p.face, p.file, p.bytes.length])).toEqual(
      ['u', 'r', 'f', 'd', 'l', 'b'].map((face) => [face, `face-${face}.jpg`, photo(face).length]))
    expect(Object.fromEntries(summary.rows)).toMatchObject({
      Cube: '3×3',
      'Fixed by hand': '2 stickers',
      Capture: 'guided (4 sides, then top and bottom)',
      'Photos from': 'camera',
      Camera: 'FaceTime HD Camera, 1920×1080',
      'Cube profile': 'QiYi 3×3',
      'Colors learned': 'from this capture',
      App: '0.1.0 (abc1234)',
    })
    expect(Object.fromEntries(summarizeFixture(buildFixture(request())).rows)).toMatchObject({ 'Fixed by hand': 'not recorded', Capture: 'free order' })
  })
})

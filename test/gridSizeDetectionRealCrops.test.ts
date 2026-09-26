import { describe, expect, it } from 'vitest'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import jpeg from 'jpeg-js'
import { estimateFaceGridSize, type FaceSquare } from '../src/client/gridAlignment'

// Real capture crops (gitignored, like test/gridAlignmentRealCrops.test.ts)
// pasted into a grey frame as tall as the live search area (1.67 guides):
// the size estimate may stay silent, but must never name a wrong size.

const root = join(__dirname, 'fixtures')
const captures = existsSync(root)
  ? readdirSync(root).filter((name) => name.startsWith('capture-') && existsSync(join(root, name, 'meta.json')))
  : []

interface Face { data: Uint8ClampedArray; size: number; gridSize: number; name: string }

function loadFaces(): Face[] {
  const faces: Face[] = []
  for (const name of captures) {
    const meta = JSON.parse(readFileSync(join(root, name, 'meta.json'), 'utf8')) as { gridSize: number; faces: Record<string, { photo: string }> }
    for (const face of ['u', 'r', 'f', 'd', 'l', 'b']) {
      const image = jpeg.decode(readFileSync(join(root, name, meta.faces[face].photo)))
      // The guide of a 720p camera (432 px), nearest-neighbour.
      const source = Math.min(image.width, image.height)
      const size = 432
      const data = new Uint8ClampedArray(size * size * 4)
      for (let y = 0; y < size; y++) {
        const sy = Math.floor(y * source / size)
        for (let x = 0; x < size; x++) {
          const from = (sy * image.width + Math.floor(x * source / size)) * 4
          data.set([image.data[from], image.data[from + 1], image.data[from + 2], 255], (y * size + x) * 4)
        }
      }
      faces.push({ data, size, gridSize: meta.gridSize, name: `${name}/${face}` })
    }
  }
  return faces
}

// Grey frame with the face scaled by `scale`, offset (dx, dy) guides and
// tilted `tilt` degrees about its center.
function frame(face: Face, dx: number, dy: number, scale: number, tilt: number) {
  const width = Math.round(face.size * 1.67)
  const guide: FaceSquare = { x: Math.round((width - face.size) / 2), y: Math.round((width - face.size) / 2), size: face.size }
  const data = new Uint8ClampedArray(width * width * 4).fill(128)
  const cx = guide.x + face.size / 2 + dx * face.size, cy = guide.y + face.size / 2 + dy * face.size
  const turn = (tilt * Math.PI) / 180, cos = Math.cos(turn), sin = Math.sin(turn)
  for (let y = 0; y < width; y++) {
    for (let x = 0; x < width; x++) {
      const u = (cos * (x - cx) + sin * (y - cy)) / scale + face.size / 2
      const v = (-sin * (x - cx) + cos * (y - cy)) / scale + face.size / 2
      if (u < 0 || v < 0 || u >= face.size || v >= face.size) continue
      const source = (Math.floor(v) * face.size + Math.floor(u)) * 4
      data.set(face.data.subarray(source, source + 4), (y * width + x) * 4)
    }
  }
  return { data, width, guide }
}

const CASES: Array<[string, number, number, number, number]> = [
  ['centered', 0, 0, 1, 0],
  ['5% off', 0.05, -0.04, 1, 0],
  ['85% size, 10% off', -0.1, 0.08, 0.85, 0],
  ['tilted 10', 0.02, 0.02, 0.95, 10],
]

describe('cube size estimate on real capture crops', () => {
  if (captures.length === 0) {
    it.skip('requires saved real captures', () => {})
    return
  }

  it('never names a wrong size, and names most centered faces', () => {
    const wrong: string[] = []
    const faces = loadFaces()
    let centered = 0
    for (const face of faces) {
      for (const [label, dx, dy, scale, tilt] of CASES) {
        const { data, width, guide } = frame(face, dx, dy, scale, tilt)
        const found = estimateFaceGridSize(data, width, width, guide)
        if (found !== null && found !== face.gridSize) wrong.push(`${face.name} ${label}: ${found}`)
        if (found === face.gridSize && label === 'centered') centered++
      }
    }
    expect(wrong).toEqual([])
    // Silence is allowed, but a held face should mostly be recognized: 82%
    // of the centered faces were when this was written.
    expect(centered / faces.length).toBeGreaterThan(0.75)
  }, 300_000)
})

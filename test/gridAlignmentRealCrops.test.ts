import { describe, expect, it } from 'vitest'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import jpeg from 'jpeg-js'
import { extractColorsFromImageData } from '../src/client/imageProcessing'
import { ALIGNMENT_MAX_OFFSET, estimateTilt, findGridAlignment, type FaceSquare } from '../src/client/gridAlignment'

// Real capture crops (gitignored, like test/fixtures.test.ts) held off the
// guide: each crop is the face, pasted at an offset or scale into a grey
// frame 1.4x its size with the guide centered. A sticker counts as misread
// when it differs from the centered crop's own reading.

const root = join(__dirname, 'fixtures')
const captures = existsSync(root)
  ? readdirSync(root).filter((name) => name.startsWith('capture-') && existsSync(join(root, name, 'meta.json')))
  : []

interface Face { data: Uint8ClampedArray; size: number; gridSize: number }

function loadFaces(): Face[] {
  const faces: Face[] = []
  for (const name of captures) {
    const meta = JSON.parse(readFileSync(join(root, name, 'meta.json'), 'utf8')) as { gridSize: number; faces: Record<string, { photo: string }> }
    for (const face of ['u', 'r', 'f', 'd', 'l', 'b']) {
      const image = jpeg.decode(readFileSync(join(root, name, meta.faces[face].photo)))
      // At most the guide of a 720p camera (432 px), nearest-neighbour,
      // which keeps this test in seconds.
      const source = Math.min(image.width, image.height)
      const size = Math.min(source, 432)
      const data = new Uint8ClampedArray(size * size * 4)
      for (let y = 0; y < size; y++) {
        const sy = Math.floor(y * source / size)
        for (let x = 0; x < size; x++) {
          const from = (sy * image.width + Math.floor(x * source / size)) * 4
          data[(y * size + x) * 4] = image.data[from]
          data[(y * size + x) * 4 + 1] = image.data[from + 1]
          data[(y * size + x) * 4 + 2] = image.data[from + 2]
          data[(y * size + x) * 4 + 3] = 255
        }
      }
      faces.push({ data, size, gridSize: meta.gridSize })
    }
  }
  return faces
}

// The frame: grey, with the face resampled to `scale`, offset by (dx, dy)
// guide sizes from the centered guide and tilted by `tilt` degrees.
function frame(face: Face, dx: number, dy: number, scale: number, tilt = 0) {
  if (tilt) return tiltedFrame(face, dx, dy, scale, tilt)
  const width = Math.round(face.size * 1.4)
  const guide: FaceSquare = { x: Math.round((width - face.size) / 2), y: Math.round((width - face.size) / 2), size: face.size }
  const data = new Uint8ClampedArray(width * width * 4).fill(128)
  const drawn = Math.round(face.size * scale)
  const x0 = Math.round(guide.x + (face.size - drawn) / 2 + dx * face.size)
  const y0 = Math.round(guide.y + (face.size - drawn) / 2 + dy * face.size)
  // Nearest-neighbour rows, built once and copied per target row.
  const row = new Uint8ClampedArray(drawn * 4)
  for (let y = 0; y < drawn; y++) {
    const ty = y0 + y
    if (ty < 0 || ty >= width) continue
    const sourceRow = Math.floor(y / scale) * face.size
    for (let x = 0; x < drawn; x++) {
      const source = (sourceRow + Math.floor(x / scale)) * 4
      row[x * 4] = face.data[source]; row[x * 4 + 1] = face.data[source + 1]; row[x * 4 + 2] = face.data[source + 2]; row[x * 4 + 3] = 255
    }
    const from = Math.max(0, -x0), to = Math.min(drawn, width - x0)
    data.set(row.subarray(from * 4, to * 4), (ty * width + x0 + from) * 4)
  }
  return { data, width, guide }
}

// Nearest-neighbour: each frame pixel looks up the untilted face.
function tiltedFrame(face: Face, dx: number, dy: number, scale: number, tilt: number) {
  const width = Math.round(face.size * 1.4)
  const guide: FaceSquare = { x: Math.round((width - face.size) / 2), y: Math.round((width - face.size) / 2), size: face.size }
  const data = new Uint8ClampedArray(width * width * 4).fill(128)
  const size = face.size * scale
  const cx = guide.x + face.size / 2 + dx * face.size, cy = guide.y + face.size / 2 + dy * face.size
  const turn = (tilt * Math.PI) / 180, cos = Math.cos(turn), sin = Math.sin(turn)
  for (let y = 0; y < width; y++) {
    for (let x = 0; x < width; x++) {
      const u = (cos * (x - cx) + sin * (y - cy)) / scale + face.size / 2
      const v = (-sin * (x - cx) + cos * (y - cy)) / scale + face.size / 2
      if (u < 0 || v < 0 || u >= face.size || v >= face.size || size <= 0) continue
      const source = (Math.floor(v) * face.size + Math.floor(u)) * 4
      data.set(face.data.subarray(source, source + 4), (y * width + x) * 4)
    }
  }
  return { data, width, guide }
}

// The square turned upright by `angle` (radians) about its center.
function readTilted(data: Uint8ClampedArray, width: number, square: FaceSquare, angle: number, gridSize: number): string[][] {
  const size = Math.round(square.size)
  const cx = square.x + square.size / 2, cy = square.y + square.size / 2
  const cos = Math.cos(angle), sin = Math.sin(angle)
  const crop = new Uint8ClampedArray(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x - size / 2, v = y - size / 2
      const sx = Math.min(width - 1, Math.max(0, Math.round(cx + cos * u - sin * v)))
      const sy = Math.min(width - 1, Math.max(0, Math.round(cy + sin * u + cos * v)))
      crop.set(data.subarray((sy * width + sx) * 4, (sy * width + sx) * 4 + 4), (y * size + x) * 4)
    }
  }
  return extractColorsFromImageData(crop, size, size, gridSize).colors
}

function read(data: Uint8ClampedArray, width: number, square: FaceSquare, gridSize: number): string[][] {
  const size = Math.round(square.size)
  const x0 = Math.round(square.x), y0 = Math.round(square.y)
  // The search keeps the square inside the frame, so whole rows copy.
  const crop = new Uint8ClampedArray(size * size * 4)
  for (let y = 0; y < size; y++) {
    const sy = Math.min(width - 1, Math.max(0, y0 + y))
    const from = Math.max(0, x0), to = Math.min(width, x0 + size)
    crop.set(data.subarray((sy * width + from) * 4, (sy * width + to) * 4), (y * size + from - x0) * 4)
  }
  return extractColorsFromImageData(crop, size, size, gridSize).colors
}

const CASES: Array<[string, number, number, number, number]> = [
  ['centered', 0, 0, 1, 0],
  ['4% off', 0.04, 0.04, 1, 0],
  ['8% off', 0.08, -0.06, 1, 0],
  ['85% size', 0, 0, 0.85, 0],
  ['90% size, 5% off', -0.05, 0.05, 0.9, 0],
  ['tilted 10', 0, 0, 0.95, 10],
  ['tilted -20, 4% off', 0.04, -0.03, 0.9, -20],
]

describe('grid alignment on real capture crops', () => {
  if (captures.length === 0) {
    it.skip('requires saved real captures', () => {})
    return
  }

  it('reads off-center and undersized faces like centered ones', () => {
    const faces = loadFaces()
    const misread: Record<string, Record<number, { guide: number; aligned: number; total: number }>> = {}
    for (const face of faces) {
      const truth = extractColorsFromImageData(face.data, face.size, face.size, face.gridSize).colors
      for (const [label, dx, dy, scale, tilt] of CASES) {
        const { data, width, guide } = frame(face, dx, dy, scale, tilt)
        const angle = estimateTilt(data, width, width, guide)
        const found = findGridAlignment(data, width, width, guide, face.gridSize, angle)
        const byGuide = read(data, width, guide, face.gridSize)
        const byAlignment = found.angle ? readTilted(data, width, found, found.angle, face.gridSize) : read(data, width, found, face.gridSize)
        const entry = ((misread[label] ??= {})[face.gridSize] ??= { guide: 0, aligned: 0, total: 0 })
        for (let r = 0; r < face.gridSize; r++) {
          for (let c = 0; c < face.gridSize; c++) {
            if (byGuide[r][c] !== truth[r][c]) entry.guide++
            if (byAlignment[r][c] !== truth[r][c]) entry.aligned++
            entry.total++
          }
        }
      }
    }
    const rate = (n: number, total: number) => `${(100 * n / total).toFixed(0)}%`
    for (const [label, sizes] of Object.entries(misread)) {
      console.log(label.padEnd(18), Object.entries(sizes).map(([n, e]) => `${n}x${n} ${rate(e.guide, e.total)} -> ${rate(e.aligned, e.total)}`).join('   '))
    }
    // Inside the search range (offset plus the size change stays under half
    // a cell), alignment must never read worse than the guide beyond noise.
    // Further out the grid can snap one cell off - the guide misreads a
    // third of a 7x7 there anyway. The saved crops themselves sit up to ~9%
    // off their guide, which adds to the simulated offset, so the 5% bound
    // only applies within 60% of the range.
    for (const [label, dx, dy, scale] of CASES) {
      for (const [n, entry] of Object.entries(misread[label])) {
        const reach = Math.max(Math.abs(dx), Math.abs(dy)) + Math.abs(1 - scale) / 2
        const range = Math.min(ALIGNMENT_MAX_OFFSET, 0.45 / Number(n))
        if (reach > range) continue
        expect(entry.aligned, `${label}, ${n}x${n}`).toBeLessThanOrEqual(entry.guide + Math.ceil(entry.total * 0.01))
        if (reach <= range * 0.6) expect(entry.aligned / entry.total, `${label}, ${n}x${n}`).toBeLessThanOrEqual(0.05)
      }
    }
  })
})

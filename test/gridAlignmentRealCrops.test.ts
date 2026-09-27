import { describe, expect, it } from 'vitest'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import jpeg from 'jpeg-js'
import { extractColorsFromImageData } from '../src/client/imageProcessing'
import {
  ALIGNMENT_MAX_OFFSET,
  alignFace,
  type FaceSquare,
} from '../src/client/gridAlignment'

// Real capture crops (committed fixtures, like test/fixtures.test.ts) held off
// the guide: each crop is the face, pasted at an offset or scale into a grey
// frame 1.4x its size with the guide centered. A sticker counts as misread
// when it differs from the centered crop's own reading.

const root = join(__dirname, 'fixtures')
const captures = existsSync(root)
  ? readdirSync(root).filter(
      (name) =>
        /^(?:capture-|cube-\d+x\d+-)/.test(name) &&
        existsSync(join(root, name, 'meta.json')),
    )
  : []

interface Face {
  data: Uint8ClampedArray
  size: number
  gridSize: number
  truth: string[][]
}

function loadFaces(): Face[] {
  const faces: Face[] = []
  for (const name of captures) {
    const meta = JSON.parse(
      readFileSync(join(root, name, 'meta.json'), 'utf8'),
    ) as { gridSize: number; faces: Record<string, { photo: string }> }
    for (const face of ['u', 'r', 'f', 'd', 'l', 'b']) {
      const image = jpeg.decode(
        readFileSync(join(root, name, meta.faces[face].photo)),
      )
      // At most the guide of a 720p camera (432 px), nearest-neighbour,
      // which keeps this test in seconds.
      const source = Math.min(image.width, image.height)
      const size = Math.min(source, 432)
      const data = new Uint8ClampedArray(size * size * 4)
      for (let y = 0; y < size; y++) {
        const sy = Math.floor((y * source) / size)
        for (let x = 0; x < size; x++) {
          const from = (sy * image.width + Math.floor((x * source) / size)) * 4
          const dest = (y * size + x) * 4
          data[dest] = image.data[from]
          data[dest + 1] = image.data[from + 1]
          data[dest + 2] = image.data[from + 2]
          data[dest + 3] = 255
        }
      }
      const truth = extractColorsFromImageData(
        data,
        size,
        size,
        meta.gridSize,
      ).colors
      faces.push({ data, size, gridSize: meta.gridSize, truth })
    }
  }
  return faces
}

// The frame: grey, with the face resampled to `scale`, offset by (dx, dy)
// guide sizes from the centered guide and tilted by `tilt` degrees.
function frame(face: Face, dx: number, dy: number, scale: number, tilt = 0) {
  if (tilt) return tiltedFrame(face, dx, dy, scale, tilt)
  const width = Math.round(face.size * 1.4)
  const guide: FaceSquare = {
    x: Math.round((width - face.size) / 2),
    y: Math.round((width - face.size) / 2),
    size: face.size,
  }
  const data = new Uint8ClampedArray(width * width * 4).fill(128)
  const drawn = Math.round(face.size * scale)
  const x0 = Math.round(guide.x + (face.size - drawn) / 2 + dx * face.size)
  const y0 = Math.round(guide.y + (face.size - drawn) / 2 + dy * face.size)
  const from = Math.max(0, -x0)
  const to = Math.min(drawn, width - x0)
  const srcX = new Int32Array(to - from)
  for (let x = from; x < to; x++) {
    srcX[x - from] = Math.floor(x / scale) * 4
  }

  for (let y = 0; y < drawn; y++) {
    const ty = y0 + y
    if (ty < 0 || ty >= width) continue
    const sourceRow = Math.floor(y / scale) * face.size * 4
    let dest = (ty * width + x0 + from) * 4
    for (let i = 0; i < srcX.length; i++) {
      const src = sourceRow + srcX[i]
      data[dest] = face.data[src]
      data[dest + 1] = face.data[src + 1]
      data[dest + 2] = face.data[src + 2]
      data[dest + 3] = 255
      dest += 4
    }
  }
  return { data, width, guide }
}

// Nearest-neighbour: each frame pixel looks up the untilted face.
function tiltedFrame(
  face: Face,
  dx: number,
  dy: number,
  scale: number,
  tilt: number,
) {
  const width = Math.round(face.size * 1.4)
  const guide: FaceSquare = {
    x: Math.round((width - face.size) / 2),
    y: Math.round((width - face.size) / 2),
    size: face.size,
  }
  const data = new Uint8ClampedArray(width * width * 4).fill(128)
  const size = face.size * scale
  if (size <= 0) return { data, width, guide }
  const cx = guide.x + face.size / 2 + dx * face.size
  const cy = guide.y + face.size / 2 + dy * face.size
  const turn = (tilt * Math.PI) / 180
  const cos = Math.cos(turn)
  const sin = Math.sin(turn)
  const cosS = cos / scale
  const sinS = sin / scale
  const halfFace = face.size / 2

  let dest = 0
  for (let y = 0; y < width; y++) {
    const yOff = y - cy
    let u = -cosS * cx + sinS * yOff + halfFace
    let v = sinS * cx + cosS * yOff + halfFace
    for (let x = 0; x < width; x++) {
      if (u >= 0 && v >= 0 && u < face.size && v < face.size) {
        const source = (Math.floor(v) * face.size + Math.floor(u)) * 4
        data[dest] = face.data[source]
        data[dest + 1] = face.data[source + 1]
        data[dest + 2] = face.data[source + 2]
        data[dest + 3] = 255
      }
      u += cosS
      v -= sinS
      dest += 4
    }
  }
  return { data, width, guide }
}

// The square turned upright by `angle` (radians) about its center.
function readTilted(
  data: Uint8ClampedArray,
  width: number,
  square: FaceSquare,
  angle: number,
  gridSize: number,
): string[][] {
  const size = Math.round(square.size)
  const cx = square.x + square.size / 2
  const cy = square.y + square.size / 2
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const crop = new Uint8ClampedArray(size * size * 4)
  const halfSize = size / 2

  let dest = 0
  for (let y = 0; y < size; y++) {
    const v = y - halfSize
    let rx = cx - cos * halfSize - sin * v
    let ry = cy - sin * halfSize + cos * v
    for (let x = 0; x < size; x++) {
      const sx = Math.min(width - 1, Math.max(0, Math.round(rx)))
      const sy = Math.min(width - 1, Math.max(0, Math.round(ry)))
      const sIdx = (sy * width + sx) * 4
      crop[dest] = data[sIdx]
      crop[dest + 1] = data[sIdx + 1]
      crop[dest + 2] = data[sIdx + 2]
      crop[dest + 3] = 255
      rx += cos
      ry += sin
      dest += 4
    }
  }
  return extractColorsFromImageData(crop, size, size, gridSize).colors
}

function read(
  data: Uint8ClampedArray,
  width: number,
  square: FaceSquare,
  gridSize: number,
): string[][] {
  const size = Math.round(square.size)
  const x0 = Math.round(square.x)
  const y0 = Math.round(square.y)
  const from = Math.max(0, x0)
  const to = Math.min(width, x0 + size)
  const copyWidth = (to - from) * 4
  const xOffset = (from - x0) * 4

  // The search keeps the square inside the frame, so whole rows copy.
  const crop = new Uint8ClampedArray(size * size * 4)
  for (let y = 0; y < size; y++) {
    const sy = Math.min(width - 1, Math.max(0, y0 + y))
    crop.set(
      data.subarray((sy * width + from) * 4, (sy * width + from) * 4 + copyWidth),
      y * size * 4 + xOffset,
    )
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

  const faces = loadFaces()
  for (const [label, dx, dy, scale, tilt] of CASES) {
    it(`reads ${label} faces like centered ones`, () => {
      const misread: Record<
        number,
        { guide: number; aligned: number; total: number }
      > = {}
      for (const face of faces) {
        const truth = face.truth
        const { data, width, guide } = frame(face, dx, dy, scale, tilt)
        const found = alignFace(data, width, width, guide, face.gridSize)
        const byGuide = read(data, width, guide, face.gridSize)
        const byAlignment = found.angle
          ? readTilted(data, width, found, found.angle, face.gridSize)
          : read(data, width, found, face.gridSize)
        const entry = (misread[face.gridSize] ??= {
          guide: 0,
          aligned: 0,
          total: 0,
        })
        for (let r = 0; r < face.gridSize; r++) {
          for (let c = 0; c < face.gridSize; c++) {
            if (byGuide[r][c] !== truth[r][c]) entry.guide++
            if (byAlignment[r][c] !== truth[r][c]) entry.aligned++
            entry.total++
          }
        }
      }
      const rate = (n: number, total: number) =>
        `${((100 * n) / total).toFixed(0)}%`
      console.log(
        label.padEnd(18),
        Object.entries(misread)
          .map(
            ([n, e]) =>
              `${n}x${n} ${rate(e.guide, e.total)} -> ${rate(e.aligned, e.total)}`,
          )
          .join('   '),
      )
      // Inside the search range (offset plus the size change stays under half
      // a cell), alignment must never read worse than the guide beyond noise.
      // Further out the grid can snap one cell off - the guide misreads a
      // third of a 7x7 there anyway. The saved crops themselves sit up to ~9%
      // off their guide, which adds to the simulated offset, so the 5% bound
      // only applies within 60% of the range.
      for (const [n, entry] of Object.entries(misread)) {
        const reach =
          Math.max(Math.abs(dx), Math.abs(dy)) + Math.abs(1 - scale) / 2
        const range = Math.min(ALIGNMENT_MAX_OFFSET, 0.45 / Number(n))
        if (reach > range) continue
        expect(entry.aligned, `${label}, ${n}x${n}`).toBeLessThanOrEqual(
          entry.guide + Math.ceil(entry.total * 0.01),
        )
        if (reach <= range * 0.6)
          expect(
            entry.aligned / entry.total,
            `${label}, ${n}x${n}`,
          ).toBeLessThanOrEqual(0.05)
      }
    }, 60_000)
  }
})

// A solved GoCube with a clear shell: its outline search locked onto the
// shell's outer edge and the fingers around it, and the seam search could
// only shrink that square by 8%, so Down and Left were cropped 20% too big
// (capture-2026-09-26T22-49-08-238Z). Faces cropped right must stay so.
describe('faces inside a clear shell held by fingers', () => {
  const read = (name: string, slot: string) => {
    const dir = join(root, name)
    const meta = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8'))
    const image = jpeg.decode(readFileSync(join(dir, meta.faces[slot].photo)))
    const size = Math.min(image.width, image.height)
    const W = Math.round(size * 1.3),
      off = Math.round((W - size) / 2)
    const frame = new Uint8ClampedArray(W * W * 4).fill(128)
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const from = (y * image.width + x) * 4
        frame.set(
          [image.data[from], image.data[from + 1], image.data[from + 2], 255],
          ((y + off) * W + x + off) * 4,
        )
      }
    }
    const guide = Math.round(size * 0.75)
    return (
      alignFace(
        frame,
        W,
        W,
        { x: (W - guide) / 2, y: (W - guide) / 2, size: guide },
        3,
      ).size / size
    )
  }
  const solved = 'capture-2026-09-26T22-49-08-238Z',
    scrambled = 'capture-2026-09-26T22-13-21-276Z'
  if (
    !existsSync(join(root, solved, 'meta.json')) ||
    !existsSync(join(root, scrambled, 'meta.json'))
  ) {
    it.skip('requires the saved captures', () => {})
    return
  }

  it('finds the face, not the shell and fingers around it', () => {
    // The Down face spans about 77% of its oversized crop.
    expect(read(solved, 'd')).toBeLessThan(0.85)
  })

  it('keeps faces that were cropped right', () => {
    expect(read(solved, 'u')).toBeGreaterThan(0.92)
    for (const slot of ['u', 'r', 'f', 'd', 'b', 'l'])
      expect(read(scrambled, slot), slot).toBeGreaterThan(0.92)
  })
})

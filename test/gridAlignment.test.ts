import { describe, expect, it } from 'vitest'
import { findGridAlignment, type FaceSquare } from '../src/client/gridAlignment'

const STICKERS = [
  [220, 105, 30], [30, 150, 80], [240, 240, 235],
  [200, 40, 50], [40, 80, 200], [240, 210, 30],
]

// A region 1.4x the guide with the guide centered, and an N x N face drawn
// at `face` on a mid-grey background. Seams and the outer border are dark
// unless `seam` is null (stickerless: cells touch).
function scene(gridSize: number, face: FaceSquare, guideSize = 300, seam: number[] | null = [15, 15, 15]) {
  const width = Math.round(guideSize * 1.4)
  const height = width
  const guide = { x: (width - guideSize) / 2, y: (height - guideSize) / 2, size: guideSize }
  const data = new Uint8ClampedArray(width * height * 4)
  const cell = face.size / gridSize
  const gap = Math.max(2, cell * 0.08)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const u = x - face.x, v = y - face.y
      let rgb = [128, 128, 128]
      if (u >= 0 && v >= 0 && u < face.size && v < face.size) {
        const col = Math.floor(u / cell), row = Math.floor(v / cell)
        const inU = u - col * cell, inV = v - row * cell
        const inSeam = inU < gap / 2 || inU > cell - gap / 2 || inV < gap / 2 || inV > cell - gap / 2
        rgb = seam && inSeam ? seam : STICKERS[(row * gridSize + col) % 6]
      }
      data.set([rgb[0], rgb[1], rgb[2], 255], (y * width + x) * 4)
    }
  }
  return { data, width, height, guide }
}

// Face square offset by (dx, dy) and scaled by `scale`, as fractions of the guide.
function placed(guide: FaceSquare, dx: number, dy: number, scale = 1): FaceSquare {
  const size = guide.size * scale
  return {
    x: guide.x + (guide.size - size) / 2 + dx * guide.size,
    y: guide.y + (guide.size - size) / 2 + dy * guide.size,
    size,
  }
}

describe('findGridAlignment', () => {
  for (const gridSize of [2, 3, 4, 5, 7]) {
    it(`finds a ${gridSize}x${gridSize} face held off-center and smaller than the guide`, () => {
      const guideSize = 300
      const width = Math.round(guideSize * 1.4)
      const guide = { x: (width - guideSize) / 2, y: (width - guideSize) / 2, size: guideSize }
      // Offsets stay inside the search range: under half a cell.
      const offset = Math.min(0.08, 0.8 * 0.45 / gridSize)
      const face = placed(guide, offset, -offset * 0.6, 0.9)
      const { data, height } = scene(gridSize, face, guideSize)
      const found = findGridAlignment(data, width, height, guide, gridSize)
      expect(found.aligned).toBe(true)
      // Within 2% of the guide - a small fraction of even a 7x7 cell.
      expect(Math.abs(found.x - face.x)).toBeLessThan(guideSize * 0.02)
      expect(Math.abs(found.y - face.y)).toBeLessThan(guideSize * 0.02)
      expect(Math.abs(found.size - face.size)).toBeLessThan(guideSize * 0.03)
    })
  }

  it('stays on a face that already fills the guide', () => {
    const guideSize = 300
    const width = Math.round(guideSize * 1.4)
    const guide = { x: (width - guideSize) / 2, y: (width - guideSize) / 2, size: guideSize }
    const { data, height } = scene(4, guide, guideSize)
    const found = findGridAlignment(data, width, height, guide, 4)
    expect(Math.abs(found.x - guide.x)).toBeLessThan(guideSize * 0.02)
    expect(Math.abs(found.y - guide.y)).toBeLessThan(guideSize * 0.02)
    expect(Math.abs(found.size - guide.size)).toBeLessThan(guideSize * 0.03)
  })

  it('keeps the guide for a stickerless face without dark seams', () => {
    const guideSize = 300
    const width = Math.round(guideSize * 1.4)
    const guide = { x: (width - guideSize) / 2, y: (width - guideSize) / 2, size: guideSize }
    const { data, height } = scene(3, placed(guide, 0.06, 0.06), guideSize, null)
    const found = findGridAlignment(data, width, height, guide, 3)
    expect(found.aligned).toBe(false)
    expect(found).toMatchObject({ x: guide.x, y: guide.y, size: guide.size })
  })

  it('keeps the guide on a plain background', () => {
    const width = 420
    const guide = { x: 60, y: 60, size: 300 }
    const data = new Uint8ClampedArray(width * width * 4).fill(128)
    expect(findGridAlignment(data, width, width, guide, 3).aligned).toBe(false)
  })
})

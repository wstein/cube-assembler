import { describe, expect, it } from 'vitest'
import { cellEdges, estimateOuterCellRatio, findGridAlignment, type FaceSquare } from '../src/client/gridAlignment'

const STICKERS = [
  [220, 105, 30], [30, 150, 80], [240, 240, 235],
  [200, 40, 50], [40, 80, 200], [240, 210, 30],
]

interface Look {
  // Seam and outer border color; null draws no grid lines at all.
  seam?: number[] | null
  // Seam width as a fraction of an inner cell.
  gap?: number
  // Outer rows/columns relative to inner ones (see cellEdges).
  outer?: number
  // Sticker color by cell; defaults to six colors in turn.
  sticker?: (row: number, col: number) => number[]
}

// A region 1.4x the guide with the guide centered, and an N x N face drawn
// at `face` on a mid-grey background.
function scene(gridSize: number, face: FaceSquare, guideSize = 300, look: Look = {}) {
  const { seam = [15, 15, 15], gap = 0.08, outer = 1, sticker = (row: number, col: number) => STICKERS[(row * gridSize + col) % 6] } = look
  const width = Math.round(guideSize * 1.4)
  const height = width
  const guide = { x: (width - guideSize) / 2, y: (height - guideSize) / 2, size: guideSize }
  const data = new Uint8ClampedArray(width * height * 4)
  const edges = cellEdges(gridSize, outer).map((edge) => edge * face.size)
  const seamWidth = Math.max(2, (edges[Math.min(2, gridSize)] - edges[Math.min(1, gridSize - 1)]) * gap)
  const cellOf = (p: number) => Math.min(gridSize - 1, edges.findIndex((edge) => edge > p) - 1)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const u = x - face.x, v = y - face.y
      let rgb = [128, 128, 128]
      if (u >= 0 && v >= 0 && u < face.size && v < face.size) {
        const col = cellOf(u), row = cellOf(v)
        const inSeam = u - edges[col] < seamWidth / 2 || edges[col + 1] - u < seamWidth / 2
          || v - edges[row] < seamWidth / 2 || edges[row + 1] - v < seamWidth / 2
        rgb = seam && inSeam ? seam : sticker(row, col)
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

  for (const gridSize of [6, 7]) {
    it(`finds a ${gridSize}x${gridSize} face with wider outer cubies`, () => {
      const guideSize = 360
      const width = Math.round(guideSize * 1.4)
      const guide = { x: (width - guideSize) / 2, y: (width - guideSize) / 2, size: guideSize }
      const face = placed(guide, 0.05, -0.03, 0.92)
      const { data, height } = scene(gridSize, face, guideSize, { outer: 1.5 })
      const found = findGridAlignment(data, width, height, guide, gridSize)
      expect(found.aligned).toBe(true)
      expect(found.outer).toBeCloseTo(1.5, 1)
      expect(Math.abs(found.x - face.x)).toBeLessThan(guideSize * 0.02)
      expect(Math.abs(found.size - face.size)).toBeLessThan(guideSize * 0.03)
    })
  }

  it('finds a stickerless 7x7 by its faint grey grid lines', () => {
    // One white face; the gaps between cubies show as thin lines only
    // 25 levels darker, like the real stickerless photos.
    const guideSize = 360
    const width = Math.round(guideSize * 1.4)
    const guide = { x: (width - guideSize) / 2, y: (width - guideSize) / 2, size: guideSize }
    const face = placed(guide, -0.04, 0.05, 0.95)
    const { data, height } = scene(7, face, guideSize, { seam: [215, 215, 212], gap: 0.05, outer: 1.5, sticker: () => [240, 240, 236] })
    const found = findGridAlignment(data, width, height, guide, 7)
    expect(found.aligned).toBe(true)
    expect(Math.abs(found.x - face.x)).toBeLessThan(guideSize * 0.02)
    expect(Math.abs(found.y - face.y)).toBeLessThan(guideSize * 0.02)
  })

  it('reads the outer-cell ratio from an aligned crop', () => {
    const size = 350
    const crop = (gridSize: number, outer: number) => {
      const { data, width } = scene(gridSize, { x: 0, y: 0, size }, size / 1.4 * 1.4, { outer })
      const out = new Uint8ClampedArray(size * size * 4)
      for (let y = 0; y < size; y++) out.set(data.subarray(y * width * 4, (y * width + size) * 4), y * size * 4)
      return out
    }
    expect(estimateOuterCellRatio(crop(7, 1.5), size, size, 7)).toBeCloseTo(1.5, 1)
    expect(estimateOuterCellRatio(crop(4, 1), size, size, 4)).toBe(1)
    expect(estimateOuterCellRatio(crop(3, 1), size, size, 3)).toBe(1)
  })

  it('keeps the guide for a face without any grid lines', () => {
    const guideSize = 300
    const width = Math.round(guideSize * 1.4)
    const guide = { x: (width - guideSize) / 2, y: (width - guideSize) / 2, size: guideSize }
    const { data, height } = scene(3, placed(guide, 0.06, 0.06), guideSize, { seam: null })
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

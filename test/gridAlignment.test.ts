import { describe, expect, it } from 'vitest'
import { alignFace, estimateOuterCellRatio, estimateTilt, findGridAlignment } from '../src/client/gridAlignment'
import { placed, scene } from './syntheticFace'

describe('findGridAlignment', () => {
  for (const [scale, dx, dy] of [[1, 0.1, -0.07], [0.75, -0.12, 0.08], [1.22, 0.05, 0.04]]) {
    it(`locates a 7x7 face at scale ${scale} beyond the guide search`, () => {
      const guideSize = 300
      const width = Math.round(guideSize * 1.4)
      const guide = { x: (width - guideSize) / 2, y: (width - guideSize) / 2, size: guideSize }
      const face = placed(guide, dx, dy, scale)
      const { data, height } = scene(7, face, guideSize, { outer: 1.5 })
      const found = alignFace(data, width, height, guide, 7)
      expect(found.seams).toBe(true)
      expect(Math.abs(found.x - face.x)).toBeLessThan(guideSize * 0.02)
      expect(Math.abs(found.y - face.y)).toBeLessThan(guideSize * 0.02)
      expect(Math.abs(found.size - face.size)).toBeLessThan(guideSize * 0.03)
    })
  }

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

  it('measures how far a face is tilted', () => {
    const guideSize = 300
    const width = Math.round(guideSize * 1.4)
    const guide = { x: (width - guideSize) / 2, y: (width - guideSize) / 2, size: guideSize }
    const face = placed(guide, 0, 0, 0.8)
    const degrees = (gridSize: number, tilt: number) => {
      const { data, height } = scene(gridSize, face, guideSize, { tilt })
      return (estimateTilt(data, width, height, guide) * 180) / Math.PI
    }
    expect(degrees(3, 0)).toBe(0)
    expect(degrees(3, 8)).toBeCloseTo(8, 0)
    expect(degrees(4, -20)).toBeCloseTo(-20, 0)
    expect(degrees(7, 30)).toBeCloseTo(30, 0)
    const blank = new Uint8ClampedArray(width * width * 4).fill(128)
    expect(estimateTilt(blank, width, width, guide)).toBe(0)
  })

  for (const [gridSize, tilt] of [[3, 12], [5, -18], [7, 25]]) {
    it(`finds a ${gridSize}x${gridSize} face tilted ${tilt} degrees and held off-center`, () => {
      const guideSize = 360
      const width = Math.round(guideSize * 1.4)
      const guide = { x: (width - guideSize) / 2, y: (width - guideSize) / 2, size: guideSize }
      const offset = Math.min(0.06, 0.8 * 0.45 / gridSize)
      const face = placed(guide, offset, -offset * 0.6, 0.85)
      const { data, height } = scene(gridSize, face, guideSize, { tilt, outer: gridSize >= 5 ? 1.4 : 1 })
      const angle = estimateTilt(data, width, height, guide)
      const found = findGridAlignment(data, width, height, guide, gridSize, angle)
      expect((found.angle * 180) / Math.PI).toBeCloseTo(tilt, 0)
      expect(Math.hypot(found.center[0] - (face.x + face.size / 2), found.center[1] - (face.y + face.size / 2))).toBeLessThan(guideSize * 0.02)
      expect(Math.abs(found.size - face.size)).toBeLessThan(guideSize * 0.03)
    })
  }

  it('finds a grid whose gaps are grey, not black, next to red and blue stickers', () => {
    // Like a photographed cube with grey-brown plastic between its tiles:
    // the gaps (luminance ~91) are brighter than red (~76) and blue (~80)
    // stickers, so a brightness dip misses them; each sticker's strongest
    // channel (200+) still stands well above the gap's (100).
    const guideSize = 300
    const width = Math.round(guideSize * 1.4)
    const guide = { x: (width - guideSize) / 2, y: (width - guideSize) / 2, size: guideSize }
    const face = placed(guide, -0.05, 0.02, 0.95)
    const rows = [[[40, 80, 200], [200, 40, 50], [40, 170, 60]], [[230, 220, 40], [220, 215, 50], [235, 235, 230]], [[40, 80, 200], [200, 40, 50], [40, 170, 60]]]
    const { data, height } = scene(3, face, guideSize, { seam: [100, 90, 80], gap: 0.06, sticker: (row, col) => rows[row][col] })
    const found = findGridAlignment(data, width, height, guide, 3)
    expect(found.seams).toBe(true)
    expect(Math.abs(found.x - face.x)).toBeLessThan(guideSize * 0.02)
    expect(Math.abs(found.y - face.y)).toBeLessThan(guideSize * 0.02)
  })

  it('keeps a measured tilt only when a grid shows under it', () => {
    const guideSize = 300
    const width = Math.round(guideSize * 1.4)
    const guide = { x: (width - guideSize) / 2, y: (width - guideSize) / 2, size: guideSize }
    // Diagonal stripes: edges agree on a direction, but there is no grid.
    const stripes = new Uint8ClampedArray(width * width * 4)
    const turn = (20 * Math.PI) / 180
    for (let y = 0; y < width; y++) {
      for (let x = 0; x < width; x++) {
        const band = Math.floor((x * Math.cos(turn) + y * Math.sin(turn)) / 18) % 2
        stripes.set(band ? [200, 60, 50, 255] : [240, 230, 220, 255], (y * width + x) * 4)
      }
    }
    expect(estimateTilt(stripes, width, width, guide)).not.toBe(0)
    const striped = alignFace(stripes, width, width, guide, 3)
    expect(striped.angle).toBe(0)
    expect(striped.aligned).toBe(false)

    const face = placed(guide, 0.03, 0.02, 0.85)
    const { data, height } = scene(4, face, guideSize, { tilt: 14 })
    expect((alignFace(data, width, height, guide, 4).angle * 180) / Math.PI).toBeCloseTo(14, 0)
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

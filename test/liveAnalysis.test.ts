import { describe, expect, it } from 'vitest'
import { analyzeLiveFrame, scaleBounds, type LiveAnalysisRequest } from '../src/client/liveAnalysis'
import { DEFAULT_SAMPLING } from '../src/client/imageProcessing'

const COLORS: Record<string, number[]> = {
  W: [240, 240, 235], Y: [240, 210, 30], R: [200, 40, 50], O: [230, 110, 30], G: [40, 160, 70], B: [40, 80, 200],
}
const LETTERS = 'WYROGB'

// A width x height grey frame with an N x N face (dark seams and border),
// its center offset by (dx, dy) of the frame height, `size` of the frame
// height across, tilted `tilt` degrees; sticker colors cycle through WYROGB.
function frame(width: number, height: number, n: number, { dx = 0.02, dy = -0.01, size = 0.55, tilt = 0, face = true } = {}) {
  const data = new Uint8ClampedArray(width * height * 4)
  const side = size * height, cell = side / n, gap = Math.max(2, cell * 0.08)
  const cx = width / 2 + dx * height, cy = height / 2 + dy * height
  const turn = (tilt * Math.PI) / 180, cos = Math.cos(turn), sin = Math.sin(turn)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let rgb = [140, 135, 130]
      const u = cos * (x - cx) + sin * (y - cy) + side / 2, v = -sin * (x - cx) + cos * (y - cy) + side / 2
      if (face && u >= -4 && v >= -4 && u < side + 4 && v < side + 4) {
        const col = Math.floor(u / cell), row = Math.floor(v / cell)
        const inU = u - col * cell, inV = v - row * cell
        const seam = u < 0 || v < 0 || u >= side || v >= side || inU < gap / 2 || inU > cell - gap / 2 || inV < gap / 2 || inV > cell - gap / 2
        rgb = seam ? [15, 15, 15] : COLORS[LETTERS[(row * n + col) % 6]]
      }
      data.set([rgb[0], rgb[1], rgb[2], 255], (y * width + x) * 4)
    }
  }
  return data
}

const expected = (n: number) => Array.from({ length: n }, (_, row) => Array.from({ length: n }, (_, col) => LETTERS[(row * n + col) % 6]))
const request = (gridSize: number, extra: Partial<LiveAnalysisRequest> = {}): LiveAnalysisRequest =>
  ({ gridSize, mode: 'aligned', requireOutline: true, sampling: DEFAULT_SAMPLING, ...extra })

// Averages 3x3 blocks into 2x2 (1080p -> 720p), like a resized bitmap.
function downscale(data: Uint8ClampedArray, width: number, height: number) {
  const w = (width * 2) / 3, h = (height * 2) / 3, out = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sx = x * 1.5, sy = y * 1.5
      for (let c = 0; c < 3; c++) {
        let sum = 0
        for (const [ox, oy] of [[0, 0], [0.75, 0], [0, 0.75], [0.75, 0.75]]) sum += data[(Math.floor(sy + oy) * width + Math.floor(sx + ox)) * 4 + c]
        out[(y * w + x) * 4 + c] = sum / 4
      }
      out[(y * w + x) * 4 + 3] = 255
    }
  }
  return out
}

describe('analyzeLiveFrame', () => {
  it('finds an off-center face and reads its colors from the same square', () => {
    const result = analyzeLiveFrame(frame(1280, 720, 3), 1280, 720, request(3))
    expect(result.visible).toBe(true)
    expect(result.bounds.gridFound).toBe(true)
    expect(result.detection.colors).toEqual(expected(3))
    expect(result.detection.gridOffset?.x).toBeGreaterThan(0)
  })

  it('reads a tilted face upright', () => {
    const result = analyzeLiveFrame(frame(1280, 720, 3, { tilt: 14 }), 1280, 720, request(3))
    expect(result.visible).toBe(true)
    expect(Math.round(((result.bounds.angle ?? 0) * 180) / Math.PI)).toBe(14)
    expect(result.detection.colors).toEqual(expected(3))
  })

  it('finds the same face in a 720p copy of a 1080p frame', () => {
    const full = frame(1920, 1080, 4)
    const atFull = analyzeLiveFrame(full, 1920, 1080, request(4))
    const at720 = analyzeLiveFrame(downscale(full, 1920, 1080), 1280, 720, request(4))
    expect(at720.visible).toBe(true)
    expect(at720.detection.colors).toEqual(atFull.detection.colors)
    const back = scaleBounds(at720.bounds, 2 / 3)
    for (const key of ['startX', 'startY', 'faceWidth'] as const) expect(Math.abs(back[key] - atFull.bounds[key])).toBeLessThanOrEqual(4)
  })

  it('estimates the cube size only when asked', () => {
    const data = frame(1280, 720, 4)
    expect(analyzeLiveFrame(data, 1280, 720, request(3, { detectSize: true })).size).toBe(4)
    expect(analyzeLiveFrame(data, 1280, 720, request(3)).size).toBeUndefined()
  })

  it('estimates no size on an empty wall', () => {
    expect(analyzeLiveFrame(frame(1280, 720, 3, { face: false }), 1280, 720, request(3, { detectSize: true })).size).toBeNull()
  })

  it('finds nothing on an empty wall', () => {
    const result = analyzeLiveFrame(frame(1280, 720, 3, { face: false }), 1280, 720, request(3))
    expect(result.visible).toBe(false)
  })

  it('reads the drawn square exactly in Guide grid mode', () => {
    const result = analyzeLiveFrame(frame(1280, 720, 3, { dx: 0, dy: 0, size: 0.6 }), 1280, 720, request(3, { mode: 'fixed', requireOutline: false }))
    expect(result.bounds.gridFound).toBeUndefined()
    expect(result.detection.gridOffset).toBeUndefined()
    expect(result.detection.colors).toEqual(expected(3))
  })

  it('uses captured backdrop median to correct live sticker readings', () => {
    const original = frame(1280, 720, 3)
    const tinted = original.slice()
    for (let i = 0; i < tinted.length; i += 4) tinted[i] = Math.min(255, Math.round(tinted[i] * 1.1))
    const baseline = analyzeLiveFrame(original, 1280, 720, request(3))
    const backdrop = { r: 140, g: 135, b: 130 }
    const corrected = analyzeLiveFrame(tinted, 1280, 720, request(3, { capturedBackgrounds: { U: backdrop, R: backdrop } }))
    expect(corrected.backgroundColor?.r).toBeCloseTo(154, 0)
    expect(corrected.gains.r).toBeCloseTo(140 / 154, 2)
    expect(corrected.detection.cellColors[1][1].r).toBeCloseTo(baseline.detection.cellColors[1][1].r, 0)
    expect(analyzeLiveFrame(tinted, 1280, 720, request(3)).gains).toEqual({ r: 1, g: 1, b: 1 })
  })
})

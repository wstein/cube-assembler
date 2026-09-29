import { describe, expect, it } from 'vitest'
import {
  analyzeLiveFrame,
  scaleBounds,
  type LiveAnalysisRequest,
} from '../src/client/capture/liveAnalysis'
import { DEFAULT_SAMPLING } from '../src/client/vision/stickerColorGeometry'
import {
  linearChannelToSrgb,
  srgbChannelToLinear,
} from '../src/client/vision/colorMath'
import { scene } from './syntheticFace'
import {
  builtinColorProfiles,
  type ColorProfile,
} from '../src/client/profiles/profileSettings'

const COLORS: Record<string, number[]> = {
  W: [240, 240, 235],
  Y: [240, 210, 30],
  R: [200, 40, 50],
  O: [230, 110, 30],
  G: [40, 160, 70],
  B: [40, 80, 200],
}
const LETTERS = 'WYROGB'

// A width x height grey frame with an N x N face (dark seams and border),
// its center offset by (dx, dy) of the frame height, `size` of the frame
// height across, tilted `tilt` degrees; sticker colors cycle through WYROGB.
function frame(
  width: number,
  height: number,
  n: number,
  { dx = 0.02, dy = -0.01, size = 0.55, tilt = 0, face = true } = {},
) {
  const data = new Uint8ClampedArray(width * height * 4)
  const side = size * height,
    cell = side / n,
    gap = Math.max(2, cell * 0.08)
  const cx = width / 2 + dx * height,
    cy = height / 2 + dy * height
  const turn = (tilt * Math.PI) / 180,
    cos = Math.cos(turn),
    sin = Math.sin(turn)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let rgb = [140, 135, 130]
      const u = cos * (x - cx) + sin * (y - cy) + side / 2,
        v = -sin * (x - cx) + cos * (y - cy) + side / 2
      if (face && u >= -4 && v >= -4 && u < side + 4 && v < side + 4) {
        const col = Math.floor(u / cell),
          row = Math.floor(v / cell)
        const inU = u - col * cell,
          inV = v - row * cell
        const seam =
          u < 0 ||
          v < 0 ||
          u >= side ||
          v >= side ||
          inU < gap / 2 ||
          inU > cell - gap / 2 ||
          inV < gap / 2 ||
          inV > cell - gap / 2
        rgb = seam ? [15, 15, 15] : COLORS[LETTERS[(row * n + col) % 6]]
      }
      data.set([rgb[0], rgb[1], rgb[2], 255], (y * width + x) * 4)
    }
  }
  return data
}

const expected = (n: number) =>
  Array.from({ length: n }, (_, row) =>
    Array.from({ length: n }, (_, col) => LETTERS[(row * n + col) % 6]),
  )
const request = (
  gridSize: number,
  extra: Partial<LiveAnalysisRequest> = {},
): LiveAnalysisRequest => ({
  gridSize,
  mode: 'aligned',
  requireOutline: true,
  sampling: DEFAULT_SAMPLING,
  ...extra,
})

// Averages 3x3 blocks into 2x2 (1080p -> 720p), like a resized bitmap.
function downscale(data: Uint8ClampedArray, width: number, height: number) {
  const w = (width * 2) / 3,
    h = (height * 2) / 3,
    out = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sx = x * 1.5,
        sy = y * 1.5
      for (let c = 0; c < 3; c++) {
        let sum = 0
        for (const [ox, oy] of [
          [0, 0],
          [0.75, 0],
          [0, 0.75],
          [0.75, 0.75],
        ])
          sum +=
            data[(Math.floor(sy + oy) * width + Math.floor(sx + ox)) * 4 + c]
        out[(y * w + x) * 4 + c] = sum / 4
      }
      out[(y * w + x) * 4 + 3] = 255
    }
  }
  return out
}

describe('analyzeLiveFrame', () => {
  it('selects a saved palette for the first live face in Automatic mode', () => {
    const generic = builtinColorProfiles()[0]
    const exact: ColorProfile = {
      ...generic,
      id: 'camera-colors',
      name: 'Camera colors',
      captures: 1,
      colors: Object.fromEntries(
        Object.entries(COLORS).map(([key, rgb]) => [
          key,
          { r: rgb[0], g: rgb[1], b: rgb[2] },
        ]),
      ),
    }
    const result = analyzeLiveFrame(
      frame(1280, 720, 3),
      1280,
      720,
      request(3, { autoProfiles: [generic, exact] }),
    )
    expect(result.colorProfileId).toBe('camera-colors')
    expect(result.detection.colors).toEqual(expected(3))
    expect(result.detection.confidence).toBeGreaterThan(0.8)
  })
  it('finds an off-center face and reads its colors from the same square', () => {
    const result = analyzeLiveFrame(frame(1280, 720, 3), 1280, 720, request(3))
    expect(result.visible).toBe(true)
    expect(result.bounds.gridFound).toBe(true)
    expect(result.detection.colors).toEqual(expected(3))
    expect(result.detection.gridOffset?.x).toBeGreaterThan(0)
  })

  it('reports a slipped 7x7 grid as needing re-centering', () => {
    const size = 300
    const width = Math.round(size * 1.67)
    const guide = { x: (width - size) / 2, y: (width - size) / 2, size }
    const face = {
      x: guide.x + size * 0.25 + size * 0.05,
      y: guide.y + size * 0.05,
      size: size * 0.9,
    }
    const { data } = scene(7, face, size, { outer: 1.5 }, 1.67)
    const result = analyzeLiveFrame(
      data,
      width,
      width,
      request(7, { requireOutline: false }),
    )
    expect(result.visible).toBe(false)
    expect(result.bounds.gridFound).toBe(false)
    expect(result.bounds.needsRecentering).toBe(true)
  })

  it('reads a tilted face upright', () => {
    const result = analyzeLiveFrame(
      frame(1280, 720, 3, { tilt: 14 }),
      1280,
      720,
      request(3),
    )
    expect(result.visible).toBe(true)
    expect(Math.round(((result.bounds.angle ?? 0) * 180) / Math.PI)).toBe(14)
    expect(result.detection.colors).toEqual(expected(3))
  })

  it('finds the same face in a 720p copy of a 1080p frame', () => {
    const full = frame(1920, 1080, 4)
    const atFull = analyzeLiveFrame(full, 1920, 1080, request(4))
    const at720 = analyzeLiveFrame(
      downscale(full, 1920, 1080),
      1280,
      720,
      request(4),
    )
    expect(at720.visible).toBe(true)
    expect(at720.detection.colors).toEqual(atFull.detection.colors)
    const back = scaleBounds(at720.bounds, 2 / 3)
    for (const key of ['startX', 'startY', 'faceWidth'] as const)
      expect(Math.abs(back[key] - atFull.bounds[key])).toBeLessThanOrEqual(4)
  })

  it('never detects cube size from a frame, even for a stale request flag', () => {
    const data = frame(1280, 720, 3)
    const result = analyzeLiveFrame(data, 1280, 720, {
      ...request(3),
      detectSize: true,
    } as LiveAnalysisRequest)
    expect(result).not.toHaveProperty('size')
  })

  it('finds nothing on an empty wall', () => {
    const result = analyzeLiveFrame(
      frame(1280, 720, 3, { face: false }),
      1280,
      720,
      request(3),
    )
    expect(result.visible).toBe(false)
  })

  it('reads the drawn square exactly in Guide grid mode', () => {
    const result = analyzeLiveFrame(
      frame(1280, 720, 3, { dx: 0, dy: 0, size: 0.6 }),
      1280,
      720,
      request(3, { mode: 'fixed', requireOutline: false }),
    )
    expect(result.bounds.gridFound).toBeUndefined()
    expect(result.detection.gridOffset).toBeUndefined()
    expect(result.detection.colors).toEqual(expected(3))
  })

  it('uses captured backdrop median to correct live sticker readings', () => {
    const original = frame(1280, 720, 3)
    // A redder light: 20% more red in linear light, as a light source adds it.
    const tint = (v: number) =>
      linearChannelToSrgb(srgbChannelToLinear(v) * 1.2)
    const tinted = original.slice()
    for (let i = 0; i < tinted.length; i += 4) tinted[i] = tint(tinted[i])
    const baseline = analyzeLiveFrame(original, 1280, 720, request(3))
    const backdrop = { r: 140, g: 135, b: 130 }
    const corrected = analyzeLiveFrame(
      tinted,
      1280,
      720,
      request(3, { capturedBackgrounds: { U: backdrop, R: backdrop } }),
    )
    expect(corrected.backgroundColor?.r).toBeCloseTo(tint(140), 0)
    expect(corrected.gains.r).toBeCloseTo(1 / 1.2, 2)
    expect(corrected.detection.cellColors[1][1].r).toBeCloseTo(
      baseline.detection.cellColors[1][1].r,
      0,
    )
    expect(analyzeLiveFrame(tinted, 1280, 720, request(3)).gains).toEqual({
      r: 1,
      g: 1,
      b: 1,
    })
  })
})

describe('a face seen at an angle', () => {
  // A square 720x720 frame: the live guide is its middle 60% (432 px).
  const G = 432,
    W = 720,
    s = G * 0.95,
    x0 = (W - s) / 2,
    y0 = (W - s) / 2
  const LETTER = ['O', 'G', 'W', 'R', 'B', 'Y']
  const expected5 = Array.from({ length: 5 }, (_, r) =>
    Array.from({ length: 5 }, (_, c) => LETTER[(r * 5 + c) % 6]),
  )
  // Turned toward the camera on the right: that side is much taller.
  const corners: [number, number][] = [
    [x0 + 30, y0 + 34],
    [x0 + s - 6, y0 - 10],
    [x0 + s + 4, y0 + s + 12],
    [x0 + 24, y0 + s - 28],
  ]

  it('reads every sticker through the face corners', () => {
    const { data } = scene(5, { x: x0, y: y0, size: s }, G, { corners }, W / G)
    const result = analyzeLiveFrame(data, W, W, request(5))
    expect(result.bounds.corners).toBeDefined()
    expect(result.detection.colors).toEqual(expected5)
  })

  it('leaves a face seen straight on without corners', () => {
    const { data } = scene(5, { x: x0, y: y0, size: s }, G, {}, W / G)
    expect(
      analyzeLiveFrame(data, W, W, request(5)).bounds.corners,
    ).toBeUndefined()
  })
})

describe('scaleBounds', () => {
  it('brings the corners of a face seen at an angle back to camera pixels too', () => {
    // Analyzed at 720p, captured from the 1080p frame (scale 2/3).
    const bounds = {
      startX: 200,
      startY: 100,
      faceWidth: 400,
      faceHeight: 400,
      corners: [
        [210, 110],
        [590, 90],
        [600, 510],
        [205, 480],
      ] as [number, number][],
    }
    const back = scaleBounds(bounds, 2 / 3)
    expect(back.startX).toBe(300)
    expect(back.corners).toEqual([
      [315, 165],
      [885, 135],
      [900, 765],
      [307.5, 720],
    ])
  })

  it('leaves bounds without corners without them', () => {
    expect(
      scaleBounds(
        { startX: 10, startY: 10, faceWidth: 60, faceHeight: 60 },
        0.5,
      ).corners,
    ).toBeUndefined()
  })
})

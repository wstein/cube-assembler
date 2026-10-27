import { describe, expect, it } from 'vitest'
import { PRESETS, renderFace } from '../src/client/vision/syntheticFace'
import { rgbToOKLCH } from '../src/core/color/ColorMath.gen'

const SIZE = 168

const solid = (n: number, color: string) =>
  Array.from({ length: n }, () => Array<string>(n).fill(color))

const mean = (values: readonly number[]) =>
  values.reduce((a, b) => a + b, 0) / values.length
const spread = (values: readonly number[]) =>
  Math.sqrt(mean(values.map((v) => (v - mean(values)) ** 2)))
const correlation = (x: readonly number[], y: readonly number[]) => {
  const mx = mean(x)
  const my = mean(y)
  return mean(x.map((v, i) => (v - mx) * (y[i] - my))) / (spread(x) * spread(y))
}
const median = (values: readonly number[]) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]

// OKLCH of the center of every sticker of an n x n face, row by row.
function stickers(pixels: Uint8ClampedArray, n: number, size = SIZE) {
  const margin = Math.round(size * 0.035)
  const cell = (size - 2 * margin) / n
  const out: { row: number; col: number; l: number; c: number; h: number }[] =
    []
  for (let row = 0; row < n; row++)
    for (let col = 0; col < n; col++) {
      const x = Math.floor(margin + (col + 0.5) * cell)
      const y = Math.floor(margin + (row + 0.5) * cell)
      const i = (y * size + x) * 4
      const lch = rgbToOKLCH({
        r: pixels[i],
        g: pixels[i + 1],
        b: pixels[i + 2],
      })
      out.push({ row, col, l: lch.l, c: lch.c, h: lch.h })
    }
  return out
}

const seeds = Object.freeze(Array.from({ length: 40 }, (_, i) => i + 1))

describe('the real preset', () => {
  it('is listed, and is scatter, tone, shading and face shift together', () => {
    expect(PRESETS).toContain('real')
    const face = solid(3, 'R')
    const preset = renderFace(face, 'real', 4, 96)
    const options = renderFace(face, 'clean', 4, 96, {
      scatter: 1,
      tone: 1,
      shading: 1,
      faceShift: 1,
      lightness: 0,
    })
    // Same photo but for the label, which names the preset.
    expect(preset.slice(0, 96 * 80 * 4)).toEqual(options.slice(0, 96 * 80 * 4))
    expect(preset).not.toEqual(renderFace(face, 'scatter', 4, 96))
  })

  it('turns each part off on its own', () => {
    const face = solid(3, 'R')
    const off = renderFace(face, 'real', 4, 96, {
      tone: 0,
      shading: 0,
      faceShift: 0,
    })
    expect(off.slice(0, 96 * 80 * 4)).toEqual(
      renderFace(face, 'clean', 4, 96, { scatter: 1, lightness: 0 }).slice(
        0,
        96 * 80 * 4,
      ),
    )
  })
})

describe('shading: the light falls on the face from one side', () => {
  const planeOf = (seed: number) => {
    const n = 7
    const lit = stickers(
      renderFace(solid(n, 'W'), 'clean', seed, SIZE, {
        shading: 1,
        lightness: 0,
      }),
      n,
    )
    // The same face without shading, so the vignette drops out.
    const plain = stickers(
      renderFace(solid(n, 'W'), 'clean', seed, SIZE, { lightness: 0 }),
      n,
    )
    // Brightness against the unshaded one, over the position in the photo
    // (-0.5 to 0.5): least squares for e = a + b x + c y.
    const rows = lit.map((p, i) => ({
      x: (p.col + 0.5) / n - 0.5,
      y: (p.row + 0.5) / n - 0.5,
      e: p.l / plain[i].l - 1,
    }))
    // Both axes are centered and evenly spaced: the fit separates.
    const sxx = rows.reduce((s, r) => s + r.x * r.x, 0)
    const syy = rows.reduce((s, r) => s + r.y * r.y, 0)
    const b = rows.reduce((s, r) => s + r.x * r.e, 0) / sxx
    const c = rows.reduce((s, r) => s + r.y * r.e, 0) / syy
    const ssTotal = rows.reduce((s, r) => s + r.e * r.e, 0)
    const ssResidual = rows.reduce(
      (s, r) => s + (r.e - b * r.x - c * r.y) ** 2,
      0,
    )
    return { slope: Math.hypot(b, c), r2: 1 - ssResidual / ssTotal }
  }

  it('is off unless asked for', () => {
    const face = solid(5, 'W')
    expect(renderFace(face, 'clean', 3, 96, { shading: 0 })).toEqual(
      renderFace(face, 'clean', 3, 96),
    )
  })

  it('is a plane, as steep as in the saved captures (8 percent per width)', () => {
    const planes = seeds.map(planeOf)
    // Only the 8-bit pixels leave something the plane cannot fit.
    expect(median(planes.map((p) => p.r2))).toBeGreaterThan(0.9)
    expect(median(planes.map((p) => p.slope))).toBeGreaterThan(0.05)
    expect(median(planes.map((p) => p.slope))).toBeLessThan(0.12)
  })

  it('points a different way for another seed', () => {
    const a = renderFace(solid(5, 'W'), 'clean', 1, 96, { shading: 1 })
    const b = renderFace(solid(5, 'W'), 'clean', 2, 96, { shading: 1 })
    expect(a).not.toEqual(b)
  })
})

describe('tone: brightness goes with hue and chroma as in the saved captures', () => {
  type Deviations = Readonly<{
    dl: readonly number[]
    dc: readonly number[]
    dh: readonly number[]
  }>
  // These inputs are fixed for this describe. Keep cached vectors immutable so
  // statistical checks can share work without sharing mutable test state.
  const samples = new Map<string, Deviations>()
  // Deviations of every sticker of one color from its photo's mean, pooled
  // over many photos.
  function deviations(color: string): Deviations {
    const cached = samples.get(color)
    if (cached) return cached
    const dl: number[] = []
    const dc: number[] = []
    const dh: number[] = []
    for (const seed of seeds) {
      const points = stickers(
        renderFace(solid(7, color), 'clean', seed, SIZE, {
          tone: 1,
          scatter: 1,
          lightness: 0,
        }),
        7,
      )
      const ml = mean(points.map((p) => p.l))
      const mc = mean(points.map((p) => p.c))
      const h0 = points[0].h
      const hs = points.map((p) => ((p.h - h0 + 540) % 360) - 180)
      const mh = mean(hs)
      points.forEach((p, i) => {
        dl.push(p.l / ml - 1)
        dc.push(p.c / mc - 1)
        dh.push(hs[i] - mh)
      })
    }
    const result = Object.freeze({
      dl: Object.freeze(dl),
      dc: Object.freeze(dc),
      dh: Object.freeze(dh),
    })
    samples.set(color, result)
    return result
  }

  it('is off unless asked for', () => {
    const face = solid(5, 'R')
    const base = renderFace(face, 'clean', 3, 96, { scatter: 1 })
    expect(renderFace(face, 'clean', 3, 96, { scatter: 1, tone: 0 })).toEqual(
      base,
    )
    expect(
      renderFace(face, 'clean', 3, 96, { scatter: 1, tone: 1 }),
    ).not.toEqual(base)
  })

  it('spreads the brightness of a color by a few percent, blue the most', () => {
    const red = spread(deviations('R').dl)
    const orange = spread(deviations('O').dl)
    const blue = spread(deviations('B').dl)
    expect(red).toBeGreaterThan(0.025)
    expect(red).toBeLessThan(0.05)
    expect(orange).toBeGreaterThan(0.01)
    expect(orange).toBeLessThan(0.03)
    expect(blue).toBeGreaterThan(red)
  })

  it('makes brighter reds, greens and blues more saturated', () => {
    for (const color of ['R', 'G', 'B']) {
      const { dl, dc } = deviations(color)
      expect(correlation(dl, dc), color).toBeGreaterThan(0.3)
    }
  })

  it('turns the hue with the brightness, the way each color does', () => {
    // Saved captures: green +0.44, orange -0.35, blue -0.34.
    // Render each deterministic sample set once for both correlated channels.
    const green = deviations('G')
    const orange = deviations('O')
    const blue = deviations('B')
    expect(correlation(green.dl, green.dh)).toBeGreaterThan(0.2)
    expect(correlation(orange.dl, orange.dh)).toBeLessThan(-0.15)
    expect(correlation(blue.dl, blue.dh)).toBeLessThan(-0.15)
  })
})

describe('face shift: each photo of a cube is lit a little differently', () => {
  const meanLightness = (
    color: string,
    seed: number,
    options: { faceShift?: number },
  ) =>
    mean(
      stickers(
        renderFace(solid(3, color), 'clean', seed, 48, {
          scatter: 0,
          lightness: 0,
          ...options,
        }),
        3,
        48,
      ).map((p) => p.l),
    )

  it('is off unless asked for', () => {
    const face = solid(3, 'B')
    expect(renderFace(face, 'clean', 3, 96, { faceShift: 0 })).toEqual(
      renderFace(face, 'clean', 3, 96),
    )
  })

  it('moves blue by 8 percent of its brightness between photos, orange not at all', () => {
    const seedsMany = Array.from({ length: 150 }, (_, i) => i + 1)
    const levels = seedsMany.map((s) => meanLightness('B', s, { faceShift: 1 }))
    const relative = spread(levels) / mean(levels)
    expect(relative).toBeGreaterThan(0.05)
    expect(relative).toBeLessThan(0.11)
    const still = seedsMany.map((s) => meanLightness('B', s, {}))
    expect(spread(still) / mean(still)).toBeLessThan(0.002)
    // Orange keeps its brightness: only its hue and chroma move.
    const orange = seedsMany.map((s) => meanLightness('O', s, { faceShift: 1 }))
    expect(spread(orange) / mean(orange)).toBeLessThan(0.01)
  })
})

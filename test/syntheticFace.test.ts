import { describe, expect, it } from 'vitest'
import { PRESETS, renderFace } from '../src/client/vision/syntheticFace'
import { extractColorsFromImageData } from '../src/client/vision/faceDetection'
import { rgbToOKLCH } from '../src/core/color/ColorMath.gen'
import { NEUTRAL_GAINS } from '../src/client/vision/colorMath'
import { DEFAULT_SAMPLING } from '../src/client/vision/stickerColorGeometry'

const SIZE = 480

// A face that tells its rows and columns apart.
function grid(n: number): string[][] {
  const colors = ['W', 'Y', 'O', 'R', 'G', 'B']
  return Array.from({ length: n }, (_, r) =>
    Array.from(
      { length: n },
      (_, c) => colors[(r * 2 + c * 3 + ((r * c) % 5)) % 6],
    ),
  )
}

function read(pixels: Uint8ClampedArray, n: number) {
  return extractColorsFromImageData(
    pixels,
    SIZE,
    SIZE,
    n,
    NEUTRAL_GAINS,
    DEFAULT_SAMPLING,
  ).colors
}

describe('the synthetic face', () => {
  it('offers the clean preset first, then the lighting problems', () => {
    expect(PRESETS[0]).toBe('clean')
    expect(PRESETS).toEqual(
      expect.arrayContaining(['gradient', 'shadow', 'dim-warm', 'glare']),
    )
  })

  // Hue spread (degrees) and chroma spread (share of the mean) of the
  // stickers of one color on a 7x7 face, as measured in the face's photo.
  function scatterOf(
    color: string,
    preset = 'scatter',
    options: { scatter?: number } = {},
  ) {
    const n = 7
    const face = Array.from({ length: n }, () => Array<string>(n).fill(color))
    const pixels = renderFace(face, preset, 3, SIZE, options)
    const margin = Math.round(SIZE * 0.035)
    const cell = (SIZE - 2 * margin) / n
    const hues: number[] = []
    const chromas: number[] = []
    for (let r = 0; r < n; r++)
      for (let c = 0; c < n; c++) {
        const x = Math.floor(margin + (c + 0.5) * cell)
        const y = Math.floor(margin + (r + 0.5) * cell)
        const i = (y * SIZE + x) * 4
        const lch = rgbToOKLCH({
          r: pixels[i],
          g: pixels[i + 1],
          b: pixels[i + 2],
        })
        hues.push(lch.h)
        chromas.push(lch.c)
      }
    const mean = (values: number[]) =>
      values.reduce((a, b) => a + b, 0) / values.length
    const spread = (values: number[]) =>
      Math.sqrt(mean(values.map((v) => (v - mean(values)) ** 2)))
    return { hue: spread(hues), chroma: spread(chromas) / mean(chromas) }
  }

  it('scatters hue and chroma like the saved captures: a little for colors, a lot for white', () => {
    // Saved captures (valid cubes, median over captures): color stickers
    // spread by about 1 to 2.5 degrees of hue and 3 to 8 percent of chroma;
    // white has hardly any chroma, so its hue is all over and its chroma
    // varies by a third.
    for (const color of ['R', 'O', 'Y', 'G', 'B']) {
      const { hue, chroma } = scatterOf(color)
      expect(hue, `${color} hue`).toBeGreaterThan(0.4)
      expect(hue, `${color} hue`).toBeLessThan(4)
      expect(chroma, `${color} chroma`).toBeGreaterThan(0.02)
      expect(chroma, `${color} chroma`).toBeLessThan(0.12)
    }
    const white = scatterOf('W')
    expect(white.hue).toBeGreaterThan(8)
    expect(white.chroma).toBeGreaterThan(0.15)
    expect(white.chroma).toBeLessThan(0.6)
  })

  it('keeps clean clear, and scatters only in its own preset', () => {
    expect(PRESETS).toContain('scatter')
    // Clean: every sticker of a color has one hue and chroma (brightness
    // still differs a little).
    const clean = scatterOf('R', 'clean')
    expect(clean.hue).toBeLessThan(0.3)
    expect(clean.chroma).toBeLessThan(0.03)
    // The scatter preset is clean plus the measured scatter.
    expect(scatterOf('R', 'scatter')).toEqual(
      scatterOf('R', 'clean', { scatter: 1 }),
    )
    expect(scatterOf('R', 'scatter').hue).toBeGreaterThan(5 * clean.hue)
  })

  it('takes the scatter as an option, for any preset', () => {
    const measured = scatterOf('R', 'clean', { scatter: 1 })
    const double = scatterOf('R', 'clean', { scatter: 2 })
    // The option scales the measured spread...
    expect(double.hue).toBeGreaterThan(1.7 * measured.hue)
    expect(double.chroma).toBeGreaterThan(1.4 * measured.chroma)
    // ...and off is off, also in the scatter preset.
    expect(scatterOf('R', 'scatter', { scatter: 0 })).toEqual(
      scatterOf('R', 'clean'),
    )
  })

  it('renders a square RGBA photo', () => {
    const pixels = renderFace(grid(3), 'clean', 1, SIZE)
    expect(pixels).toHaveLength(SIZE * SIZE * 4)
    // Fully opaque.
    expect(pixels[3]).toBe(255)
    expect(pixels[pixels.length - 1]).toBe(255)
  })

  for (const n of [2, 3, 4, 5, 6, 7])
    it(`reads back as the same ${n}x${n} colors by the app's own detection`, () => {
      const colors = grid(n)
      expect(read(renderFace(colors, 'clean', 7, SIZE), n)).toEqual(colors)
    })

  it('is the same photo for the same seed, another one for another seed', () => {
    const a = renderFace(grid(3), 'noise', 5, 200)
    const b = renderFace(grid(3), 'noise', 5, 200)
    const c = renderFace(grid(3), 'noise', 6, 200)
    expect(Array.from(a)).toEqual(Array.from(b))
    expect(Array.from(a)).not.toEqual(Array.from(c))
    // The noise itself follows the seed, not only the sticker shades: the
    // top border has no stickers.
    const border = (p: Uint8ClampedArray) => Array.from(p.slice(0, 200 * 4 * 3))
    expect(border(a)).not.toEqual(border(c))
  })

  it('marks itself synthetic in a border strip, outside every sticker', () => {
    const size = 600
    const pixels = renderFace(grid(5), 'clean', 1, size)
    const margin = Math.round(size * 0.035)
    // Lettering (light on the dark border) sits in the bottom strip only.
    const lit = (y: number) => {
      let count = 0
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4
        if (pixels[i] > 110 && pixels[i + 1] > 110 && pixels[i + 2] > 110)
          count++
      }
      return count
    }
    let bottom = 0
    for (let y = size - margin; y < size; y++) bottom += lit(y)
    let top = 0
    for (let y = 0; y < margin; y++) top += lit(y)
    expect(bottom).toBeGreaterThan(40)
    expect(top).toBe(0)
  })

  it('shades a gradient across the photo, left to right', () => {
    const colors = Array.from({ length: 3 }, () => Array(3).fill('W'))
    const pixels = renderFace(colors, 'gradient', 1, SIZE)
    const at = (x: number, y: number) => {
      const i = (y * SIZE + x) * 4
      return [pixels[i], pixels[i + 1], pixels[i + 2]]
    }
    // Red rises left to right, blue falls.
    const left = at(Math.round(SIZE * 0.2), Math.round(SIZE * 0.2))
    const right = at(Math.round(SIZE * 0.8), Math.round(SIZE * 0.2))
    expect(right[0]).toBeGreaterThan(left[0])
    expect(right[2]).toBeLessThan(left[2])
  })

  it('darkens a band for the shadow preset', () => {
    const colors = Array.from({ length: 3 }, () => Array(3).fill('W'))
    const clean = renderFace(colors, 'clean', 1, SIZE)
    const shadow = renderFace(colors, 'shadow', 1, SIZE)
    const mean = (p: Uint8ClampedArray) => {
      let s = 0
      for (let i = 0; i < p.length; i += 4) s += p[i]
      return s / (p.length / 4)
    }
    expect(mean(shadow)).toBeLessThan(mean(clean) * 0.99)
  })

  it('darkens the shadow band by about 15 percent, as soft as a real shadow', () => {
    const colors = Array.from({ length: 3 }, () => Array(3).fill('W'))
    const clean = renderFace(colors, 'clean', 1, SIZE)
    const shadow = renderFace(colors, 'shadow', 1, SIZE)
    // The middle of the band: (x + y) / 2 is 0.525 of the photo.
    const x = Math.round(SIZE * 0.5)
    const y = Math.round(SIZE * 0.55)
    const i = (y * SIZE + x) * 4
    const factor = shadow[i] / clean[i]
    expect(factor).toBeGreaterThan(0.82)
    expect(factor).toBeLessThan(0.88)
  })

  describe('parameters', () => {
    const MARGIN = Math.round(SIZE * 0.035)
    const white = (n: number) =>
      Array.from({ length: n }, () => Array<string>(n).fill('W'))
    const at = (pixels: Uint8ClampedArray, x: number, y: number) => {
      const i = (Math.floor(y) * SIZE + Math.floor(x)) * 4
      return { r: pixels[i], g: pixels[i + 1], b: pixels[i + 2] }
    }
    // The center of sticker (row, col) of an n x n face with the default
    // geometry.
    const center = (n: number, row: number, col: number) => ({
      x: MARGIN + ((col + 0.5) * (SIZE - 2 * MARGIN)) / n,
      y: MARGIN + ((row + 0.5) * (SIZE - 2 * MARGIN)) / n,
    })
    const cellOf = (n: number) => (SIZE - 2 * MARGIN) / n
    // How much the brightness of the stickers of a 7x7 face varies.
    const lightnessSpread = (options: { lightness?: number }) => {
      const pixels = renderFace(white(7), 'clean', 3, SIZE, options)
      const values: number[] = []
      for (let r = 0; r < 7; r++)
        for (let c = 0; c < 7; c++) {
          const { x, y } = center(7, r, c)
          values.push(at(pixels, x, y).r)
        }
      const mean = values.reduce((a, b) => a + b, 0) / values.length
      return (
        Math.sqrt(
          values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length,
        ) / mean
      )
    }

    it('scales the brightness scatter between stickers', () => {
      expect(lightnessSpread({ lightness: 5 })).toBeGreaterThan(
        1.5 * lightnessSpread({ lightness: 1 }),
      )
      expect(lightnessSpread({ lightness: 0 })).toBeLessThan(
        lightnessSpread({ lightness: 1 }),
      )
    })

    it('sets the brightness spread of the scatter preset like the saved captures', () => {
      // Median 3 to 8 percent per color over the saved captures.
      const cv = (preset: string) => {
        const pixels = renderFace(white(7), preset, 3, SIZE)
        const values: number[] = []
        for (let r = 0; r < 7; r++)
          for (let c = 0; c < 7; c++) {
            const { x, y } = center(7, r, c)
            values.push(at(pixels, x, y).r)
          }
        const mean = values.reduce((a, b) => a + b, 0) / values.length
        return (
          Math.sqrt(
            values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length,
          ) / mean
        )
      }
      expect(cv('scatter')).toBeGreaterThan(0.03)
      expect(cv('scatter')).toBeLessThan(0.08)
      expect(cv('clean')).toBeLessThan(cv('scatter'))
    })

    it('takes other sticker colors, and keeps the rest', () => {
      const face = [
        ['W', 'R'],
        ['G', 'B'],
      ]
      const plain = renderFace(face, 'clean', 1, SIZE)
      const custom = renderFace(face, 'clean', 1, SIZE, {
        palette: { W: { r: 200, g: 40, b: 40 } },
      })
      const w = center(2, 0, 0)
      expect(at(custom, w.x, w.y).r).toBeGreaterThan(150)
      expect(at(custom, w.x, w.y).g).toBeLessThan(80)
      for (const [row, col] of [
        [0, 1],
        [1, 0],
        [1, 1],
      ]) {
        const { x, y } = center(2, row, col)
        expect(at(custom, x, y)).toEqual(at(plain, x, y))
      }
    })

    it('puts a logo on one sticker', () => {
      const pixels = renderFace(white(3), 'clean', 1, SIZE, {
        logo: { row: 0, col: 0, color: 'B', size: 0.5 },
      })
      const mid = center(3, 0, 0)
      expect(at(pixels, mid.x, mid.y).b).toBeGreaterThan(
        at(pixels, mid.x, mid.y).r + 60,
      )
      // Near the sticker's corner and on its neighbors it stays white.
      const cell = cellOf(3)
      const corner = at(pixels, mid.x - 0.4 * cell, mid.y - 0.4 * cell)
      expect(Math.abs(corner.b - corner.r)).toBeLessThan(30)
      const other = center(3, 1, 1)
      expect(
        Math.abs(
          at(pixels, other.x, other.y).b - at(pixels, other.x, other.y).r,
        ),
      ).toBeLessThan(30)
    })

    it('adds noise, blur and brightness on top of any preset', () => {
      const top = (pixels: Uint8ClampedArray) => {
        // Pixels of the top border: no stickers, so flat unless noisy.
        const values: number[] = []
        for (let x = 20; x < SIZE - 20; x++) values.push(at(pixels, x, 2).r)
        const mean = values.reduce((a, b) => a + b, 0) / values.length
        return Math.sqrt(
          values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length,
        )
      }
      const clean = renderFace(white(3), 'clean', 1, SIZE)
      expect(top(clean)).toBeLessThan(2)
      expect(
        top(renderFace(white(3), 'clean', 1, SIZE, { noise: 12 })),
      ).toBeGreaterThan(8)
      // Edges soften: the steepest step from pixel to pixel along a row is
      // flatter.
      const steepest = (pixels: Uint8ClampedArray) => {
        let max = 0
        const y = Math.floor(SIZE / 2)
        for (let x = 1; x < SIZE; x++)
          max = Math.max(
            max,
            Math.abs(at(pixels, x, y).r - at(pixels, x - 1, y).r),
          )
        return max
      }
      expect(
        steepest(renderFace(white(3), 'clean', 1, SIZE, { blur: 5 })),
      ).toBeLessThan(0.5 * steepest(clean))
      // Brightness scales every sticker.
      const mid = center(3, 1, 1)
      const dim = renderFace(white(3), 'clean', 1, SIZE, { brightness: 0.5 })
      expect(at(dim, mid.x, mid.y).r / at(clean, mid.x, mid.y).r).toBeCloseTo(
        0.5,
        1,
      )
    })

    it('takes the geometry: gap, corner radius and border', () => {
      const face = white(2)
      const cell = cellOf(2)
      // Just inside a sticker's edge next to the gap (default gap 0.07).
      const nearGap = { x: MARGIN + cell - 0.2 * cell, y: center(2, 0, 0).y }
      const plain = renderFace(face, 'clean', 1, SIZE)
      const wide = renderFace(face, 'clean', 1, SIZE, {
        geometry: { gap: 0.5 },
      })
      expect(at(plain, nearGap.x, nearGap.y).r).toBeGreaterThan(150)
      expect(at(wide, nearGap.x, nearGap.y).r).toBeLessThan(60)
      // Just inside the default border.
      const edge = { x: MARGIN + 0.1 * cell, y: center(2, 0, 0).y }
      const framed = renderFace(face, 'clean', 1, SIZE, {
        geometry: { margin: 0.12 },
      })
      expect(at(plain, edge.x, edge.y).r).toBeGreaterThan(150)
      expect(at(framed, edge.x, edge.y).r).toBeLessThan(60)
      // A round sticker has dark corners.
      const corner = { x: MARGIN + 0.15 * cell, y: MARGIN + 0.15 * cell }
      const round = renderFace(face, 'clean', 1, SIZE, {
        geometry: { radius: 0.5 },
      })
      expect(at(round, corner.x, corner.y).r).toBeLessThan(80)
      expect(at(plain, corner.x, corner.y).r).toBeGreaterThan(
        at(round, corner.x, corner.y).r,
      )
    })
  })

  it('rejects an unknown preset', () => {
    expect(() => renderFace(grid(3), 'sepia', 1, SIZE)).toThrow(/preset/)
  })
})

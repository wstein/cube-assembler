import { describe, expect, it } from 'vitest'
import { PRESETS, renderFace } from '../src/client/vision/syntheticFace'
import { extractColorsFromImageData } from '../src/client/vision/faceDetection'
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
    expect(mean(shadow)).toBeLessThan(mean(clean) * 0.95)
  })

  it('rejects an unknown preset', () => {
    expect(() => renderFace(grid(3), 'sepia', 1, SIZE)).toThrow(/preset/)
  })
})

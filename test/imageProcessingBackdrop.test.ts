/**
 * test/imageProcessingBackdrop.test.ts
 * Vitest tests for the pure, DOM-free parts of src/client/imageProcessing.ts
 * (learnStickerColors' unsupervised color learning, hungarianAssignment's
 * optimal balanced assignment, trimmedMeanColor's outlier-robust pixel
 * averaging). Most canvas/Image-touching functions in this file
 * (extractCubeFaceColors, redetectFaceColors, runGlobalWhiteBalance, ...)
 * need a browser DOM this project's node test environment doesn't provide,
 * so they aren't covered here - extractBackgroundColor is the one
 * exception, since its only DOM dependency is `canvas.getContext('2d')`
 * returning something with getImageData/width/height, which a plain
 * duck-typed object can stand in for without a real Canvas.
 *
 * Run: npx vitest run test/imageProcessingBackdrop.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  trimmedMeanColor,
  extractBackgroundColor,
  BACKGROUND_CUBE_GAP,
  applyGains,
  applyGainsToPixels,
  backdropReference,
  removeGains,
  computeBackgroundGains,
  stickerSampleRect,
  DEFAULT_SAMPLING,
  measureSharpness,
  classifySticker,
  stickerColor,
  NEUTRAL_GAINS,
  type RGB,
} from '../src/client/imageProcessing'

describe('extractBackgroundColor', () => {
  // Simulates a real browser's getImageData(sx, sy, sw, sh): the arguments
  // are doubles per spec, but the returned ImageData is necessarily
  // integer-pixel-sized, so a real implementation rounds internally. A
  // caller that requests a FRACTIONAL sw/sh but then does its own manual
  // (row * width + col) pixel-index math using that same unrounded width
  // will disagree with what was actually allocated, drifting further off
  // with every row until it reads past the buffer's real end - this mock
  // reproduces exactly that rounding behavior so the test can catch it.
  function fakeCanvas(
    width: number,
    height: number,
    fill: RGB,
  ): HTMLCanvasElement {
    return {
      width,
      height,
      getContext: (kind: string) => {
        if (kind !== '2d') return null
        return {
          getImageData(_sx: number, _sy: number, sw: number, sh: number) {
            const w = Math.round(sw)
            const h = Math.round(sh)
            const data = new Uint8ClampedArray(w * h * 4)
            for (let i = 0; i < w * h; i++) {
              data[i * 4] = fill.r
              data[i * 4 + 1] = fill.g
              data[i * 4 + 2] = fill.b
              data[i * 4 + 3] = 255
            }
            return { data, width: w, height: h }
          },
        }
      },
    } as unknown as HTMLCanvasElement
  }

  it('recovers the exact fill color from a uniform background ring, even at a width/height that lands on fractional pixel boundaries', () => {
    // 641x481 (odd dimensions) make computeFaceBounds' fraction-based
    // math land on non-integer bounds internally - the exact condition
    // that exposed a real bug (fixed in computeFaceBounds by rounding its
    // returned bounds): before that fix, this returned {r:NaN,g:NaN,b:NaN}
    // because the ring-scan's manual indexing silently read past the
    // mock's actual (rounded-width) buffer for the later rows.
    const canvas = fakeCanvas(641, 481, { r: 120, g: 130, b: 140 })
    const result = extractBackgroundColor(canvas)
    expect(result).toEqual({ r: 120, g: 130, b: 140 })
  })

  it('never returns a non-finite channel, regardless of input dimensions', () => {
    for (const [w, h] of [
      [640, 480],
      [641, 481],
      [999, 333],
      [100, 100],
      [237, 891],
    ]) {
      const result = extractBackgroundColor(
        fakeCanvas(w, h, { r: 50, g: 60, b: 70 }),
      )
      if (result) {
        expect(Number.isFinite(result.r)).toBe(true)
        expect(Number.isFinite(result.g)).toBe(true)
        expect(Number.isFinite(result.b)).toBe(true)
      }
    }
  })

  it('returns null for a frame too small to have a meaningful background ring', () => {
    expect(
      extractBackgroundColor(fakeCanvas(30, 30, { r: 100, g: 100, b: 100 })),
    ).toBeNull()
  })

  it('returns null when the ring reads back too dark to be a reliable reference', () => {
    expect(
      extractBackgroundColor(fakeCanvas(640, 480, { r: 2, g: 2, b: 2 })),
    ).toBeNull()
  })
})

describe('stickerSampleRect', () => {
  it('defaults to sampling the centered 60% of each cell of the whole square', () => {
    expect(stickerSampleRect(0, 0, 3, 300, 300)).toEqual({
      x: 20,
      y: 20,
      width: 60,
      height: 60,
    })
    expect(DEFAULT_SAMPLING).toEqual({ stickerCore: 0.6 })
  })

  it('shrinks the sampled zone with a smaller sticker core, keeping it centered', () => {
    expect(stickerSampleRect(1, 2, 3, 300, 300, { stickerCore: 0.5 })).toEqual({
      x: 225,
      y: 125,
      width: 50,
      height: 50,
    })
  })
})

describe('extractBackgroundColor gap to the cube', () => {
  // A frame with a grey backdrop and red pixels wherever `red` says - a
  // face, or a hand hugging it.
  function frame(
    width: number,
    height: number,
    red: (x: number, y: number) => boolean,
  ): HTMLCanvasElement {
    return {
      width,
      height,
      getContext: () => ({
        getImageData(sx: number, sy: number, sw: number, sh: number) {
          const data = new Uint8ClampedArray(sw * sh * 4)
          for (let y = 0; y < sh; y++)
            for (let x = 0; x < sw; x++) {
              data.set(
                red(sx + x, sy + y) ? [200, 40, 40, 255] : [120, 120, 120, 255],
                (y * sw + x) * 4,
              )
            }
          return { data, width: sw, height: sh }
        },
      }),
    } as unknown as HTMLCanvasElement
  }
  // 800x500: the 300px guide square is x 250..550, y 100..400.
  const handBand = (reach: number) =>
    frame(
      800,
      500,
      (x, y) =>
        x >= 250 - reach &&
        x < 550 + reach &&
        y >= 100 - reach &&
        y < 400 + reach,
    )

  it('always leaves out a band of BACKGROUND_CUBE_GAP around the face', () => {
    expect(BACKGROUND_CUBE_GAP * 300).toBe(75)
    expect(extractBackgroundColor(handBand(70))).toEqual({
      r: 120,
      g: 120,
      b: 120,
    })
  })

  it('keeps the fixed band when more hand surrounds the face', () => {
    const wide = handBand(100)
    expect(extractBackgroundColor(wide)!.r).toBeGreaterThan(
      extractBackgroundColor(wide)!.g + 5,
    )
  })

  it('goes by the detected face, not the guide square', () => {
    // 900x500: the guide square is x 300..600; a 220px red face sits at
    // x 670..890, y 140..360, mostly outside it and its gap.
    const face = { startX: 670, startY: 140, faceWidth: 220, faceHeight: 220 }
    const offGuide = frame(
      900,
      500,
      (x, y) => x >= 670 && x < 890 && y >= 140 && y < 360,
    )
    expect(extractBackgroundColor(offGuide)).not.toEqual({
      r: 120,
      g: 120,
      b: 120,
    })
    expect(extractBackgroundColor(offGuide, face)).toEqual({
      r: 120,
      g: 120,
      b: 120,
    })
  })

  it('gives up when the cube leaves too little backdrop', () => {
    expect(
      extractBackgroundColor(
        frame(300, 300, () => false),
        { startX: 0, startY: 0, faceWidth: 300, faceHeight: 300 },
      ),
    ).toBeNull()
  })
})

describe('computeBackgroundGains', () => {
  const grey = (v: number, tint: Partial<RGB> = {}): RGB => ({
    r: v,
    g: v,
    b: v,
    ...tint,
  })

  it('brings each face to the median backdrop, so one odd face moves only itself', () => {
    const backdrops = {
      U: grey(100),
      R: grey(100),
      F: grey(100),
      D: grey(100),
      L: grey(100),
      B: grey(100, { b: 125 }),
    }
    const gains = computeBackgroundGains(backdrops)!
    for (const f of ['U', 'R', 'F', 'D', 'L'])
      expect(gains[f]).toEqual({ r: 1, g: 1, b: 1 })
    // Applied in linear light, the odd face's backdrop lands on the others'.
    expect(applyGains(backdrops.B, gains.B)).toEqual(grey(100))
  })

  it('works in linear light, not on sRGB values', () => {
    // sRGB 125 -> 100 is a linear factor of about 0.62, not 100/125 = 0.8.
    const gains = computeBackgroundGains({
      U: grey(100),
      R: grey(100),
      F: grey(100),
      B: grey(100, { b: 125 }),
    })!
    expect(gains.B.b).toBeCloseTo(0.62, 2)
    // Doubling linear light turns sRGB 128 into 176, not 256.
    expect(applyGains(grey(128), { r: 2, g: 1, b: 1 })).toEqual({
      r: 176,
      g: 128,
      b: 128,
    })
    expect(applyGains(grey(0), { r: 2, g: 2, b: 2 })).toEqual(grey(0))
  })

  it('caps each gain at the old strength and leaves faces without a reading neutral', () => {
    const gains = computeBackgroundGains({
      U: grey(100),
      R: grey(100),
      F: grey(100),
      D: grey(50),
      L: null,
      B: undefined,
    })!
    // 1.3 in sRGB terms, i.e. 1.3^2.2 in linear light.
    expect(gains.D.r).toBeCloseTo(1.3 ** 2.2, 5)
    expect(gains.L).toEqual(NEUTRAL_GAINS)
    expect(gains.B).toEqual(NEUTRAL_GAINS)
  })

  it('needs at least 3 readings', () => {
    expect(
      computeBackgroundGains({ U: grey(100), R: grey(90), F: null }),
    ).toBeNull()
  })
})

describe('measureSharpness', () => {
  // 8px checkerboard, then the same image box-blurred - blur must score lower.
  const size = 64
  function checkerboard(): Uint8ClampedArray {
    const data = new Uint8ClampedArray(size * size * 4)
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const v = ((x >> 3) + (y >> 3)) % 2 ? 230 : 20
        data.set([v, v, v, 255], (y * size + x) * 4)
      }
    return data
  }
  function boxBlur(src: Uint8ClampedArray, radius: number): Uint8ClampedArray {
    const out = new Uint8ClampedArray(src.length)
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        let sum = 0,
          n = 0
        for (let dy = -radius; dy <= radius; dy++)
          for (let dx = -radius; dx <= radius; dx++) {
            const xx = Math.min(size - 1, Math.max(0, x + dx)),
              yy = Math.min(size - 1, Math.max(0, y + dy))
            sum += src[(yy * size + xx) * 4]
            n++
          }
        const v = sum / n
        out.set([v, v, v, 255], (y * size + x) * 4)
      }
    return out
  }

  it('scores a blurred image lower than the sharp original', () => {
    const sharp = checkerboard()
    const soft = measureSharpness(boxBlur(sharp, 1), size, size)
    const softer = measureSharpness(boxBlur(sharp, 3), size, size)
    expect(measureSharpness(sharp, size, size)).toBeGreaterThan(soft)
    expect(soft).toBeGreaterThan(softer)
  })

  it('is 0 for a flat image', () => {
    const flat = new Uint8ClampedArray(size * size * 4).fill(128)
    expect(measureSharpness(flat, size, size)).toBe(0)
  })
})

describe('classifySticker', () => {
  const hex = (h: string): RGB => ({
    r: parseInt(h.slice(1, 3), 16),
    g: parseInt(h.slice(3, 5), 16),
    b: parseInt(h.slice(5, 7), 16),
  })
  const scale = (c: RGB, f: number): RGB => ({
    r: c.r * f,
    g: c.g * f,
    b: c.b * f,
  })
  // Sticker shades differ a lot between manufacturers (W, Y, O, R, G, B).
  const palettes: Record<string, string[]> = {
    "Rubik's brand": [
      '#FFFFFF',
      '#FFD500',
      '#FF5800',
      '#B71234',
      '#009B48',
      '#0046AD',
    ],
    'stickerless bright': [
      '#FFFFFF',
      '#FFFF00',
      '#FF8C00',
      '#FF1010',
      '#00D800',
      '#0060FF',
    ],
    fluorescent: [
      '#F4F4F4',
      '#EBFF00',
      '#FF6A00',
      '#FF0040',
      '#39FF14',
      '#1F51FF',
    ],
    pastel: ['#FFFFFF', '#FFF3A0', '#FFB385', '#FF7A8A', '#8EE6A6', '#8AB6FF'],
    'dark classic': [
      '#E8E8E8',
      '#E0C000',
      '#E05000',
      '#A00010',
      '#006030',
      '#002F80',
    ],
  }

  for (const [name, colors] of Object.entries(palettes)) {
    it(`reads the ${name} palette without a learned palette, at full and dim exposure`, () => {
      for (const exposure of [1, 0.6, 0.4]) {
        const read = colors.map(
          (c) => classifySticker(scale(hex(c), exposure)).color,
        )
        expect(read, `exposure ${exposure}`).toEqual([
          'W',
          'Y',
          'O',
          'R',
          'G',
          'B',
        ])
      }
    })
  }

  it('reads a dim white as White, not Orange', () => {
    expect(classifySticker({ r: 162, g: 167, b: 169 }).color).toBe('W')
  })

  it('uses a learned palette when given one, so a very red orange reads right', () => {
    // A real 7x7's learned orange (hue ~33) sits closer to the typical red
    // hue than the typical orange one - only its learned palette tells them apart.
    const learned: Record<string, RGB> = {
      W: { r: 168, g: 172, b: 172 },
      Y: { r: 182, g: 200, b: 38 },
      O: { r: 217, g: 69, b: 38 },
      R: { r: 164, g: 22, b: 36 },
      G: { r: 4, g: 142, b: 55 },
      B: { r: 0, g: 58, b: 121 },
    }
    const orange = { r: 215, g: 65, b: 38 }
    expect(classifySticker(orange).color).toBe('R')
    const withPalette = classifySticker(orange, learned)
    expect(withPalette.color).toBe('O')
    expect(withPalette.confidence).toBeGreaterThan(0.8)
  })

  it('is less confident near the boundary between two hues than at a typical hue', () => {
    const typicalGreen = classifySticker({ r: 0, g: 155, b: 72 }).confidence
    const yellowGreen = classifySticker({ r: 150, g: 190, b: 20 }).confidence
    expect(typicalGreen).toBeGreaterThan(yellowGreen)
  })
})

describe('stickerColor', () => {
  const repeat = (c: RGB, times: number) =>
    Array.from({ length: times }, () => ({ ...c }))

  it('measures a colored sticker through a reflection covering half of it', () => {
    // An orange sticker, half of it mirroring a lamp as pale pink - the
    // trimmed mean lands in between, the sticker's own pixels don't.
    const orange = { r: 170, g: 62, b: 40 }
    const pixels = [
      ...repeat(orange, 50),
      ...repeat({ r: 209, g: 134, b: 198 }, 50),
    ]
    expect(classifySticker(trimmedMeanColor(pixels)!).color).not.toBe('O')
    expect(stickerColor(pixels)).toEqual(orange)
  })

  it('keeps the plain trimmed mean for a white sticker', () => {
    const pixels = [
      ...repeat({ r: 200, g: 202, b: 205 }, 90),
      ...repeat({ r: 210, g: 150, b: 120 }, 10),
    ]
    expect(stickerColor(pixels)).toEqual(trimmedMeanColor(pixels))
  })

  it('is null without pixels', () => {
    expect(stickerColor([])).toBeNull()
  })
})

describe('showing the backdrop adjustment', () => {
  const grey = (v: number, tint: Partial<RGB> = {}): RGB => ({
    r: v,
    g: v,
    b: v,
    ...tint,
  })

  it('adjusts every pixel of a photo as the stickers are adjusted', () => {
    const pixels = new Uint8ClampedArray([128, 128, 128, 255, 10, 200, 90, 255])
    const gains = { r: 2, g: 1, b: 0.5 }
    const out = applyGainsToPixels(pixels, gains)
    expect([...out.subarray(0, 4)]).toEqual([
      ...Object.values(applyGains(grey(128), gains)),
      255,
    ])
    expect([...out.subarray(4, 8)]).toEqual([
      ...Object.values(applyGains({ r: 10, g: 200, b: 90 }, gains)),
      255,
    ])
    expect([...applyGainsToPixels(pixels, NEUTRAL_GAINS)]).toEqual([...pixels])
  })

  it('names the backdrop every face is brought to: the median in linear light', () => {
    const backdrops = { U: grey(100), R: grey(100), F: grey(120), D: null }
    const reference = backdropReference(backdrops)!
    expect(reference).toEqual(grey(100))
    // Applying a face's gain to its backdrop lands on the reference.
    expect(
      applyGains(backdrops.F, computeBackgroundGains(backdrops)!.F),
    ).toEqual(reference)
    expect(backdropReference({ U: grey(100), R: null })).toBeNull()
  })
})

describe('undoing the backdrop adjustment on a sticker reading', () => {
  it('recovers the sticker color before its face was adjusted', () => {
    const gains = { r: 0.6, g: 1.26, b: 0.95 }
    for (const color of [
      { r: 85, g: 168, b: 52 },
      { r: 200, g: 40, b: 50 },
      { r: 30, g: 70, b: 190 },
    ]) {
      const back = removeGains(applyGains(color, gains), gains)
      expect(Math.abs(back.r - color.r)).toBeLessThanOrEqual(1)
      expect(Math.abs(back.g - color.g)).toBeLessThanOrEqual(1)
      expect(Math.abs(back.b - color.b)).toBeLessThanOrEqual(1)
    }
    expect(removeGains({ r: 12, g: 34, b: 56 }, NEUTRAL_GAINS)).toEqual({
      r: 12,
      g: 34,
      b: 56,
    })
  })
})

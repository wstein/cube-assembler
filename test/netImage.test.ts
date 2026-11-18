import { describe, expect, it } from 'vitest'
import { parseCubeInput } from '../src/client/capture/captureFlow'
import type { CubeState } from '../src/cube/cubeAssembly'
import { classifyAcrossFaces } from '../src/client/capture/captureRecalibration'
import { NEUTRAL_GAINS } from '../src/client/vision/colorMath'
import { extractColorsFromImageData } from '../src/client/vision/faceDetection'
import { DEFAULT_SAMPLING } from '../src/client/vision/stickerColorGeometry'
import { randomCube } from '../src/cube/randomState'
import { readNetImage } from '../src/core/vision/NetImage.gen'

// Every cube size the app handles.
const SIZES = Array.from({ length: 14 }, (_, i) => i + 2)

type RGB = [number, number, number]
const STANDARD: Record<string, RGB> = {
  W: [250, 250, 245],
  Y: [250, 215, 60],
  O: [240, 140, 50],
  R: [200, 40, 45],
  G: [60, 170, 90],
  B: [45, 85, 215],
}
// Pastel tones like a web net with black lines.
const PASTEL: Record<string, RGB> = {
  W: [255, 255, 255],
  Y: [243, 242, 85],
  O: [243, 178, 70],
  R: [221, 67, 64],
  G: [125, 213, 120],
  B: [48, 95, 240],
}

interface NetStyle {
  cell: number
  // Pixels between stickers of one face.
  gap: number
  // Extra pixels between the faces.
  faceGap: number
  margin: number
  background: RGB
  // A dark panel under each face, like the app's own net.
  panel: boolean
  // Dark lines between stickers (the gap is the line) and around the faces.
  lines: boolean
  // Light blocks above each face, like face titles.
  labels: boolean
  palette: Record<string, RGB>
  // Each sticker's color is off by up to this much per channel.
  jitter?: number
  // Small bright squares in the margin, like specks of dust or icons.
  specks?: number
}

const DARK_GAPPED: NetStyle = {
  cell: 24,
  gap: 4,
  faceGap: 12,
  margin: 20,
  background: [13, 15, 25],
  panel: true,
  lines: false,
  labels: true,
  palette: STANDARD,
}
const LIGHT_LINES: NetStyle = {
  cell: 30,
  gap: 3,
  faceGap: 0,
  margin: 10,
  background: [250, 250, 250],
  panel: false,
  lines: true,
  labels: false,
  palette: PASTEL,
}
const DARK_TIGHT: NetStyle = {
  cell: 20,
  gap: 3,
  faceGap: 0,
  margin: 8,
  background: [17, 22, 40],
  panel: false,
  lines: false,
  labels: false,
  palette: STANDARD,
}
const LIGHT_PANELS: NetStyle = {
  cell: 22,
  gap: 3,
  faceGap: 6,
  margin: 16,
  background: [250, 250, 250],
  panel: true,
  lines: false,
  labels: true,
  palette: STANDARD,
}

// The faces in the cross: U above F, then L F R B in a row, D below F.
const BLOCKS: Array<[keyof CubeState, number, number]> = [
  ['u', 1, 0],
  ['l', 0, 1],
  ['f', 1, 1],
  ['r', 2, 1],
  ['b', 3, 1],
  ['d', 1, 2],
]

function renderNet(cube: CubeState, style: NetStyle) {
  const n = Math.sqrt(cube.u.length)
  const pitch = style.cell + style.gap
  const block = n * pitch + (style.lines ? style.gap : 0)
  const titles = style.labels ? 14 : 0
  const width = style.margin * 2 + 4 * block + 3 * style.faceGap
  const height = style.margin * 2 + 3 * (block + titles) + 2 * style.faceGap
  const data = new Uint8ClampedArray(width * height * 4)
  const fill = (x0: number, y0: number, w: number, h: number, c: RGB) => {
    for (let y = y0; y < y0 + h; y++)
      for (let x = x0; x < x0 + w; x++) {
        const i = (y * width + x) * 4
        data[i] = c[0]
        data[i + 1] = c[1]
        data[i + 2] = c[2]
        data[i + 3] = 255
      }
  }
  fill(0, 0, width, height, style.background)
  for (const [face, bc, br] of BLOCKS) {
    const x0 = style.margin + bc * (block + style.faceGap)
    const y0 = style.margin + br * (block + titles + style.faceGap) + titles
    if (style.panel || style.lines) fill(x0, y0, block, block, [20, 20, 24])
    if (style.labels) fill(x0 + 2, y0 - 11, 36, 8, [235, 235, 235])
    const pad = style.lines ? style.gap : 0
    for (let r = 0; r < n; r++)
      for (let c = 0; c < n; c++) {
        const base = style.palette[cube[face][r * n + c]]
        const j = style.jitter ?? 0
        const off = (k: number) =>
          j
            ? (((r * 31 + c * 17 + bc * 7 + br * 3 + k * 5) * 13) %
                (2 * j + 1)) -
              j
            : 0
        fill(
          x0 + pad + c * pitch + (style.lines ? 0 : Math.floor(style.gap / 2)),
          y0 + pad + r * pitch + (style.lines ? 0 : Math.floor(style.gap / 2)),
          style.cell,
          style.cell,
          [base[0] + off(0), base[1] + off(1), base[2] + off(2)],
        )
      }
  }
  // Specks along the top margin, clear of the cross.
  for (let k = 0; k < (style.specks ?? 0); k++)
    fill(2 + (k % 40) * 6, 2 + Math.floor(k / 40) * 6, 4, 4, [230, 230, 230])
  return { data, width, height }
}

function cubeFromRead(read: ReturnType<typeof readNetImage>): CubeState {
  if (read.TAG !== 'read') throw new Error(read.message)
  const parsed = parseCubeInput(read.facelets, 'wrg')
  expect(parsed.ok).toBe(true)
  if (!parsed.ok) throw new Error(parsed.message)
  return parsed.cube
}

describe('reading a net image', () => {
  const styles: Array<[string, NetStyle]> = [
    ['dark with gaps and titles', DARK_GAPPED],
    ['light with black lines', LIGHT_LINES],
    ['dark and tight', DARK_TIGHT],
    ['light panels with titles', LIGHT_PANELS],
  ]
  for (const [name, style] of styles)
    for (const size of SIZES)
      it(`reads a ${size}x${size} net, ${name}`, () => {
        const cube = randomCube(size, 11 + size)
        const { data, width, height } = renderNet(cube, style)
        const got = cubeFromRead(readNetImage(data, width, height))
        expect(got).toEqual(cube)
      })

  it('reads an odd cube by its centers, whatever the color scheme', () => {
    const cube = randomCube(5, 3)
    const scheme: Record<string, RGB> = {
      W: STANDARD.B,
      R: STANDARD.Y,
      G: STANDARD.W,
      Y: STANDARD.G,
      O: STANDARD.R,
      B: STANDARD.O,
    }
    const { data, width, height } = renderNet(cube, {
      ...DARK_TIGHT,
      palette: scheme,
    })
    expect(cubeFromRead(readNetImage(data, width, height))).toEqual(cube)
  })

  it('reads stickers whose colors each differ a little', () => {
    const cube = randomCube(5, 21)
    const { data, width, height } = renderNet(cube, {
      ...DARK_GAPPED,
      jitter: 9,
    })
    expect(cubeFromRead(readNetImage(data, width, height))).toEqual(cube)
  })

  it('ignores specks, which are too small to be stickers', () => {
    const cube = randomCube(2, 4)
    const { data, width, height } = renderNet(cube, {
      ...DARK_GAPPED,
      margin: 20,
      specks: 80,
    })
    expect(cubeFromRead(readNetImage(data, width, height))).toEqual(cube)
  })

  it('reads a screenshot with some softness in the colors', () => {
    const cube = randomCube(4, 8)
    const { data, width, height } = renderNet(cube, DARK_GAPPED)
    for (let i = 0; i < data.length; i += 4)
      for (let k = 0; k < 3; k++)
        data[i + k] = Math.max(
          0,
          Math.min(255, data[i + k] + ((i * 7 + k * 13) % 21) - 10),
        )
    expect(cubeFromRead(readNetImage(data, width, height))).toEqual(cube)
  })

  it('says so when the picture is no net', () => {
    const data = new Uint8ClampedArray(100 * 100 * 4).fill(128)
    const read = readNetImage(data, 100, 100)
    expect(read.TAG).toBe('unreadable')
  })

  it('says the stickers are too small when the picture has too few pixels', () => {
    // 15x15 at 5 pixels a sticker: 1350 shapes, each below the 6 x 6 minimum.
    const cube = randomCube(15, 2)
    const tiny: NetStyle = { ...DARK_TIGHT, cell: 5, gap: 2, margin: 4 }
    const { data, width, height } = renderNet(cube, tiny)
    const read = readNetImage(data, width, height)
    if (read.TAG !== 'unreadable')
      throw new Error('read a net of tiny stickers')
    expect(read.message).toMatch(/too small/i)
    expect(read.message).toMatch(/6 x 6 pixels/)
  })

  for (const block of [1, 2, 3])
    it(`does not call noise of ${block} pixel blocks too small`, () => {
      let seed = 7 + block
      const side = 240
      const data = new Uint8ClampedArray(side * side * 4)
      const bits: number[] = []
      for (let k = 0; k < (side / block) ** 2; k++) {
        seed = (seed * 1103515245 + 12345) % 2147483648
        bits.push((seed >> 16) & 1)
      }
      for (let y = 0; y < side; y++)
        for (let x = 0; x < side; x++) {
          const v =
            bits[
              Math.floor(y / block) * Math.floor(side / block) +
                Math.floor(x / block)
            ] * 255
          data.set([v, v, v, 255], (y * side + x) * 4)
        }
      const read = readNetImage(data, side, side)
      if (read.TAG !== 'unreadable') throw new Error('read noise')
      expect(read.message).toBe('No cube net found in the picture.')
    })

  // Bright rectangles of the given sizes on black, `across` per row.
  function rectangles(
    sizes: Array<[number, number]>,
    across: number,
    pitch: number,
    extra: Array<[number, number, number, number]> = [],
  ) {
    const width = across * pitch + 70
    const height = Math.ceil(sizes.length / across) * pitch + 70
    const data = new Uint8ClampedArray(width * height * 4)
    for (let i = 3; i < data.length; i += 4) data[i] = 255
    const fill = (x0: number, y0: number, w: number, h: number) => {
      for (let y = y0; y < y0 + h; y++)
        for (let x = x0; x < x0 + w; x++)
          data.set([200, 60, 60, 255], (y * width + x) * 4)
    }
    for (const [x, y, w, h] of extra) fill(x, y, w, h)
    sizes.forEach(([w, h], i) =>
      fill(8 + (i % across) * pitch, 60 + Math.floor(i / across) * pitch, w, h),
    )
    return { data, width, height }
  }

  it('says too small when the stickers differ a little in size', () => {
    const cycle: Array<[number, number]> = [
      [4, 4],
      [5, 4],
      [5, 5],
    ]
    const sizes = Array.from({ length: 54 }, (_, i) => cycle[i % 3])
    const { data, width, height } = rectangles(sizes, 9, 8)
    const read = readNetImage(data, width, height)
    if (read.TAG !== 'unreadable') throw new Error('read tiny stickers')
    expect(read.message).toMatch(/too small/i)
  })

  it('does not call scattered small shapes of unlike sizes too small', () => {
    const cycle: Array<[number, number]> = [
      [4, 4],
      [5, 5],
      [5, 6],
    ]
    const sizes = Array.from({ length: 24 }, (_, i) => cycle[i % 3])
    const { data, width, height } = rectangles(sizes, 6, 8)
    const read = readNetImage(data, width, height)
    if (read.TAG !== 'unreadable') throw new Error('read scattered shapes')
    expect(read.message).toBe('No cube net found in the picture.')
  })

  it('says too small when a few readable icons sit on a picture of tiny stickers', () => {
    const sizes: Array<[number, number]> = Array.from({ length: 1350 }, () => [
      5, 5,
    ])
    const icons: Array<[number, number, number, number]> = Array.from(
      { length: 20 },
      (_, i) => [2 + i * 12, 2, 8, 8],
    )
    const { data, width, height } = rectangles(sizes, 45, 7, icons)
    const read = readNetImage(data, width, height)
    if (read.TAG !== 'unreadable') throw new Error('read tiny stickers')
    expect(read.message).toMatch(/too small/i)
  })

  it('reads a net of full-size stickers among many specks', () => {
    const cube = randomCube(2, 12)
    const { data, width, height } = renderNet(cube, {
      ...DARK_GAPPED,
      margin: 40,
      specks: 200,
    })
    expect(cubeFromRead(readNetImage(data, width, height))).toEqual(cube)
  })

  it('reports a missing sticker, not small stickers, when specks are around', () => {
    const cube = randomCube(2, 3)
    const { data, width, height } = renderNet(cube, {
      ...DARK_GAPPED,
      margin: 40,
      specks: 24,
    })
    // Paint the front face's first sticker over with the background.
    for (let y = 136; y < 164; y++)
      for (let x = 108; x < 136; x++) {
        const i = (y * width + x) * 4
        data.set([13, 15, 25, 255], i)
      }
    const read = readNetImage(data, width, height)
    if (read.TAG !== 'unreadable') throw new Error('read a net with a gap')
    expect(read.message).toBe('No cube net found in the picture.')
  })

  it('does not look for a net among more than 4000 sticker-sized shapes', () => {
    const side = 70
    const data = new Uint8ClampedArray(side * 10 * side * 10 * 4)
    for (let y = 0; y < side * 10; y++)
      for (let x = 0; x < side * 10; x++) {
        const lit = x % 10 < 8 && y % 10 < 8
        data.set(
          lit ? [200, 60, 60, 255] : [0, 0, 0, 255],
          (y * side * 10 + x) * 4,
        )
      }
    const read = readNetImage(data, side * 10, side * 10)
    if (read.TAG !== 'unreadable') throw new Error('read a grid')
    expect(read.message).toBe('No cube net found in the picture.')
  })

  it('reads a 15x15 net at the smallest sticker size', () => {
    const cube = randomCube(15, 9)
    const small: NetStyle = { ...DARK_TIGHT, cell: 6, gap: 2, margin: 4 }
    const { data, width, height } = renderNet(cube, small)
    expect(cubeFromRead(readNetImage(data, width, height))).toEqual(cube)
  })

  it('refuses a 16x16 net and names the supported sizes', () => {
    const cube = randomCube(16, 5)
    const { data, width, height } = renderNet(cube, DARK_TIGHT)
    const read = readNetImage(data, width, height)
    if (read.TAG !== 'unreadable') throw new Error('read a 16x16 net')
    expect(read.message).toContain('2x2 to 15x15')
  })

  it('says so when two face centers share a color', () => {
    const cube = randomCube(3, 5)
    cube.d[4] = 'W'
    const { data, width, height } = renderNet(cube, DARK_TIGHT)
    const read = readNetImage(data, width, height)
    expect(read.TAG).toBe('unreadable')
  })

  it('says so when a color is missing', () => {
    const cube = randomCube(3, 5)
    const flat: CubeState = {
      ...cube,
      u: cube.u.map((c) => (c === 'Y' ? 'W' : c)),
      r: cube.r.map((c) => (c === 'Y' ? 'W' : c)),
      f: cube.f.map((c) => (c === 'Y' ? 'W' : c)),
      d: cube.d.map((c) => (c === 'Y' ? 'W' : c)),
      l: cube.l.map((c) => (c === 'Y' ? 'W' : c)),
      b: cube.b.map((c) => (c === 'Y' ? 'W' : c)),
    }
    const { data, width, height } = renderNet(flat, DARK_TIGHT)
    expect(readNetImage(data, width, height).TAG).toBe('unreadable')
  })

  it('says so when stickers are missing', () => {
    const cube = randomCube(3, 1)
    const { data, width, height } = renderNet(cube, DARK_TIGHT)
    // Paint one sticker over with the background.
    for (let y = 6; y < 32; y++)
      for (let x = 98; x < 124; x++) {
        const i = (y * width + x) * 4
        data[i] = 17
        data[i + 1] = 22
        data[i + 2] = 40
      }
    const read = readNetImage(data, width, height)
    expect(read.TAG).toBe('unreadable')
  })
})

describe('splitting a net into six face pictures', () => {
  const ORDER = ['u', 'r', 'f', 'd', 'l', 'b'] as const
  const crop = (
    data: Uint8ClampedArray,
    width: number,
    box: { x: number; y: number; width: number; height: number },
  ) => {
    const out = new Uint8ClampedArray(box.width * box.height * 4)
    for (let y = 0; y < box.height; y++)
      for (let x = 0; x < box.width; x++) {
        const from = ((box.y + y) * width + box.x + x) * 4
        out.set(data.subarray(from, from + 4), (y * box.width + x) * 4)
      }
    return out
  }

  const styles: Array<[string, NetStyle]> = [
    ['dark with gaps and titles', DARK_GAPPED],
    ['light with black lines', LIGHT_LINES],
    ['dark and tight', DARK_TIGHT],
    ['light panels with titles', LIGHT_PANELS],
  ]
  // The color pipeline's own limits above 7x7 belong to face detection.
  for (const [name, style] of styles)
    for (const size of SIZES)
      it(`gives six face rectangles that hold their stickers, ${size}x${size}, ${name}`, () => {
        const cube = randomCube(size, 40 + size)
        const { data, width, height } = renderNet(cube, style)
        const read = readNetImage(data, width, height)
        if (read.TAG !== 'read') throw new Error(read.message)
        expect(read.faces).toHaveLength(6)
        const pitch = style.cell + style.gap
        for (const box of read.faces) {
          expect(box.x).toBeGreaterThanOrEqual(0)
          expect(box.y).toBeGreaterThanOrEqual(0)
          expect(box.x + box.width).toBeLessThanOrEqual(width)
          expect(box.y + box.height).toBeLessThanOrEqual(height)
          expect(box.width).toBeGreaterThanOrEqual(size * pitch - style.gap)
          expect(box.height).toBeGreaterThanOrEqual(size * pitch - style.gap)
        }
        const [, right, front, , left, back] = read.faces
        expect(left.x + left.width).toBeLessThanOrEqual(front.x)
        expect(front.x + front.width).toBeLessThanOrEqual(right.x)
        expect(right.x + right.width).toBeLessThanOrEqual(back.x)
      })

  for (const [name, style] of styles)
    for (const size of [3, 4, 5, 6, 7])
      it(`gives six faces the pipeline reads, ${size}x${size}, ${name}`, () => {
        const cube = randomCube(size, 30 + size)
        const { data, width, height } = renderNet(cube, style)
        const read = readNetImage(data, width, height)
        if (read.TAG !== 'read') throw new Error(read.message)
        expect(read.faces).toHaveLength(6)
        const measured: Record<
          string,
          ReturnType<typeof extractColorsFromImageData>
        > = {}
        ORDER.forEach((face, i) => {
          const box = read.faces[i]
          expect(box.x).toBeGreaterThanOrEqual(0)
          expect(box.y).toBeGreaterThanOrEqual(0)
          expect(box.x + box.width).toBeLessThanOrEqual(width)
          expect(box.y + box.height).toBeLessThanOrEqual(height)
          measured[face] = extractColorsFromImageData(
            crop(data, width, box),
            box.width,
            box.height,
            size,
            NEUTRAL_GAINS,
            DEFAULT_SAMPLING,
          )
        })
        const classified = classifyAcrossFaces(measured)
        ORDER.forEach((face) => {
          const grid = cube[face]
          const got = classified.faces[face].colors.flat().join('')
          expect(got).toBe(grid.join(''))
        })
      })

  it('keeps the face pictures inside a picture that ends at the stickers', () => {
    const cube = randomCube(3, 6)
    const { data, width, height } = renderNet(cube, {
      ...DARK_GAPPED,
      margin: 0,
      labels: false,
      panel: false,
    })
    const read = readNetImage(data, width, height)
    if (read.TAG !== 'read') throw new Error(read.message)
    for (const box of read.faces) {
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.y).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(width)
      expect(box.y + box.height).toBeLessThanOrEqual(height)
    }
  })

  it('keeps the face pictures apart, even where the faces touch', () => {
    const cube = randomCube(3, 2)
    const { data, width, height } = renderNet(cube, DARK_TIGHT)
    const read = readNetImage(data, width, height)
    if (read.TAG !== 'read') throw new Error(read.message)
    const [, right, front, , left, back] = read.faces
    expect(left.x + left.width).toBeLessThanOrEqual(front.x)
    expect(front.x + front.width).toBeLessThanOrEqual(right.x)
    expect(right.x + right.width).toBeLessThanOrEqual(back.x)
  })
})

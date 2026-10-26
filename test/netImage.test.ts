import { describe, expect, it } from 'vitest'
import { parseCubeInput } from '../src/client/capture/captureFlow'
import type { CubeState } from '../src/cube/cubeAssembly'
import { randomCube } from '../src/cube/randomState'
import { readNetImage } from '../src/core/vision/NetImage.gen'

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
    for (const size of [2, 3, 4, 5, 7])
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

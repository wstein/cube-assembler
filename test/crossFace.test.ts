import { describe, expect, it } from 'vitest'
import { classifyAcrossFaces } from '../src/client/capture/captureRecalibration'
import {
  learnStickerColors,
  mixedUpClusters,
} from '../src/client/vision/stickerLearning'
import {
  type ColorDetectionResult,
  type RGB,
} from '../src/client/vision/stickerColorGeometry'

const COLORS: Record<string, RGB> = {
  W: { r: 238, g: 238, b: 232 },
  Y: { r: 238, g: 208, b: 32 },
  R: { r: 198, g: 40, b: 52 },
  O: { r: 232, g: 112, b: 30 },
  G: { r: 32, g: 150, b: 82 },
  B: { r: 40, g: 80, b: 200 },
}

// Six solid 3x3 faces with small per-sticker variation; face U is white
// but its center reads as its blue logo, as the plain measurement does.
function faces(): Record<string, ColorDetectionResult> {
  const out: Record<string, ColorDetectionResult> = {}
  const slots: Record<string, string> = {
    U: 'W',
    R: 'R',
    F: 'G',
    D: 'Y',
    L: 'O',
    B: 'B',
  }
  let k = 0
  for (const [face, color] of Object.entries(slots)) {
    const cellColors = Array.from({ length: 3 }, () =>
      Array.from({ length: 3 }, () => {
        const jitter = ((k++ * 37) % 11) - 5
        const base = COLORS[color]
        return { r: base.r + jitter, g: base.g - jitter, b: base.b + jitter }
      }),
    )
    out[face] = {
      colors: cellColors.map((row) => row.map(() => color)),
      cellConfidences: cellColors.map((row) => row.map(() => 0.9)),
      cellColors,
      confidence: 0.9,
    }
  }
  out.U.cellColors[1][1] = { r: 35, g: 75, b: 190 }
  out.U.colors[1][1] = 'B'
  out.U.centerColor = { r: 236, g: 236, b: 230 }
  return out
}

describe('classifyAcrossFaces', () => {
  it('keeps a logo-misread center from pushing another sticker out', () => {
    const measured = faces()
    const truth = (face: string) => measured[face].colors[0][0]

    // The plain balanced assignment: ten blue readings for nine blue slots.
    const samples = Object.entries(measured).flatMap(([, det]) =>
      det.cellColors.flat().map((rgb) => ({ rgb, colorGuess: 'W' })),
    )
    const plain = learnStickerColors(samples)!.labelsBySampleIndex
    const faceOrder = Object.keys(measured)
    const plainWrong = plain.filter((label, i) => {
      const face = faceOrder[Math.floor(i / 9)]
      return label !== truth(face) && !(face === 'U' && i % 9 === 4)
    }).length
    expect(plainWrong).toBeGreaterThan(0)

    const classified = classifyAcrossFaces(measured)
    expect(classified.faces.U.colors[1][1]).toBe('W')
    for (const face of faceOrder) {
      for (const row of classified.faces[face].colors)
        for (const color of row) expect(color, face).toBe(truth(face))
    }
  })

  it('keeps the logo-safe center reading through a saved-profile second pass', () => {
    const first = classifyAcrossFaces(faces())
    const second = classifyAcrossFaces(first.faces, first.learned!.colors)
    expect(second.faces.U.centerColor).toEqual(faces().U.centerColor)
    expect(second.faces.U.colors[1][1]).toBe('W')
  })
})

// Readings from a real capture (2026-09-26T23-15-07) lit from above: a
// glare band across the middle rows turns greens turquoise and yellows
// pale. Nine per color held the pale yellows in Y and pushed the plainly
// yellow top row of face B into G, and two greens on U into Y.
const GLARE_READINGS: Record<string, number[][]> = {
  U: [
    [71, 143, 57],
    [76, 141, 55],
    [81, 139, 58],
    [89, 198, 179],
    [96, 202, 180],
    [88, 193, 179],
    [68, 187, 126],
    [63, 177, 91],
    [61, 166, 78],
  ],
  R: [
    [112, 6, 23],
    [122, 15, 32],
    [120, 13, 30],
    [115, 10, 39],
    [114, 10, 41],
    [116, 10, 36],
    [114, 9, 39],
    [116, 6, 37],
    [115, 6, 36],
  ],
  F: [
    [18, 44, 82],
    [22, 48, 84],
    [21, 47, 82],
    [25, 76, 150],
    [31, 74, 136],
    [34, 86, 164],
    [27, 67, 124],
    [21, 62, 120],
    [26, 61, 112],
  ],
  D: [
    [168, 62, 20],
    [171, 63, 22],
    [172, 65, 19],
    [179, 64, 35],
    [178, 66, 34],
    [183, 70, 30],
    [182, 74, 89],
    [182, 69, 70],
    [178, 63, 45],
  ],
  L: [
    [159, 168, 238],
    [159, 167, 232],
    [164, 168, 230],
    [162, 188, 255],
    [148, 168, 254],
    [165, 185, 255],
    [155, 180, 255],
    [156, 176, 255],
    [156, 172, 254],
  ],
  B: [
    [173, 166, 86],
    [179, 166, 82],
    [178, 169, 90],
    [175, 195, 173],
    [174, 194, 160],
    [181, 194, 160],
    [169, 193, 156],
    [174, 188, 111],
    [174, 186, 108],
  ],
}
const GLARE_TRUTH: Record<string, string> = {
  U: 'G',
  R: 'R',
  F: 'B',
  D: 'O',
  L: 'W',
  B: 'Y',
}
const GOCUBE: Record<string, RGB> = {
  W: { r: 161, g: 180, b: 223 },
  Y: { r: 174, g: 177, b: 88 },
  O: { r: 170, g: 68, b: 40 },
  R: { r: 127, g: 20, b: 42 },
  G: { r: 76, g: 145, b: 82 },
  B: { r: 21, g: 71, b: 142 },
}

function glareFaces(): Record<string, ColorDetectionResult> {
  const out: Record<string, ColorDetectionResult> = {}
  for (const [face, readings] of Object.entries(GLARE_READINGS)) {
    const cellColors = [0, 1, 2].map((r) =>
      [0, 1, 2].map((c) => {
        const [red, g, b] = readings[r * 3 + c]
        return { r: red, g, b }
      }),
    )
    out[face] = {
      colors: cellColors.map((row) => row.map(() => GLARE_TRUTH[face])),
      cellConfidences: cellColors.map((row) => row.map(() => 0.9)),
      cellColors,
      confidence: 0.9,
    }
  }
  return out
}

describe('classifyAcrossFaces under glare', () => {
  it('keeps plainly colored stickers when glare pales others of the same color', () => {
    const classified = classifyAcrossFaces(glareFaces(), GOCUBE)
    const wrong = Object.entries(classified.faces).flatMap(([face, det]) =>
      det.colors
        .flat()
        .flatMap((color, i) =>
          color === GLARE_TRUTH[face] ? [] : [`${face}${i}:${color}`],
        ),
    )
    expect(wrong).toEqual([])
  })

  it('reports the stickers glare washed out', () => {
    const glare = classifyAcrossFaces(glareFaces(), GOCUBE).glare.map(
      ({ face, row, col }) => `${face}${row}${col}`,
    )
    expect(glare.sort()).toEqual([
      'B10',
      'B11',
      'B12',
      'B20',
      'U10',
      'U11',
      'U12',
    ])
  })

  it('reports no glare on evenly lit stickers', () => {
    expect(classifyAcrossFaces(faces(), COLORS).glare).toEqual([])
    expect(classifyAcrossFaces(faces()).glare).toEqual([])
  })
})

describe('classifyAcrossFaces with a reference palette', () => {
  it("doesn't pin a 4x4 center's logo to the logo's color", () => {
    const slots: Record<string, string> = {
      U: 'W',
      R: 'R',
      F: 'G',
      D: 'Y',
      L: 'O',
      B: 'B',
    }
    const measured: Record<string, ColorDetectionResult> = {}
    let k = 0
    for (const [face, color] of Object.entries(slots)) {
      const cellColors = Array.from({ length: 4 }, () =>
        Array.from({ length: 4 }, () => {
          const jitter = ((k++ * 37) % 11) - 5
          const base = COLORS[color]
          return { r: base.r + jitter, g: base.g - jitter, b: base.b + jitter }
        }),
      )
      measured[face] = {
        colors: cellColors.map((row) => row.map(() => color)),
        cellConfidences: cellColors.map((row) => row.map(() => 0.9)),
        cellColors,
        confidence: 0.9,
      }
    }
    // A blue logo on one of the white centers, lighter than the blue
    // stickers so the balance hands it back to white.
    measured.U.cellColors[1][1] = { r: 60, g: 110, b: 230 }
    const classified = classifyAcrossFaces(measured, COLORS)
    for (const [face, color] of Object.entries(slots)) {
      for (const row of classified.faces[face].colors)
        for (const got of row) expect(got, face).toBe(color)
    }
  })
})

// Readings from a real capture (2026-09-26T23-55-08) whose blues range
// from shadowed edges (L 0.31) to a bright center (L 0.59). The clustering
// settled on two purple clusters - dark reds with dark blues, light reds
// with light blues - and every red and orange came out swapped.
const RED_BLUE_READINGS: Record<string, number[][]> = {
  U: [
    [17, 47, 94],
    [77, 120, 56],
    [26, 53, 99],
    [168, 58, 40],
    [83, 151, 119],
    [180, 63, 48],
    [30, 89, 173],
    [64, 142, 75],
    [3, 60, 130],
  ],
  R: [
    [173, 60, 17],
    [170, 62, 19],
    [173, 64, 26],
    [85, 178, 137],
    [186, 189, 94],
    [85, 174, 135],
    [170, 56, 46],
    [171, 51, 35],
    [173, 57, 41],
  ],
  F: [
    [92, 146, 60],
    [9, 47, 90],
    [94, 133, 49],
    [144, 52, 88],
    [72, 125, 200],
    [133, 45, 77],
    [85, 161, 85],
    [2, 54, 110],
    [79, 145, 55],
  ],
  D: [
    [117, 11, 22],
    [121, 20, 23],
    [133, 32, 31],
    [38, 93, 174],
    [168, 179, 238],
    [38, 89, 169],
    [123, 14, 40],
    [122, 7, 28],
    [121, 8, 31],
  ],
  L: [
    [174, 178, 214],
    [171, 174, 206],
    [174, 173, 201],
    [192, 194, 116],
    [113, 9, 36],
    [187, 181, 95],
    [170, 197, 255],
    [171, 193, 247],
    [164, 183, 235],
  ],
  B: [
    [173, 160, 62],
    [172, 158, 60],
    [172, 155, 57],
    [163, 193, 247],
    [161, 55, 29],
    [162, 189, 242],
    [179, 190, 104],
    [185, 193, 92],
    [179, 184, 89],
  ],
}
const RED_BLUE_TRUTH: Record<string, string> = {
  U: 'BGBOGOBGB',
  R: 'OOOGYGOOO',
  F: 'GBGRBRGBG',
  D: 'RRRBWBRRR',
  L: 'WWWYRYWWW',
  B: 'YYYWOWYYY',
}

function readingFaces(
  readings: Record<string, number[][]>,
): Record<string, ColorDetectionResult> {
  const out: Record<string, ColorDetectionResult> = {}
  for (const [face, cells] of Object.entries(readings)) {
    const cellColors = [0, 1, 2].map((r) =>
      [0, 1, 2].map((c) => {
        const [red, g, b] = cells[r * 3 + c]
        return { r: red, g, b }
      }),
    )
    out[face] = {
      colors: cellColors.map((row) => row.map(() => 'W')),
      cellConfidences: cellColors.map((row) => row.map(() => 0.9)),
      cellColors,
      confidence: 0.9,
    }
  }
  return out
}

describe('classifyAcrossFaces with a wide lightness range', () => {
  it('keeps reds and blues apart when the blues range from dark to bright', () => {
    const classified = classifyAcrossFaces(readingFaces(RED_BLUE_READINGS))
    const wrong = Object.entries(classified.faces).flatMap(([face, det]) =>
      det.colors
        .flat()
        .flatMap((color, i) =>
          color === RED_BLUE_TRUTH[face][i] ? [] : [`${face}${i}:${color}`],
        ),
    )
    expect(wrong).toEqual([])
  })
})

describe('mixedUpClusters', () => {
  // The clustering's red/blue mix from capture 2026-09-26T23-55-08: a
  // purple center whose stickers all ended up red.
  const reds: RGB[] = [
    [117, 11, 22],
    [121, 20, 23],
    [133, 32, 31],
    [123, 14, 40],
    [122, 7, 28],
    [121, 8, 31],
    [113, 9, 36],
    [144, 52, 88],
    [133, 45, 77],
  ].map(([r, g, b]) => ({ r, g, b }))

  it('flags a cluster center far from the stickers assigned to it', () => {
    expect(
      mixedUpClusters(
        reds,
        [{ r: 106, g: 72, b: 110 }],
        reds.map(() => 0),
      ),
    ).toEqual([0])
  })

  it('leaves a cluster centered on its stickers alone', () => {
    expect(
      mixedUpClusters(
        reds,
        [{ r: 125, g: 22, b: 38 }],
        reds.map(() => 0),
      ),
    ).toEqual([])
  })

  it('names no mixed-up color on a well-separated capture', () => {
    expect(
      classifyAcrossFaces(readingFaces(RED_BLUE_READINGS)).learned!
        .mixedUpColors,
    ).toEqual([])
  })
})

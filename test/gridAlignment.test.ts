import { describe, expect, it } from 'vitest'
import {
  acceptFaceCorners,
  alignFace,
  cornersConsistent,
  estimateFaceCorners,
  estimateOuterCellRatio,
  estimateTilt,
  findGridAlignment,
} from '../src/client/vision/gridAlignment'
import { placed, scene } from './syntheticFace'

describe('findGridAlignment', () => {
  for (const gridSize of [6, 7]) {
    it(`asks to re-center a ${gridSize}x${gridSize} whose seam grid slips outside its outline`, () => {
      const guideSize = 300
      const width = Math.round(guideSize * 1.67)
      const guide = {
        x: (width - guideSize) / 2,
        y: (width - guideSize) / 2,
        size: guideSize,
      }
      const face = placed(guide, 0.25, 0, 0.9)
      const { data, height } = scene(
        gridSize,
        face,
        guideSize,
        { outer: 1.5 },
        1.67,
      )
      const found = alignFace(data, width, height, guide, gridSize)
      expect(found.seams).toBe(false)
      expect(found.needsRecentering).toBe(true)

      const near = placed(guide, 0.2, 0, 0.9)
      const readable = scene(gridSize, near, guideSize, { outer: 1.5 }, 1.67)
      const inReach = alignFace(readable.data, width, height, guide, gridSize)
      expect(inReach.seams).toBe(true)
      expect(inReach.needsRecentering).toBeUndefined()
    })
  }

  it('keeps a 7x7 face seen at an angle', () => {
    const guideSize = 300
    const width = Math.round(guideSize * 1.67)
    const guide = {
      x: (width - guideSize) / 2,
      y: (width - guideSize) / 2,
      size: guideSize,
    }
    const face = placed(guide, 0, 0, 0.95)
    const corners: [number, number][] = [
      [face.x + 14, face.y + 16],
      [face.x + face.size - 4, face.y - 4],
      [face.x + face.size + 2, face.y + face.size + 6],
      [face.x + 10, face.y + face.size - 12],
    ]
    const { data, height } = scene(
      7,
      face,
      guideSize,
      { corners, outer: 1.5 },
      1.67,
    )
    const found = alignFace(data, width, height, guide, 7)
    expect(found.seams).toBe(true)
    expect(found.needsRecentering).toBeUndefined()
  })

  for (const [scale, dx, dy] of [
    [1, 0.1, -0.07],
    [0.75, -0.12, 0.08],
    [1.22, 0.05, 0.04],
  ]) {
    it(`locates a 7x7 face at scale ${scale} beyond the guide search`, () => {
      const guideSize = 300
      const width = Math.round(guideSize * 1.4)
      const guide = {
        x: (width - guideSize) / 2,
        y: (width - guideSize) / 2,
        size: guideSize,
      }
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
      const guide = {
        x: (width - guideSize) / 2,
        y: (width - guideSize) / 2,
        size: guideSize,
      }
      // Offsets stay inside the search range: under half a cell.
      const offset = Math.min(0.08, (0.8 * 0.45) / gridSize)
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
    const guide = {
      x: (width - guideSize) / 2,
      y: (width - guideSize) / 2,
      size: guideSize,
    }
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
      const guide = {
        x: (width - guideSize) / 2,
        y: (width - guideSize) / 2,
        size: guideSize,
      }
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
    const guide = {
      x: (width - guideSize) / 2,
      y: (width - guideSize) / 2,
      size: guideSize,
    }
    const face = placed(guide, -0.04, 0.05, 0.95)
    const { data, height } = scene(7, face, guideSize, {
      seam: [215, 215, 212],
      gap: 0.05,
      outer: 1.5,
      sticker: () => [240, 240, 236],
    })
    const found = findGridAlignment(data, width, height, guide, 7)
    expect(found.aligned).toBe(true)
    expect(Math.abs(found.x - face.x)).toBeLessThan(guideSize * 0.02)
    expect(Math.abs(found.y - face.y)).toBeLessThan(guideSize * 0.02)
  })

  it('reads the outer-cell ratio from an aligned crop', () => {
    const size = 350
    const crop = (gridSize: number, outer: number) => {
      const { data, width } = scene(
        gridSize,
        { x: 0, y: 0, size },
        (size / 1.4) * 1.4,
        { outer },
      )
      const out = new Uint8ClampedArray(size * size * 4)
      for (let y = 0; y < size; y++)
        out.set(
          data.subarray(y * width * 4, (y * width + size) * 4),
          y * size * 4,
        )
      return out
    }
    expect(estimateOuterCellRatio(crop(7, 1.5), size, size, 7)).toBeCloseTo(
      1.5,
      1,
    )
    expect(estimateOuterCellRatio(crop(4, 1), size, size, 4)).toBe(1)
    expect(estimateOuterCellRatio(crop(3, 1), size, size, 3)).toBe(1)
  })

  it('measures how far a face is tilted', () => {
    const guideSize = 300
    const width = Math.round(guideSize * 1.4)
    const guide = {
      x: (width - guideSize) / 2,
      y: (width - guideSize) / 2,
      size: guideSize,
    }
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

  for (const [gridSize, tilt] of [
    [3, 12],
    [5, -18],
    [7, 25],
  ]) {
    it(`finds a ${gridSize}x${gridSize} face tilted ${tilt} degrees and held off-center`, () => {
      const guideSize = 360
      const width = Math.round(guideSize * 1.4)
      const guide = {
        x: (width - guideSize) / 2,
        y: (width - guideSize) / 2,
        size: guideSize,
      }
      const offset = Math.min(0.06, (0.8 * 0.45) / gridSize)
      const face = placed(guide, offset, -offset * 0.6, 0.85)
      const { data, height } = scene(gridSize, face, guideSize, {
        tilt,
        outer: gridSize >= 5 ? 1.4 : 1,
      })
      const angle = estimateTilt(data, width, height, guide)
      const found = findGridAlignment(
        data,
        width,
        height,
        guide,
        gridSize,
        angle,
      )
      expect((found.angle * 180) / Math.PI).toBeCloseTo(tilt, 0)
      expect(
        Math.hypot(
          found.center[0] - (face.x + face.size / 2),
          found.center[1] - (face.y + face.size / 2),
        ),
      ).toBeLessThan(guideSize * 0.02)
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
    const guide = {
      x: (width - guideSize) / 2,
      y: (width - guideSize) / 2,
      size: guideSize,
    }
    const face = placed(guide, -0.05, 0.02, 0.95)
    const rows = [
      [
        [40, 80, 200],
        [200, 40, 50],
        [40, 170, 60],
      ],
      [
        [230, 220, 40],
        [220, 215, 50],
        [235, 235, 230],
      ],
      [
        [40, 80, 200],
        [200, 40, 50],
        [40, 170, 60],
      ],
    ]
    const { data, height } = scene(3, face, guideSize, {
      seam: [100, 90, 80],
      gap: 0.06,
      sticker: (row, col) => rows[row][col],
    })
    const found = findGridAlignment(data, width, height, guide, 3)
    expect(found.seams).toBe(true)
    expect(Math.abs(found.x - face.x)).toBeLessThan(guideSize * 0.02)
    expect(Math.abs(found.y - face.y)).toBeLessThan(guideSize * 0.02)
  })

  it('keeps a measured tilt only when a grid shows under it', () => {
    const guideSize = 300
    const width = Math.round(guideSize * 1.4)
    const guide = {
      x: (width - guideSize) / 2,
      y: (width - guideSize) / 2,
      size: guideSize,
    }
    // Diagonal stripes: edges agree on a direction, but there is no grid.
    const stripes = new Uint8ClampedArray(width * width * 4)
    const turn = (20 * Math.PI) / 180
    for (let y = 0; y < width; y++) {
      for (let x = 0; x < width; x++) {
        const band =
          Math.floor((x * Math.cos(turn) + y * Math.sin(turn)) / 18) % 2
        stripes.set(
          band ? [200, 60, 50, 255] : [240, 230, 220, 255],
          (y * width + x) * 4,
        )
      }
    }
    expect(estimateTilt(stripes, width, width, guide)).not.toBe(0)
    const striped = alignFace(stripes, width, width, guide, 3)
    expect(striped.angle).toBe(0)
    expect(striped.aligned).toBe(false)

    const face = placed(guide, 0.03, 0.02, 0.85)
    const { data, height } = scene(4, face, guideSize, { tilt: 14 })
    expect(
      (alignFace(data, width, height, guide, 4).angle * 180) / Math.PI,
    ).toBeCloseTo(14, 0)
  })

  it('keeps the guide for a face without any grid lines', () => {
    const guideSize = 300
    const width = Math.round(guideSize * 1.4)
    const guide = {
      x: (width - guideSize) / 2,
      y: (width - guideSize) / 2,
      size: guideSize,
    }
    const { data, height } = scene(3, placed(guide, 0.06, 0.06), guideSize, {
      seam: null,
    })
    const found = findGridAlignment(data, width, height, guide, 3)
    expect(found.aligned).toBe(false)
    expect(found).toMatchObject({ x: guide.x, y: guide.y, size: guide.size })
  })

  it("finds no grid on a 2x2 whose outline shows but whose inner seam doesn't", () => {
    // A real stickerless 2x2 (capture 2026-09-27T00-29-42): the seam
    // between its orange and pink tiles read lighter than the tiles, so the
    // seams could not shrink an outline that took in the fingers, and the
    // outline was captured as the face.
    const guideSize = 300
    const width = Math.round(guideSize * 1.4)
    const guide = {
      x: (width - guideSize) / 2,
      y: (width - guideSize) / 2,
      size: guideSize,
    }
    const tiles = [
      [232, 110, 70],
      [200, 60, 110],
    ]
    const { data, height } = scene(
      2,
      placed(guide, 0.03, 0.04, 0.9),
      guideSize,
      { seam: null, sticker: (row, col) => tiles[(row + col) % 2] },
    )
    expect(alignFace(data, width, height, guide, 2).seams).toBe(false)
  })

  it('keeps the guide on a plain background', () => {
    const width = 420
    const guide = { x: 60, y: 60, size: 300 }
    const data = new Uint8ClampedArray(width * width * 4).fill(128)
    expect(findGridAlignment(data, width, width, guide, 3).aligned).toBe(false)
  })
})

describe('tilt on cubes with rounded stickers', () => {
  const G = 300,
    W = Math.round(G * 1.4),
    guide = { x: (W - G) / 2, y: (W - G) / 2, size: G }

  it('turns a tilted 5x5 upright despite rounded sticker corners and a logo', () => {
    // Round corners and the logo spread the edge directions: the tilt was
    // measured (about 3.3 degrees) but dropped as too uncertain.
    const { data } = scene(5, placed(guide, 0, 0, 0.95), G, {
      tilt: 4,
      radius: 0.4,
      logo: true,
    })
    expect((estimateTilt(data, W, W, guide) * 180) / Math.PI).toBeGreaterThan(
      2.5,
    )
    const found = alignFace(data, W, W, guide, 5)
    expect(found.seams).toBe(true)
    expect((found.angle * 180) / Math.PI).toBeGreaterThan(2.5)
  })

  it('keeps an upright face upright when its round stickers suggest a false tilt', () => {
    const { data } = scene(5, placed(guide, 0, 0, 0.95), G, {
      tilt: 0,
      radius: 0.5,
      gap: 0.15,
      logo: true,
    })
    expect(alignFace(data, W, W, guide, 5).angle).toBe(0)
  })
})

describe('estimateFaceCorners', () => {
  const G = 300,
    W = Math.round(G * 1.67),
    guide = { x: (W - G) / 2, y: (W - G) / 2, size: G }
  const s = G * 0.95,
    x0 = guide.x + (G - s) / 2,
    y0 = guide.y + (G - s) / 2

  it('finds the four corners of a face seen at an angle', () => {
    // Turned toward the camera on the right: the right side is taller.
    const truth: [number, number][] = [
      [x0 + 14, y0 + 16],
      [x0 + s - 4, y0 - 4],
      [x0 + s + 2, y0 + s + 6],
      [x0 + 10, y0 + s - 12],
    ]
    const { data } = scene(
      5,
      { x: x0, y: y0, size: s },
      G,
      { corners: truth },
      1.67,
    )
    const found = alignFace(data, W, W, guide, 5)
    const corners = estimateFaceCorners(data, W, W, found, 5)
    expect(corners).not.toBeNull()
    corners!.forEach((corner, i) =>
      expect(
        Math.hypot(corner[0] - truth[i][0], corner[1] - truth[i][1]),
      ).toBeLessThan(s * 0.02),
    )
  })

  it('finds them on a tilted face seen at an angle', () => {
    const c = [x0 + s / 2, y0 + s / 2],
      t = (5 * Math.PI) / 180
    const turn = ([x, y]: [number, number]): [number, number] => [
      c[0] + Math.cos(t) * (x - c[0]) - Math.sin(t) * (y - c[1]),
      c[1] + Math.sin(t) * (x - c[0]) + Math.cos(t) * (y - c[1]),
    ]
    const truth = (
      [
        [x0 + 12, y0 + 14],
        [x0 + s - 4, y0 - 2],
        [x0 + s + 2, y0 + s + 4],
        [x0 + 8, y0 + s - 10],
      ] as [number, number][]
    ).map(turn)
    const { data } = scene(
      5,
      { x: x0, y: y0, size: s },
      G,
      { corners: truth },
      1.67,
    )
    const corners = estimateFaceCorners(
      data,
      W,
      W,
      alignFace(data, W, W, guide, 5),
      5,
    )
    expect(corners).not.toBeNull()
    corners!.forEach((corner, i) =>
      expect(
        Math.hypot(corner[0] - truth[i][0], corner[1] - truth[i][1]),
      ).toBeLessThan(s * 0.025),
    )
  })

  it('needs no correction for a face seen straight on', () => {
    const { data } = scene(5, { x: x0, y: y0, size: s }, G, {}, 1.67)
    expect(
      estimateFaceCorners(data, W, W, alignFace(data, W, W, guide, 5), 5),
    ).toBeNull()
  })
})

describe('checking face corners before using them', () => {
  const G = 300,
    W = Math.round(G * 1.67),
    guide = { x: (W - G) / 2, y: (W - G) / 2, size: G }
  const s = G * 0.95,
    x0 = guide.x + (G - s) / 2,
    y0 = guide.y + (G - s) / 2
  // Strongly turned toward the camera on the right: top and bottom converge.
  const k = 7
  const truth: [number, number][] = [
    [x0 + 8 * k, y0 + 9 * k],
    [x0 + s - 2 * k, y0 - 4 * k],
    [x0 + s + 2 * k, y0 + s + 5 * k],
    [x0 + 6 * k, y0 + s - 7 * k],
  ]

  it('accepts opposite edges that converge, as a face seen at an angle does', () => {
    expect(cornersConsistent(truth, 0)).toBe(true)
    expect(
      cornersConsistent(
        [
          [0, 0],
          [100, 0],
          [100, 100],
          [0, 100],
        ],
        0,
      ),
    ).toBe(true)
  })

  it('rejects one edge leaning far more than its opposite (a real capture caught a dark band above the face)', () => {
    // capture-2026-09-26T22-13-21-276Z, face 3: top edge -13.7 degrees, bottom -3.5, face tilt -1.6.
    const face3: [number, number][] = [
      [692.3, 374.7],
      [1142.5, 264.9],
      [1168.9, 798.9],
      [701, 827.2],
    ]
    expect(cornersConsistent(face3, (-1.6 * Math.PI) / 180)).toBe(false)
  })

  it('uses corners only when the straightened face ends up upright', () => {
    const { data } = scene(
      3,
      { x: x0, y: y0, size: s },
      G,
      { corners: truth },
      1.67,
    )
    const found = alignFace(data, W, W, guide, 3)
    expect(acceptFaceCorners(data, W, W, found, truth, 3)).toBe(true)
    // The top-right corner placed 45 px too high, as on the real capture:
    // straightened this way the grid still fits the seams better than the
    // plain square, which is all the old check asked, but the face leans.
    const raised = truth.map((c, i) => (i === 1 ? [c[0], c[1] - 45] : c)) as [
      number,
      number,
    ][]
    expect(acceptFaceCorners(data, W, W, found, raised, 3)).toBe(false)
  })
})

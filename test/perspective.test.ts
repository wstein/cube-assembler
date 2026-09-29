import { describe, expect, it } from 'vitest'
import {
  applyHomography,
  homography,
  warpQuadToSquare,
  type Point,
} from '../src/client/vision/perspective'

const close = (p: Point, q: Point) => Math.hypot(p[0] - q[0], p[1] - q[1])

describe('homography', () => {
  it('maps four points onto four points exactly', () => {
    const square: Point[] = [
      [0, 0],
      [100, 0],
      [100, 100],
      [0, 100],
    ]
    const trapezoid: Point[] = [
      [10, 5],
      [95, 0],
      [100, 110],
      [0, 100],
    ]
    const H = homography(square, trapezoid)
    square.forEach((p, i) =>
      expect(close(applyHomography(H, p), trapezoid[i])).toBeLessThan(1e-6),
    )
  })

  it('keeps straight lines straight', () => {
    const H = homography(
      [
        [0, 0],
        [100, 0],
        [100, 100],
        [0, 100],
      ],
      [
        [10, 5],
        [95, 0],
        [100, 110],
        [0, 100],
      ],
    )
    const [a, b, c] = [
      applyHomography(H, [0, 50]),
      applyHomography(H, [50, 50]),
      applyHomography(H, [100, 50]),
    ]
    const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
    expect(Math.abs(cross)).toBeLessThan(1e-6)
  })
})

describe('warpQuadToSquare', () => {
  // A width x height frame, each pixel colored by which cell of a 5x5 grid
  // over `corners` it falls in (red channel = column, green = row).
  function keystoneFrame(width: number, height: number, corners: Point[]) {
    const toGrid = homography(corners, [
      [0, 0],
      [5, 0],
      [5, 5],
      [0, 5],
    ])
    const data = new Uint8ClampedArray(width * height * 4)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const [u, v] = applyHomography(toGrid, [x + 0.5, y + 0.5])
        const inside = u >= 0 && v >= 0 && u < 5 && v < 5
        data.set(
          inside
            ? [Math.floor(u) * 50, Math.floor(v) * 50, 200, 255]
            : [0, 0, 0, 255],
          (y * width + x) * 4,
        )
      }
    }
    return data
  }

  it('straightens a face seen at an angle, so every cell lands on its square', () => {
    const corners: Point[] = [
      [60, 40],
      [250, 30],
      [270, 260],
      [40, 240],
    ]
    const out = warpQuadToSquare(
      keystoneFrame(320, 300, corners),
      320,
      300,
      corners,
      200,
    )
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 5; col++) {
        const i = ((row * 40 + 20) * 200 + col * 40 + 20) * 4
        expect([out[i], out[i + 1], out[i + 2]]).toEqual([
          col * 50,
          row * 50,
          200,
        ])
      }
    }
  })

  it('copies an axis-aligned square unchanged', () => {
    const data = new Uint8ClampedArray(40 * 40 * 4).map((_, i) => (i * 7) % 251)
    const out = warpQuadToSquare(
      data,
      40,
      40,
      [
        [10, 10],
        [30, 10],
        [30, 30],
        [10, 30],
      ],
      20,
    )
    const at = (buf: Uint8ClampedArray, w: number, x: number, y: number) => [
      ...buf.subarray((y * w + x) * 4, (y * w + x) * 4 + 3),
    ]
    expect(at(out, 20, 5, 7)).toEqual(at(data, 40, 15, 17))
  })
})

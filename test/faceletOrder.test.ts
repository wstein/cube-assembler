import { describe, expect, it } from 'vitest'
import { extractColorsFromImageData } from '../src/client/vision/faceDetection'

// Pure colors that classify unambiguously.
const SWATCH: Record<string, [number, number, number]> = {
  white: [240, 240, 240],
  yellow: [235, 215, 30],
  red: [200, 30, 30],
  orange: [240, 120, 20],
  green: [20, 160, 60],
  blue: [20, 60, 190],
}
const NAMES = Object.keys(SWATCH)
const LETTER: Record<string, string> = {
  white: 'W',
  yellow: 'Y',
  red: 'R',
  orange: 'O',
  green: 'G',
  blue: 'B',
}

// A square frame of n x n flat-colored cells with black seams, `cells` in
// reading order (row by row, left to right).
function frame(cells: string[], n: number, size = 300): Uint8ClampedArray {
  const data = new Uint8ClampedArray(size * size * 4)
  const cell = size / n
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cx = Math.floor(x / cell)
      const cy = Math.floor(y / cell)
      const seam =
        x % cell < 3 ||
        y % cell < 3 ||
        x % cell > cell - 3 ||
        y % cell > cell - 3
      const [r, g, b] = seam ? [10, 10, 10] : SWATCH[cells[cy * n + cx]]
      const i = (y * size + x) * 4
      data[i] = r
      data[i + 1] = g
      data[i + 2] = b
      data[i + 3] = 255
    }
  }
  return data
}

function mirrorRows(cells: string[], n: number): string[] {
  const out: string[] = []
  for (let r = 0; r < n; r++)
    for (let c = n - 1; c >= 0; c--) out.push(cells[r * n + c])
  return out
}

describe.each([3, 4, 5])('facelet order, %ix%i', (n) => {
  const cells = Array.from(
    { length: n * n },
    (_, i) => NAMES[(i * 5 + (i >> 1)) % 6],
  )
  const letters = (c: string[]) => c.map((name) => LETTER[name])
  const read = (c: string[]) =>
    extractColorsFromImageData(frame(c, n), 300, 300, n).colors.flat()

  it('reads row by row, left to right, as the camera sees it', () => {
    expect(read(cells)).toEqual(letters(cells))
  })

  it('reads a mirrored frame with every row reversed', () => {
    expect(read(mirrorRows(cells, n))).toEqual(letters(mirrorRows(cells, n)))
    expect(read(mirrorRows(cells, n))).not.toEqual(read(cells))
  })
})

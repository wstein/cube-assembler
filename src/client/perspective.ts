// Straightening a cube face seen at an angle. Held a little turned toward
// the camera, a face images as a quadrilateral, not a square; a rotation
// alone leaves one side taller than the other. A homography maps the face's
// four corners onto a square, and the face is resampled through it.

export type Point = [number, number]
export type Homography = number[] // 3x3, row-major, h[8] = 1

// The homography taking each of `from` onto the matching point of `to`
// (four points each, no three in a line).
export function homography(from: Point[], to: Point[]): Homography {
  // Eight equations in h0..h7: u = (h0 x + h1 y + h2) / (h6 x + h7 y + 1), same for v.
  const rows: number[][] = []
  for (let i = 0; i < 4; i++) {
    const [x, y] = from[i], [u, v] = to[i]
    rows.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u])
    rows.push([0, 0, 0, x, y, 1, -v * x, -v * y, v])
  }
  // Gaussian elimination with partial pivoting.
  for (let col = 0; col < 8; col++) {
    let pivot = col
    for (let r = col + 1; r < 8; r++) if (Math.abs(rows[r][col]) > Math.abs(rows[pivot][col])) pivot = r
    ;[rows[col], rows[pivot]] = [rows[pivot], rows[col]]
    if (Math.abs(rows[col][col]) < 1e-12) throw new Error('Corners are degenerate')
    for (let r = 0; r < 8; r++) {
      if (r === col) continue
      const f = rows[r][col] / rows[col][col]
      for (let c = col; c < 9; c++) rows[r][c] -= f * rows[col][c]
    }
  }
  return [...rows.map((row, i) => row[8] / row[i]), 1]
}

export function applyHomography(h: Homography, [x, y]: Point): Point {
  const w = h[6] * x + h[7] * y + h[8]
  return [(h[0] * x + h[1] * y + h[2]) / w, (h[3] * x + h[4] * y + h[5]) / w]
}

// The face inside `corners` (top-left, top-right, bottom-right, bottom-left
// in `frame`'s pixels) resampled into a size x size square, bilinearly -
// the perspective counterpart of reading a turned square upright.
export function warpQuadToSquare(frame: Uint8ClampedArray, width: number, height: number, corners: Point[], size: number): Uint8ClampedArray {
  const toFrame = homography([[0, 0], [size, 0], [size, size], [0, size]], corners)
  const out = new Uint8ClampedArray(size * size * 4)
  const at = (x: number, y: number, c: number) => frame[(Math.min(height - 1, Math.max(0, y)) * width + Math.min(width - 1, Math.max(0, x))) * 4 + c]
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const [sx, sy] = applyHomography(toFrame, [x + 0.5, y + 0.5])
      const fx = sx - 0.5, fy = sy - 0.5
      const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0
      const to = (y * size + x) * 4
      for (let c = 0; c < 3; c++) {
        out[to + c] = (at(x0, y0, c) * (1 - tx) + at(x0 + 1, y0, c) * tx) * (1 - ty)
          + (at(x0, y0 + 1, c) * (1 - tx) + at(x0 + 1, y0 + 1, c) * tx) * ty
      }
      out[to + 3] = 255
    }
  }
  return out
}

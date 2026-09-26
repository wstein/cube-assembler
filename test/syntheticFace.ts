// Synthetic cube faces drawn on a grey background, shared by the grid tests.
import { cellEdges, type FaceSquare } from '../src/client/gridAlignment'

export const STICKERS = [
  [220, 105, 30], [30, 150, 80], [240, 240, 235],
  [200, 40, 50], [40, 80, 200], [240, 210, 30],
]

export interface Look {
  // Seam and outer border color; null draws no grid lines at all.
  seam?: number[] | null
  // Seam width as a fraction of an inner cell.
  gap?: number
  // Outer rows/columns relative to inner ones (see cellEdges).
  outer?: number
  // Sticker color by cell; defaults to six colors in turn.
  sticker?: (row: number, col: number) => number[]
  // In-plane tilt in degrees (canvas rotate() direction), about the face center.
  tilt?: number
}

// A region `frame` times the guide (1.4 unless given) with the guide centered, and an N x N face drawn
// at `face` on a mid-grey background.
export function scene(gridSize: number, face: FaceSquare, guideSize = 300, look: Look = {}, frame = 1.4) {
  const { seam = [15, 15, 15], gap = 0.08, outer = 1, sticker = (row: number, col: number) => STICKERS[(row * gridSize + col) % 6], tilt = 0 } = look
  const turn = (tilt * Math.PI) / 180, cos = Math.cos(turn), sin = Math.sin(turn)
  const fcx = face.x + face.size / 2, fcy = face.y + face.size / 2
  const width = Math.round(guideSize * frame)
  const height = width
  const guide = { x: (width - guideSize) / 2, y: (height - guideSize) / 2, size: guideSize }
  const data = new Uint8ClampedArray(width * height * 4)
  const edges = cellEdges(gridSize, outer).map((edge) => edge * face.size)
  const seamWidth = Math.max(2, (edges[Math.min(2, gridSize)] - edges[Math.min(1, gridSize - 1)]) * gap)
  const cellOf = (p: number) => Math.min(gridSize - 1, edges.findIndex((edge) => edge > p) - 1)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Back into the untilted face's frame.
      const u = cos * (x - fcx) + sin * (y - fcy) + face.size / 2
      const v = -sin * (x - fcx) + cos * (y - fcy) + face.size / 2
      let rgb = [128, 128, 128]
      if (u >= 0 && v >= 0 && u < face.size && v < face.size) {
        const col = cellOf(u), row = cellOf(v)
        const inSeam = u - edges[col] < seamWidth / 2 || edges[col + 1] - u < seamWidth / 2
          || v - edges[row] < seamWidth / 2 || edges[row + 1] - v < seamWidth / 2
        rgb = seam && inSeam ? seam : sticker(row, col)
      }
      data.set([rgb[0], rgb[1], rgb[2], 255], (y * width + x) * 4)
    }
  }
  return { data, width, height, guide }
}

// Face square offset by (dx, dy) and scaled by `scale`, as fractions of the guide.
export function placed(guide: FaceSquare, dx: number, dy: number, scale = 1): FaceSquare {
  const size = guide.size * scale
  return {
    x: guide.x + (guide.size - size) / 2 + dx * guide.size,
    y: guide.y + (guide.size - size) / 2 + dy * guide.size,
    size,
  }
}

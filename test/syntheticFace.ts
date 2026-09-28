// Synthetic cube faces drawn on a grey background, shared by the grid tests.
import { cellEdges, type FaceSquare } from '../src/client/gridAlignment'
import {
  applyHomography,
  homography,
  type Point,
} from '../src/client/perspective'

const STICKERS = [
  [220, 105, 30],
  [30, 150, 80],
  [240, 240, 235],
  [200, 40, 50],
  [40, 80, 200],
  [240, 210, 30],
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
  // Rounded sticker corners: radius as a fraction of a sticker's width.
  radius?: number
  // A printed logo (dark strokes in several directions) on the center sticker.
  logo?: boolean
  // Seen at an angle: the face square is drawn through these frame points
  // (top-left, top-right, bottom-right, bottom-left) instead of `face`.
  corners?: Point[]
}

// A region `frame` times the guide (1.4 unless given) with the guide centered, and an N x N face drawn
// at `face` on a mid-grey background.
export function scene(
  gridSize: number,
  face: FaceSquare,
  guideSize = 300,
  look: Look = {},
  frame = 1.4,
) {
  const {
    seam = [15, 15, 15],
    gap = 0.08,
    outer = 1,
    sticker = (row: number, col: number) =>
      STICKERS[(row * gridSize + col) % 6],
    tilt = 0,
    radius = 0,
    logo = false,
    corners,
  } = look
  const turn = (tilt * Math.PI) / 180,
    cos = Math.cos(turn),
    sin = Math.sin(turn)
  const fcx = face.x + face.size / 2,
    fcy = face.y + face.size / 2
  const width = Math.round(guideSize * frame)
  const height = width
  const guide = {
    x: (width - guideSize) / 2,
    y: (height - guideSize) / 2,
    size: guideSize,
  }
  const data = new Uint8ClampedArray(width * height * 4)
  const edges = cellEdges(gridSize, outer).map((edge) => edge * face.size)
  const seamWidth = Math.max(
    2,
    (edges[Math.min(2, gridSize)] - edges[Math.min(1, gridSize - 1)]) * gap,
  )
  const cellOf = (p: number) =>
    Math.min(gridSize - 1, edges.findIndex((edge) => edge > p) - 1)
  const toFace =
    corners &&
    homography(corners, [
      [0, 0],
      [face.size, 0],
      [face.size, face.size],
      [0, face.size],
    ])
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Back into the untilted face's frame.
      const [u, v] = toFace
        ? applyHomography(toFace, [x + 0.5, y + 0.5])
        : [
            cos * (x - fcx) + sin * (y - fcy) + face.size / 2,
            -sin * (x - fcx) + cos * (y - fcy) + face.size / 2,
          ]
      let rgb = [128, 128, 128]
      if (u >= 0 && v >= 0 && u < face.size && v < face.size) {
        const col = cellOf(u),
          row = cellOf(v)
        const inSeam =
          u - edges[col] < seamWidth / 2 ||
          edges[col + 1] - u < seamWidth / 2 ||
          v - edges[row] < seamWidth / 2 ||
          edges[row + 1] - v < seamWidth / 2
        // Outside a rounded corner the dark plastic shows, like the seams.
        const left = edges[col] + seamWidth / 2,
          right = edges[col + 1] - seamWidth / 2
        const top = edges[row] + seamWidth / 2,
          bottom = edges[row + 1] - seamWidth / 2
        const r = radius * (right - left)
        const cx = u < left + r ? left + r : u > right - r ? right - r : u
        const cy = v < top + r ? top + r : v > bottom - r ? bottom - r : v
        const cornerCut = r > 0 && Math.hypot(u - cx, v - cy) > r
        // Logo strokes: thin dark bars at 0, 30, 60, 90 and 135 degrees.
        const center = (gridSize - 1) / 2
        const onLogo =
          logo &&
          gridSize % 2 === 1 &&
          row === center &&
          col === center &&
          (() => {
            const lu = (u - (left + right) / 2) / (right - left),
              lv = (v - (top + bottom) / 2) / (bottom - top)
            if (Math.abs(lu) > 0.3 || Math.abs(lv) > 0.3) return false
            return [0, 30, 60, 90, 135].some((deg) => {
              const t = (deg * Math.PI) / 180
              return Math.abs(lu * Math.sin(t) - lv * Math.cos(t)) < 0.03
            })
          })()
        rgb =
          seam && (inSeam || cornerCut)
            ? seam
            : onLogo
              ? [40, 60, 170]
              : sticker(row, col)
      }
      data.set([rgb[0], rgb[1], rgb[2], 255], (y * width + x) * 4)
    }
  }
  return { data, width, height, guide }
}

// Face square offset by (dx, dy) and scaled by `scale`, as fractions of the guide.
export function placed(
  guide: FaceSquare,
  dx: number,
  dy: number,
  scale = 1,
): FaceSquare {
  const size = guide.size * scale
  return {
    x: guide.x + (guide.size - size) / 2 + dx * guide.size,
    y: guide.y + (guide.size - size) / 2 + dy * guide.size,
    size,
  }
}

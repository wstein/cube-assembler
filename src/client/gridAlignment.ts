// Where the sticker grid really sits, in and around the capture guide.
//
// Colors are sampled at fixed fractions of the face square, so a cube held
// a little off-center reads its neighbors' colors - and the tolerance is a
// fraction of one cell, i.e. 1/N of the face: a 4% offset misread 11% of a
// 7x7's stickers but ~2% of a 3x3's. Instead of trusting the guide, look
// for the dark seams between stickers and move the square onto them.
//
// Seams are scored on 1-D luminance profiles (column means for vertical
// seams, row means for horizontal ones), so shift and scale are searched
// per axis in a few hundred cheap evaluations - fast enough for the live
// preview. A face without dark seams (stickerless, washed out) finds no
// alignment that beats the guide, and the guide is kept.

export interface FaceSquare {
  x: number
  y: number
  size: number
}

export interface GridAlignment extends FaceSquare {
  // Mean seam darkness (luminance levels) at the chosen grid lines.
  score: number
  // Whether the seams were convincing enough to move off the guide.
  aligned: boolean
}

// How far the face may sit from the guide: offsets up to this fraction of
// the guide size, and face sizes within SCALE_RANGE of it. Offsets also stay
// under half a cell: a grid shifted by a whole cell still has its inner
// lines on seams, so on a 7x7 (cells 14% of the face) a wider search slips
// by one row or column.
export const ALIGNMENT_MAX_OFFSET = 0.15
const MAX_OFFSET_CELLS = 0.45
const SCALE_RANGE: [number, number] = [0.8, 1.12]
const SCALE_STEP = 0.02
// A seam must be this much darker (luminance levels) than the stickers on
// both sides, on average over the grid lines, to count as found...
const MIN_SEAM_SCORE = 6
// ...and must beat the guide's own grid lines by this much to move it.
const MIN_IMPROVEMENT = 4
// A grid line counts as sitting on a seam at this darkness, and at least
// this fraction of the inner lines on each axis must - a grid that hits one
// seam by chance can still have a good mean.
const MIN_LINE_DARKNESS = 4
const MIN_LINES_ON_SEAMS = 0.75

function luminanceAt(data: Uint8ClampedArray, index: number): number {
  return 0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2]
}

// Mean luminance of each column (vertical) or row over `from..to` of the
// other axis.
function profile(data: Uint8ClampedArray, width: number, height: number, vertical: boolean, from: number, to: number): Float64Array {
  const length = vertical ? width : height
  const out = new Float64Array(length)
  const start = Math.max(0, Math.round(from))
  const end = Math.min(vertical ? height : width, Math.round(to))
  const count = Math.max(1, end - start)
  for (let along = start; along < end; along++) {
    for (let p = 0; p < length; p++) {
      const index = vertical ? (along * width + p) * 4 : (p * width + along) * 4
      out[p] += luminanceAt(data, index)
    }
  }
  for (let p = 0; p < length; p++) out[p] /= count
  return out
}

// How much darker a seam at `position` is than the stickers either side:
// the mean over a small window centered on it, against the darker of the
// two sides 0.3 cells away. Positive only for a dark line between two
// brighter regions - a plain color step scores negative. A mean (not the
// darkest point) peaks when the line sits in the middle of a wide seam,
// which pins down the face size on 2x2 and 3x3 grids with few lines.
function seamDarkness(values: Float64Array, position: number, cell: number): number {
  const at = (p: number) => values[Math.min(values.length - 1, Math.max(0, Math.round(p)))]
  const window = Math.max(1, cell * 0.03)
  let sum = 0, count = 0
  for (let p = position - window; p <= position + window; p++, count++) sum += at(p)
  return Math.min(at(position - cell * 0.3), at(position + cell * 0.3)) - sum / count
}

// Mean seam darkness over all N + 1 grid lines of one axis, and the share
// of inner lines on a seam. The outer lines count half in the mean: the far
// side there is background, not a sticker. A 2x2's one inner line leaves
// only the outer lines to agree with it.
function axisScore(values: Float64Array, offset: number, size: number, gridSize: number): { score: number; onSeams: number } {
  const cell = size / gridSize
  let sum = 0, hits = 0
  for (let i = 0; i <= gridSize; i++) {
    const darkness = seamDarkness(values, offset + i * cell, cell)
    const outer = i === 0 || i === gridSize
    sum += (outer ? 0.5 : 1) * darkness
    if ((outer ? gridSize === 2 : true) && darkness >= MIN_LINE_DARKNESS) hits++
  }
  const counted = gridSize === 2 ? 3 : gridSize - 1
  return { score: sum / gridSize, onSeams: hits / counted }
}

// Finds the face square whose grid lines best match dark seams, within
// ALIGNMENT_MAX_OFFSET and SCALE_RANGE of `guide`. `data` is an RGBA
// region (width x height) containing the guide plus a margin around it.
export function findGridAlignment(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  guide: FaceSquare,
  gridSize: number
): GridAlignment {
  // Profiles span the middle of the guide on the other axis, which stays
  // on the face even when it is offset.
  const columns = profile(data, width, height, true, guide.y + guide.size * 0.2, guide.y + guide.size * 0.8)
  const rows = profile(data, width, height, false, guide.x + guide.size * 0.2, guide.x + guide.size * 0.8)
  const identity = (axisScore(columns, guide.x, guide.size, gridSize).score + axisScore(rows, guide.y, guide.size, gridSize).score) / 2

  const maxOffset = guide.size * Math.min(ALIGNMENT_MAX_OFFSET, MAX_OFFSET_CELLS / gridSize)
  const step = Math.max(1, guide.size / 200)
  let best: GridAlignment = { ...guide, score: identity, aligned: false }
  for (let scale = SCALE_RANGE[0]; scale <= SCALE_RANGE[1] + 1e-9; scale += SCALE_STEP) {
    const size = guide.size * scale
    const centered = (guide.size - size) / 2
    const bestOffset = (values: Float64Array, origin: number) => {
      let top = { offset: origin + centered, score: -Infinity }
      for (let shift = -maxOffset; shift <= maxOffset; shift += step) {
        const offset = origin + centered + shift
        const { score, onSeams } = axisScore(values, offset, size, gridSize)
        if (onSeams >= MIN_LINES_ON_SEAMS && score > top.score) top = { offset, score }
      }
      return top
    }
    const x = bestOffset(columns, guide.x)
    const y = bestOffset(rows, guide.y)
    const score = (x.score + y.score) / 2
    if (score > best.score) best = { x: x.offset, y: y.offset, size, score, aligned: true }
  }

  if (!best.aligned || best.score < MIN_SEAM_SCORE || best.score - identity < MIN_IMPROVEMENT) {
    return { ...guide, score: identity, aligned: false }
  }
  return best
}

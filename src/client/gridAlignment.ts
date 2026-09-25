// Where the sticker grid really sits, in and around the capture guide.
//
// Colors are sampled at fixed fractions of the face square, so a cube held
// a little off-center reads its neighbors' colors - and the tolerance is a
// fraction of one cell, i.e. 1/N of the face: a 4% offset misread 11% of a
// 7x7's stickers but ~2% of a 3x3's. Instead of trusting the guide, look
// for the dark seams between stickers and move the square onto them.
//
// Seams are scored on 1-D brightness profiles (column means for vertical
// seams, row means for horizontal ones), so shift and scale are searched
// per axis in a few hundred cheap evaluations - fast enough for the live
// preview. A face without dark seams (stickerless, washed out) finds no
// alignment that beats the guide, and the guide is kept. A tilted face is
// first measured (estimateTilt) and turned upright, then searched the same.

export interface FaceSquare {
  x: number
  y: number
  size: number
}

export interface GridAlignment extends FaceSquare {
  // Mean seam darkness (brightness levels, see brightestChannel) at the chosen grid lines.
  score: number
  // Whether the seams were convincing enough to move off the guide.
  aligned: boolean
  // Whether the returned square's grid lines sit on seams at all - true
  // for an aligned square, and for a kept guide that already fits.
  seams: boolean
  // Width of the outer rows and columns relative to the inner ones.
  outer: number
  // In-plane tilt (radians, canvas rotate() direction) the square is turned
  // by about its center, and that center in the input's coordinates. x/y
  // are the square's corner before the turn, i.e. center - size / 2.
  angle: number
  center: [number, number]
}

// Tilts corrected, and the least worth turning the face upright for.
export const MAX_TILT = (35 * Math.PI) / 180
const MIN_TILT = (1.5 * Math.PI) / 180
// How much the edge directions must agree (0-1) to trust a tilt.
const MIN_TILT_COHERENCE = 0.25

// In-plane tilt of the face inside `square`, from the directions of its
// edges: a grid's seams and sticker borders run two ways 90 degrees apart,
// so gradient directions folded to 90 degrees (angle x 4 on the circle,
// weighted by strength) point at the tilt. 0 when the edges show no common
// direction, when the tilt is too small to matter, or beyond MAX_TILT,
// where rows and columns become ambiguous.
export function estimateTilt(data: Uint8ClampedArray, width: number, height: number, square: FaceSquare): number {
  // Luminance averaged over small blocks (~150 across the square): smooths
  // pixel staircases along tilted edges, which would pull the tilt toward
  // the pixel axes, and keeps this cheap.
  const block = Math.max(1, Math.round(square.size / 150))
  const x0 = Math.max(0, Math.round(square.x + square.size * 0.05))
  const y0 = Math.max(0, Math.round(square.y + square.size * 0.05))
  const cols = Math.floor((Math.min(width, Math.round(square.x + square.size * 0.95)) - x0) / block)
  const rows = Math.floor((Math.min(height, Math.round(square.y + square.size * 0.95)) - y0) / block)
  if (cols < 8 || rows < 8) return 0
  const grid = new Float64Array(cols * rows)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let sum = 0
      for (let y = y0 + r * block; y < y0 + (r + 1) * block; y++) {
        for (let x = x0 + c * block; x < x0 + (c + 1) * block; x++) {
          const i = (y * width + x) * 4
          sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]
        }
      }
      grid[r * cols + c] = sum / (block * block)
    }
  }
  // One 3x3 box blur, then Scharr gradients - both keep the measured
  // direction from leaning toward the grid of blocks.
  const smooth = new Float64Array(cols * rows)
  for (let r = 1; r < rows - 1; r++) {
    for (let c = 1; c < cols - 1; c++) {
      let sum = 0
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) sum += grid[(r + dr) * cols + c + dc]
      smooth[r * cols + c] = sum / 9
    }
  }
  const at = (c: number, r: number) => smooth[r * cols + c]
  let sin = 0, cos = 0, total = 0
  for (let r = 2; r < rows - 2; r++) {
    for (let c = 2; c < cols - 2; c++) {
      const gx = 3 * (at(c + 1, r - 1) + at(c + 1, r + 1) - at(c - 1, r - 1) - at(c - 1, r + 1)) + 10 * (at(c + 1, r) - at(c - 1, r))
      const gy = 3 * (at(c - 1, r + 1) + at(c + 1, r + 1) - at(c - 1, r - 1) - at(c + 1, r - 1)) + 10 * (at(c, r + 1) - at(c, r - 1))
      const magnitude = Math.hypot(gx, gy)
      if (magnitude < 60) continue
      const angle = 4 * Math.atan2(gy, gx)
      sin += magnitude * Math.sin(angle)
      cos += magnitude * Math.cos(angle)
      total += magnitude
    }
  }
  if (total === 0 || Math.hypot(sin, cos) / total < MIN_TILT_COHERENCE) return 0
  const tilt = Math.atan2(sin, cos) / 4
  return Math.abs(tilt) < MIN_TILT || Math.abs(tilt) > MAX_TILT ? 0 : tilt
}

// Big cubes have wider perimeter cubies: on real 6x6 and 7x7 faces the
// outer rows and columns measured 1.25-1.56x the inner ones, 5x5 up to
// 1.15x, 3x3/4x4 about even (1.0-1.1). The grid lines of an N-cell face, from 0 to 1,
// with the two outer cells `outer` times as wide as the inner ones.
export function cellEdges(gridSize: number, outer = 1): number[] {
  if (gridSize <= 2 || outer === 1) return Array.from({ length: gridSize + 1 }, (_, i) => i / gridSize)
  const total = gridSize - 2 + 2 * outer
  return [0, ...Array.from({ length: gridSize - 1 }, (_, i) => (outer + i) / total), 1]
}

// Outer-cell ratios tried per cube size. 4x4 and smaller measured about
// even, and on their saved crops a ratio search only fit noise.
function outerRatios(gridSize: number): number[] {
  return gridSize >= 5 ? [1, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6] : [1]
}

// How far the face may sit from the guide: offsets up to this fraction of
// the guide size, and face sizes within SCALE_RANGE of it. Offsets also stay
// under half a cell: a grid shifted by a whole cell still has its inner
// lines on seams, so on a 7x7 (cells 14% of the face) a wider search slips
// by one row or column.
export const ALIGNMENT_MAX_OFFSET = 0.15
const MAX_OFFSET_CELLS = 0.45
const SCALE_RANGE: [number, number] = [0.8, 1.12]
const SCALE_STEP = 0.01
// A seam must be this much darker (brightness levels) than the stickers on
// both sides, on average over the grid lines, to count as found...
const MIN_SEAM_SCORE = 6
// ...and must beat the guide's own grid lines by this much to move it.
const MIN_IMPROVEMENT = 4
// A grid line counts as sitting on a seam at this darkness, and at least
// this fraction of the inner lines on each axis must - a grid that hits one
// seam by chance can still have a good mean.
const MIN_LINE_DARKNESS = 4
const MIN_LINES_ON_SEAMS = 0.75

// A pixel's strongest channel - how bright it is in its own color. Plain
// luminance put red (~76) and blue (~80) stickers below the grey-brown
// plastic between a real cube's tiles (~91), so a seam next to them was
// no dip at all and Detect face lost the whole row; in their strongest
// channel stickers stand at 200+ against the gap's ~100. Faint grey lines
// on a stickerless white face stay dips either way.
function brightestChannel(data: Uint8ClampedArray, index: number): number {
  return Math.max(data[index], data[index + 1], data[index + 2])
}

// A turn about (cx, cy): profiles are then taken across the face as if it
// were upright, reading each point through the rotation.
interface Turn { cx: number; cy: number; cos: number; sin: number }

// Mean brightestChannel of each column (vertical) or row over `from..to` of the
// other axis, averaging every `step`-th line - a mean loses nothing by
// skipping rows on a large guide.
function profile(data: Uint8ClampedArray, width: number, height: number, vertical: boolean, from: number, to: number, turn?: Turn, step = 1): Float64Array {
  const length = vertical ? width : height
  const out = new Float64Array(length)
  const start = Math.max(0, Math.round(from))
  const end = Math.min(vertical ? height : width, Math.round(to))
  let count = 0
  for (let along = start; along < end; along += step, count++) {
    for (let p = 0; p < length; p++) {
      let x = vertical ? p : along, y = vertical ? along : p
      if (turn) {
        const dx = x - turn.cx, dy = y - turn.cy
        x = Math.min(width - 1, Math.max(0, Math.round(turn.cx + turn.cos * dx - turn.sin * dy)))
        y = Math.min(height - 1, Math.max(0, Math.round(turn.cy + turn.sin * dx + turn.cos * dy)))
      }
      out[p] += brightestChannel(data, (y * width + x) * 4)
    }
  }
  for (let p = 0; p < length; p++) out[p] /= Math.max(1, count)
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

// The face's outer edge need not be a dark line: a single-color stickerless
// face ends in a plain step to the background. A step measured just either
// side of `position` peaks right at the edge; capped so a high-contrast
// background cannot outweigh the seams inside the face.
const MAX_EDGE_STEP = 40
function edgeStep(values: Float64Array, position: number, cell: number): number {
  const at = (p: number) => values[Math.min(values.length - 1, Math.max(0, Math.round(p)))]
  return Math.min(MAX_EDGE_STEP, Math.abs(at(position + cell * 0.05) - at(position - cell * 0.05)))
}

// Mean seam darkness over all N + 1 grid lines of one axis (at `edges`, see
// cellEdges), and the share of inner lines on a seam. The outer lines count
// half in the mean and may also be a plain edge (see edgeStep): the far side
// there is background, not a sticker. A 2x2's one inner line leaves only the
// outer lines to agree with it.
function axisScore(values: Float64Array, offset: number, size: number, gridSize: number, edges: number[]): { score: number; onSeams: number } {
  // Seams are judged at the scale of an inner cell, the narrowest one.
  const cell = (gridSize >= 3 ? edges[2] - edges[1] : 1 / gridSize) * size
  let sum = 0, hits = 0
  for (let i = 0; i <= gridSize; i++) {
    const outer = i === 0 || i === gridSize
    const position = offset + edges[i] * size
    const darkness = outer
      ? Math.max(seamDarkness(values, position, cell), edgeStep(values, position, cell))
      : seamDarkness(values, position, cell)
    sum += (outer ? 0.5 : 1) * darkness
    if ((outer ? gridSize === 2 : true) && darkness >= MIN_LINE_DARKNESS) hits++
  }
  const counted = gridSize === 2 ? 3 : gridSize - 1
  return { score: sum / gridSize, onSeams: hits / counted }
}

// Finds the face square whose grid lines best match dark seams, within
// ALIGNMENT_MAX_OFFSET and SCALE_RANGE of `guide` and turned by `angle`
// (see estimateTilt). `data` is an RGBA region (width x height) containing
// the guide plus a margin around it.
export function findGridAlignment(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  guide: FaceSquare,
  gridSize: number,
  angle = 0
): GridAlignment {
  const cx = guide.x + guide.size / 2, cy = guide.y + guide.size / 2
  const turn = angle ? { cx, cy, cos: Math.cos(angle), sin: Math.sin(angle) } : undefined
  const found = searchUpright(data, width, height, guide, gridSize, turn)
  // Back from the upright copy: turn the square's center about the guide's.
  const ux = found.x + found.size / 2 - cx, uy = found.y + found.size / 2 - cy
  const center: [number, number] = [cx + Math.cos(angle) * ux - Math.sin(angle) * uy, cy + Math.sin(angle) * ux + Math.cos(angle) * uy]
  return { ...found, angle, center, x: center[0] - found.size / 2, y: center[1] - found.size / 2 }
}

// Tilt, position and size of the face around `guide`: the measured tilt is
// kept only when a grid shows up under it. Edge directions alone can point
// at a tilt in anything striped; then the face is searched upright.
export function alignFace(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  guide: FaceSquare,
  gridSize: number
): GridAlignment {
  const angle = estimateTilt(data, width, height, guide)
  if (angle) {
    const tilted = findGridAlignment(data, width, height, guide, gridSize, angle)
    if (tilted.seams) return tilted
  }
  return findGridAlignment(data, width, height, guide, gridSize)
}

function searchUpright(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  guide: FaceSquare,
  gridSize: number,
  turn?: Turn
): Omit<GridAlignment, 'angle' | 'center'> {
  // Profiles span the middle of the guide on the other axis, which stays
  // on the face even when it is offset.
  const lines = Math.max(1, Math.round(guide.size / 300))
  const columns = profile(data, width, height, true, guide.y + guide.size * 0.2, guide.y + guide.size * 0.8, turn, lines)
  const rows = profile(data, width, height, false, guide.x + guide.size * 0.2, guide.x + guide.size * 0.8, turn, lines)
  const layouts = outerRatios(gridSize).map((outer) => ({ outer, edges: cellEdges(gridSize, outer) }))
  // The guide as it is, with its best-fitting outer-cell ratio.
  let stay = { score: -Infinity, outer: 1 }
  for (const { outer, edges } of layouts) {
    const score = (axisScore(columns, guide.x, guide.size, gridSize, edges).score + axisScore(rows, guide.y, guide.size, gridSize, edges).score) / 2
    if (score > stay.score) stay = { score, outer }
  }

  // Offsets stay under half of the narrowest (inner) cell.
  const maxOffset = guide.size * Math.min(ALIGNMENT_MAX_OFFSET, MAX_OFFSET_CELLS / gridSize)
  const step = Math.max(1, guide.size / 200)
  let best: Omit<GridAlignment, 'angle' | 'center' | 'seams'> = { ...guide, score: stay.score, aligned: false, outer: stay.outer }
  for (let scale = SCALE_RANGE[0]; scale <= SCALE_RANGE[1] + 1e-9; scale += SCALE_STEP) {
    const size = guide.size * scale
    const centered = (guide.size - size) / 2
    for (const { outer, edges } of layouts) {
      const bestOffset = (values: Float64Array, origin: number) => {
        let top = { offset: origin + centered, score: -Infinity }
        for (let shift = -maxOffset; shift <= maxOffset; shift += step) {
          const offset = origin + centered + shift
          const { score, onSeams } = axisScore(values, offset, size, gridSize, edges)
          if (onSeams >= MIN_LINES_ON_SEAMS && score > top.score) top = { offset, score }
        }
        return top
      }
      const x = bestOffset(columns, guide.x)
      const y = bestOffset(rows, guide.y)
      const score = (x.score + y.score) / 2
      if (score > best.score) best = { x: x.offset, y: y.offset, size, score, aligned: true, outer }
    }
  }

  if (!best.aligned || best.score < MIN_SEAM_SCORE || best.score - stay.score < MIN_IMPROVEMENT) {
    const seams = stay.score >= MIN_SEAM_SCORE
    return { ...guide, score: stay.score, aligned: false, seams, outer: seams ? stay.outer : 1 }
  }
  return { ...best, seams: true }
}

// The outer-cell ratio of a face that already fills `data` (an aligned
// crop): the layout whose grid lines sit best on dark seams, or 1 when no
// layout shows convincing seams.
export function estimateOuterCellRatio(data: Uint8ClampedArray, width: number, height: number, gridSize: number): number {
  const layouts = outerRatios(gridSize)
  if (layouts.length === 1) return 1
  const columns = profile(data, width, height, true, height * 0.2, height * 0.8)
  const rows = profile(data, width, height, false, width * 0.2, width * 0.8)
  let best = { score: -Infinity, outer: 1 }
  let even = -Infinity
  for (const outer of layouts) {
    const edges = cellEdges(gridSize, outer)
    const score = (axisScore(columns, 0, width, gridSize, edges).score + axisScore(rows, 0, height, gridSize, edges).score) / 2
    if (outer === 1) even = score
    if (score > best.score) best = { score, outer }
  }
  return best.score >= MIN_SEAM_SCORE && best.score - even >= MIN_IMPROVEMENT ? best.outer : 1
}

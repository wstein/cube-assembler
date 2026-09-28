// Where the sticker grid really sits inside the capture search area.
//
// Colors are sampled at fixed fractions of the face square, so a cube held
// a little off-center reads its neighbors' colors - and the tolerance is a
// fraction of one cell, i.e. 1/N of the face: a 4% offset misread 11% of a
// 7x7's stickers but ~2% of a 3x3's. First locate the outer face, then
// refine its grid using the dark seams between stickers.
//
// Seams are scored on 1-D strongest-channel profiles (column means for vertical
// seams, row means for horizontal ones), so shift and scale are searched
// per axis in a few hundred cheap evaluations - fast enough for the live
// preview. A face without dark seams (stickerless, washed out) finds no
// alignment that beats the guide, and the guide is kept. A tilted face is
// first measured (estimateTilt) and turned upright, then searched the same.

import { warpQuadToSquare } from './perspective'
import { cellEdges } from './stickerColorGeometry'

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
  // Seams were found, but their outer lines do not bound a complete face.
  // The caller should ask for the cube to be re-centered instead of reading it.
  needsRecentering?: boolean
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
// How much the edge directions must agree (0-1) to consider a tilt. Rounded
// sticker corners and a printed logo spread them: a real 5x5 turned about
// 4 degrees agreed only 0.13. A weak tilt is kept only where its grid sits
// on the seams better than the upright one (see alignFace).
const MIN_TILT_COHERENCE = 0.1

// In-plane tilt of the face inside `square`, from the directions of its
// edges: a grid's seams and sticker borders run two ways 90 degrees apart,
// so gradient directions folded to 90 degrees (angle x 4 on the circle,
// weighted by strength) point at the tilt. 0 when the edges show no common
// direction, when the tilt is too small to matter, or beyond MAX_TILT,
// where rows and columns become ambiguous.
export function estimateTilt(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  square: FaceSquare,
): number {
  // Luminance averaged over small blocks (~150 across the square): smooths
  // pixel staircases along tilted edges, which would pull the tilt toward
  // the pixel axes, and keeps this cheap.
  const block = Math.max(1, Math.round(square.size / 150))
  const x0 = Math.max(0, Math.round(square.x + square.size * 0.05))
  const y0 = Math.max(0, Math.round(square.y + square.size * 0.05))
  const cols = Math.floor(
    (Math.min(width, Math.round(square.x + square.size * 0.95)) - x0) / block,
  )
  const rows = Math.floor(
    (Math.min(height, Math.round(square.y + square.size * 0.95)) - y0) / block,
  )
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
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++) sum += grid[(r + dr) * cols + c + dc]
      smooth[r * cols + c] = sum / 9
    }
  }
  const at = (c: number, r: number) => smooth[r * cols + c]
  let sin = 0,
    cos = 0,
    total = 0
  for (let r = 2; r < rows - 2; r++) {
    for (let c = 2; c < cols - 2; c++) {
      const gx =
        3 *
          (at(c + 1, r - 1) +
            at(c + 1, r + 1) -
            at(c - 1, r - 1) -
            at(c - 1, r + 1)) +
        10 * (at(c + 1, r) - at(c - 1, r))
      const gy =
        3 *
          (at(c - 1, r + 1) +
            at(c + 1, r + 1) -
            at(c - 1, r - 1) -
            at(c + 1, r - 1)) +
        10 * (at(c, r + 1) - at(c, r - 1))
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
// 1.15x, 3x3/4x4 about even (1.0-1.1). cellEdges (StickerGeometry.res)
// gives the grid lines of an N-cell face with the two outer cells `outer`
// times as wide as the inner ones.
export { cellEdges }

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
interface Turn {
  cx: number
  cy: number
  cos: number
  sin: number
}

// Mean brightestChannel of each column (vertical) or row over `from..to` of the
// other axis, averaging every `step`-th line - a mean loses nothing by
// skipping rows on a large guide.
function profile(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  vertical: boolean,
  from: number,
  to: number,
  turn?: Turn,
  step = 1,
): Float64Array {
  const length = vertical ? width : height
  const out = new Float64Array(length)
  const start = Math.max(0, Math.round(from))
  const end = Math.min(vertical ? height : width, Math.round(to))
  let count = 0
  for (let along = start; along < end; along += step, count++) {
    for (let p = 0; p < length; p++) {
      let x = vertical ? p : along,
        y = vertical ? along : p
      if (turn) {
        const dx = x - turn.cx,
          dy = y - turn.cy
        x = Math.min(
          width - 1,
          Math.max(0, Math.round(turn.cx + turn.cos * dx - turn.sin * dy)),
        )
        y = Math.min(
          height - 1,
          Math.max(0, Math.round(turn.cy + turn.sin * dx + turn.cos * dy)),
        )
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
function seamDarkness(
  values: Float64Array,
  position: number,
  cell: number,
): number {
  const at = (p: number) =>
    values[Math.min(values.length - 1, Math.max(0, Math.round(p)))]
  const window = Math.max(1, cell * 0.03)
  let sum = 0,
    count = 0
  for (let p = position - window; p <= position + window; p++, count++)
    sum += at(p)
  return (
    Math.min(at(position - cell * 0.3), at(position + cell * 0.3)) - sum / count
  )
}

// The face's outer edge need not be a dark line: a single-color stickerless
// face ends in a plain step to the background. A step measured just either
// side of `position` peaks right at the edge; capped so a high-contrast
// background cannot outweigh the seams inside the face.
const MAX_EDGE_STEP = 40
function edgeStep(
  values: Float64Array,
  position: number,
  cell: number,
): number {
  const at = (p: number) =>
    values[Math.min(values.length - 1, Math.max(0, Math.round(p)))]
  return Math.min(
    MAX_EDGE_STEP,
    Math.abs(at(position + cell * 0.05) - at(position - cell * 0.05)),
  )
}

// Mean seam darkness over all N + 1 grid lines of one axis (at `edges`, see
// cellEdges), and the share of inner lines on a seam. The outer lines count
// half in the mean and may also be a plain edge (see edgeStep): the far side
// there is background, not a sticker. A 2x2's one inner line leaves only the
// outer lines to agree with it.
function axisScore(
  values: Float64Array,
  offset: number,
  size: number,
  gridSize: number,
  edges: number[],
): { score: number; onSeams: number } {
  // Seams are judged at the scale of an inner cell, the narrowest one.
  const cell = (gridSize >= 3 ? edges[2] - edges[1] : 1 / gridSize) * size
  let sum = 0,
    hits = 0
  for (let i = 0; i <= gridSize; i++) {
    const outer = i === 0 || i === gridSize
    const position = offset + edges[i] * size
    const darkness = outer
      ? Math.max(
          seamDarkness(values, position, cell),
          edgeStep(values, position, cell),
        )
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
  angle = 0,
  scaleRange: [number, number] = SCALE_RANGE,
): GridAlignment {
  const cx = guide.x + guide.size / 2,
    cy = guide.y + guide.size / 2
  const turn = angle
    ? { cx, cy, cos: Math.cos(angle), sin: Math.sin(angle) }
    : undefined
  const found = searchUpright(
    data,
    width,
    height,
    guide,
    gridSize,
    turn,
    scaleRange,
  )
  // Back from the upright copy: turn the square's center about the guide's.
  const ux = found.x + found.size / 2 - cx,
    uy = found.y + found.size / 2 - cy
  const center: [number, number] = [
    cx + Math.cos(angle) * ux - Math.sin(angle) * uy,
    cy + Math.sin(angle) * ux + Math.cos(angle) * uy,
  ]
  return {
    ...found,
    angle,
    center,
    x: center[0] - found.size / 2,
    y: center[1] - found.size / 2,
  }
}

// Tilt, position and size of the face around `guide`: the measured tilt is
// kept only when a grid shows up under it. Edge directions alone can point
// at a tilt in anything striped; then the face is searched upright.
export function alignFace(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  guide: FaceSquare,
  gridSize: number,
): GridAlignment {
  const checked = (found: GridAlignment): GridAlignment =>
    gridSize >= 6 && found.seams && missingFaceEdge(data, width, height, found)
      ? { ...found, seams: false, aligned: false, needsRecentering: true }
      : found
  // The perimeter fixes the grid origin before the seam search. Searching
  // seams from the fixed guide alone can land one whole cell off on 7x7.
  const coarse = locateFaceOutline(data, width, height, guide)
  const searchGuide = coarse ?? guide
  // The outline can take in a clear shell's rim and the fingers holding it
  // (20% too big on a solved GoCube), so on 2x2-4x4 the seams may shrink it
  // by up to most of a cell - no more, or the grid could slip by a whole
  // cell - but barely grow it: a face never reaches past its outline. From
  // 5x5 up the outer cells' width varies too (see outerRatios), and a smaller
  // square with wider outer cells fits the same inner seams.
  const minScale = gridSize <= 4 ? 1 - 0.8 / gridSize : 0.92
  const scaleRange: [number, number] = coarse ? [minScale, 1.08] : SCALE_RANGE
  const angle = estimateTilt(data, width, height, searchGuide)
  const aligned = findGridAlignment(
    data,
    width,
    height,
    searchGuide,
    gridSize,
    0,
    scaleRange,
  )
  if (angle) {
    // The tilt must beat reading the face upright, not merely find seams:
    // round stickers can suggest a tilt that isn't there.
    const tilted = findGridAlignment(
      data,
      width,
      height,
      searchGuide,
      gridSize,
      angle,
      scaleRange,
    )
    if (tilted.seams && (!aligned.seams || tilted.score > aligned.score))
      return checked(coarse ? { ...tilted, aligned: true } : tilted)
  }
  if (aligned.seams)
    return checked(coarse ? { ...aligned, aligned: true } : aligned)
  if (!coarse) return aligned
  return checked(findGridAlignment(data, width, height, guide, gridSize))
}

// A one-cell-shifted grid can score strongly on inner seams while an outer
// line sits in the backdrop. Compare pixels just inside and outside each
// candidate edge. One missing side beside a strong side is evidence that
// the fitted seams do not bound the whole face. All-weak outlines are left
// alone so faint stickerless grids can still be read.
function missingFaceEdge(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  found: GridAlignment,
): boolean {
  const half = found.size / 2
  const inset = found.size * 0.025
  const cos = Math.cos(found.angle),
    sin = Math.sin(found.angle)
  const pixel = (u: number, v: number) => {
    const x = Math.round(found.center[0] + cos * u - sin * v)
    const y = Math.round(found.center[1] + sin * u + cos * v)
    if (x < 0 || x >= width || y < 0 || y >= height) return null
    const i = (y * width + x) * 4
    return [data[i], data[i + 1], data[i + 2]]
  }
  const contrast = (a: number[] | null, b: number[] | null) =>
    a && b ? Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) : 0
  const sides = [0, 1, 2, 3].map((side) => {
    let sum = 0
    for (let i = 0; i < 10; i++) {
      const along = ((i + 0.5) / 10 - 0.5) * found.size
      sum +=
        side === 0
          ? contrast(pixel(-half - inset, along), pixel(-half + inset, along))
          : side === 1
            ? contrast(pixel(half - inset, along), pixel(half + inset, along))
            : side === 2
              ? contrast(
                  pixel(along, -half - inset),
                  pixel(along, -half + inset),
                )
              : contrast(pixel(along, half - inset), pixel(along, half + inset))
    }
    return sum / 10
  })
  return Math.min(...sides) < 5 && Math.max(...sides) > 30
}

// A sparse perimeter scan supplies an approximate square, independent of
// sticker count. It compares points just inside and outside all four edges;
// a complete outline wins over an inner seam or a single background edge.
function locateFaceOutline(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  guide: FaceSquare,
): FaceSquare | null {
  const pixel = (x: number, y: number) => {
    const i = (Math.round(y) * width + Math.round(x)) * 4
    return [data[i], data[i + 1], data[i + 2]]
  }
  const difference = (ax: number, ay: number, bx: number, by: number) => {
    const a = pixel(ax, ay),
      b = pixel(bx, by)
    return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
  }
  const cx = guide.x + guide.size / 2,
    cy = guide.y + guide.size / 2
  let best: { square: FaceSquare; score: number } | null = null
  for (let scale = 0.7; scale <= 1.3 + 1e-9; scale += 0.03) {
    const size = guide.size * scale
    const inset = size * 0.025
    for (let ox = -0.22; ox <= 0.22 + 1e-9; ox += 0.025) {
      const x = cx + ox * guide.size - size / 2
      if (x - inset < 0 || x + size + inset >= width) continue
      for (let oy = -0.22; oy <= 0.22 + 1e-9; oy += 0.025) {
        const y = cy + oy * guide.size - size / 2
        if (y - inset < 0 || y + size + inset >= height) continue
        const sides = [0, 0, 0, 0]
        const outside: number[][] = []
        for (let sample = 0; sample < 10; sample++) {
          const t = (sample + 0.5) / 10
          const sx = x + t * size,
            sy = y + t * size
          outside.push(
            pixel(x - inset, sy),
            pixel(x + size + inset, sy),
            pixel(sx, y - inset),
            pixel(sx, y + size + inset),
          )
          sides[0] += difference(x - inset, sy, x + inset, sy)
          sides[1] += difference(x + size - inset, sy, x + size + inset, sy)
          sides[2] += difference(sx, y - inset, sx, y + inset)
          sides[3] += difference(sx, y + size - inset, sx, y + size + inset)
        }
        // A face has four edges. Penalize candidates explaining only one or
        // two strong lines, common with furniture and internal grid seams.
        const weakest = Math.min(...sides) / 10
        const mean = [0, 1, 2].map(
          (channel) =>
            outside.reduce((sum, rgb) => sum + rgb[channel], 0) /
            outside.length,
        )
        const spread = Math.sqrt(
          outside.reduce(
            (sum, rgb) =>
              sum +
              rgb.reduce(
                (part, value, channel) => part + (value - mean[channel]) ** 2,
                0,
              ),
            0,
          ) / outside.length,
        )
        const score =
          sides.reduce((sum, side) => sum + side, 0) / 40 +
          weakest -
          spread +
          150 * scale
        if (!best || score > best.score)
          best = { square: { x, y, size }, score }
      }
    }
  }
  return best && best.score >= 45 + 150 * (best.square.size / guide.size)
    ? best.square
    : null
}

function searchUpright(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  guide: FaceSquare,
  gridSize: number,
  turn?: Turn,
  scaleRange: [number, number] = SCALE_RANGE,
): Omit<GridAlignment, 'angle' | 'center'> {
  // Profiles span the middle of the guide on the other axis, which stays
  // on the face even when it is offset.
  const lines = Math.max(1, Math.round(guide.size / 300))
  const columns = profile(
    data,
    width,
    height,
    true,
    guide.y + guide.size * 0.2,
    guide.y + guide.size * 0.8,
    turn,
    lines,
  )
  const rows = profile(
    data,
    width,
    height,
    false,
    guide.x + guide.size * 0.2,
    guide.x + guide.size * 0.8,
    turn,
    lines,
  )
  const layouts = outerRatios(gridSize).map((outer) => ({
    outer,
    edges: cellEdges(gridSize, outer),
  }))
  // The guide as it is, with its best-fitting outer-cell ratio.
  // It counts as a grid only with its lines on seams, as a moved square
  // must: a 2x2 outline's edges alone scored enough with no inner seam.
  let stay = { score: -Infinity, outer: 1, onSeams: false }
  for (const { outer, edges } of layouts) {
    const x = axisScore(columns, guide.x, guide.size, gridSize, edges),
      y = axisScore(rows, guide.y, guide.size, gridSize, edges)
    const score = (x.score + y.score) / 2
    if (score > stay.score)
      stay = {
        score,
        outer,
        onSeams:
          x.onSeams >= MIN_LINES_ON_SEAMS && y.onSeams >= MIN_LINES_ON_SEAMS,
      }
  }

  // Offsets stay under half of the narrowest (inner) cell.
  const maxOffset =
    guide.size * Math.min(ALIGNMENT_MAX_OFFSET, MAX_OFFSET_CELLS / gridSize)
  const step = Math.max(1, guide.size / 200)
  let best: Omit<GridAlignment, 'angle' | 'center' | 'seams'> = {
    ...guide,
    score: stay.score,
    aligned: false,
    outer: stay.outer,
  }
  for (
    let scale = scaleRange[0];
    scale <= scaleRange[1] + 1e-9;
    scale += SCALE_STEP
  ) {
    const size = guide.size * scale
    const centered = (guide.size - size) / 2
    for (const { outer, edges } of layouts) {
      const bestOffset = (values: Float64Array, origin: number) => {
        let top = { offset: origin + centered, score: -Infinity }
        for (let shift = -maxOffset; shift <= maxOffset; shift += step) {
          const offset = origin + centered + shift
          const { score, onSeams } = axisScore(
            values,
            offset,
            size,
            gridSize,
            edges,
          )
          if (onSeams >= MIN_LINES_ON_SEAMS && score > top.score)
            top = { offset, score }
        }
        return top
      }
      const x = bestOffset(columns, guide.x)
      const y = bestOffset(rows, guide.y)
      const score = (x.score + y.score) / 2
      if (score > best.score)
        best = { x: x.offset, y: y.offset, size, score, aligned: true, outer }
    }
  }

  if (
    !best.aligned ||
    best.score < MIN_SEAM_SCORE ||
    best.score - stay.score < MIN_IMPROVEMENT
  ) {
    const seams = stay.score >= MIN_SEAM_SCORE && stay.onSeams
    return {
      ...guide,
      score: stay.score,
      aligned: false,
      seams,
      outer: seams ? stay.outer : 1,
    }
  }
  return { ...best, seams: true }
}

// The outer-cell ratio of a face that already fills `data` (an aligned
// crop): the layout whose grid lines sit best on dark seams, or 1 when no
// layout shows convincing seams.
export function estimateOuterCellRatio(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  gridSize: number,
): number {
  const layouts = outerRatios(gridSize)
  if (layouts.length === 1) return 1
  const columns = profile(data, width, height, true, height * 0.2, height * 0.8)
  const rows = profile(data, width, height, false, width * 0.2, width * 0.8)
  let best = { score: -Infinity, outer: 1 }
  let even = -Infinity
  for (const outer of layouts) {
    const edges = cellEdges(gridSize, outer)
    const score =
      (axisScore(columns, 0, width, gridSize, edges).score +
        axisScore(rows, 0, height, gridSize, edges).score) /
      2
    if (outer === 1) even = score
    if (score > best.score) best = { score, outer }
  }
  return best.score >= MIN_SEAM_SCORE && best.score - even >= MIN_IMPROVEMENT
    ? best.outer
    : 1
}

// The face's four corners (top-left, top-right, bottom-right, bottom-left,
// in `data`'s pixels) when it is seen at an angle, else null. Starting from
// the aligned square `found` (turned by its angle), each grid line is found
// twice: vertical ones in a band near the top and near the bottom, horizontal
// ones near the left and right. Joined up they give each line's slope, and
// the outer lines cross at the corners. Null when the corners form a square
// already (sides and diagonals within MIN_SKEW of each other) or are
// implausible (a corner beyond MAX_CORNER_SHIFT of the aligned square's).
const MIN_SKEW = 0.02
const MAX_CORNER_SHIFT = 0.3

export function estimateFaceCorners(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  found: GridAlignment,
  gridSize: number,
): [number, number][] | null {
  const { size } = found
  const [cx, cy] = found.center
  const x = cx - size / 2,
    y = cy - size / 2
  const turn: Turn = {
    cx,
    cy,
    cos: Math.cos(found.angle),
    sin: Math.sin(found.angle),
  }
  const edges = cellEdges(gridSize, found.outer)
  const cell = size / gridSize
  const lines = Math.max(1, Math.round(size / 300))
  const bands = [0.1, 0.3, 0.7, 0.9]
  // Position of each grid line in one band's profile. Inner lines are
  // searched around where the square puts them; each outer line around
  // where its inner neighbours extrapolate it to (the square itself can be
  // off on a face seen at an angle), and may be a plain edge (see edgeStep).
  // Every line sits where it is darkest against the sticker next to it.
  // An outer line is compared with its inner side only: the background
  // beyond it can be anything, and edge steps vary with each sticker's
  // brightness, which tilted the edges between bands.
  const at = (values: Float64Array, p: number) =>
    values[Math.min(values.length - 1, Math.max(0, Math.round(p)))]
  const search = (
    values: Float64Array,
    predicted: number,
    side: 0 | -1 | 1,
  ) => {
    const window = Math.max(1, cell * 0.03)
    let best = { at: predicted, score: -Infinity }
    for (
      let p = predicted - cell * 0.3;
      p <= predicted + cell * 0.3;
      p += 0.5
    ) {
      let sum = 0,
        count = 0
      for (let q = p - window; q <= p + window; q++, count++)
        sum += at(values, q)
      const inside =
        side === 0
          ? Math.min(at(values, p - cell * 0.3), at(values, p + cell * 0.3))
          : at(values, p - side * cell * 0.3)
      const score = inside - sum / count
      if (score > best.score) best = { at: p, score }
    }
    return best.at
  }
  const positions = (values: Float64Array, origin: number) => {
    const at = edges.map((edge, i) =>
      i === 0 || i === gridSize ? NaN : search(values, origin + edge * size, 0),
    )
    const ratio = (i: number, j: number, k: number) =>
      (edges[i] - edges[j]) / (edges[k] - edges[j])
    // Outer lines from the two nearest inner lines (a 2x2 has only one).
    const first =
      gridSize > 2 ? at[1] + (at[2] - at[1]) * ratio(0, 1, 2) : origin
    const last =
      gridSize > 2
        ? at[gridSize - 1] +
          (at[gridSize - 2] - at[gridSize - 1]) *
            ratio(gridSize, gridSize - 1, gridSize - 2)
        : origin + size
    at[0] = search(values, first, -1)
    at[gridSize] = search(values, last, 1)
    return at
  }
  const across = (vertical: boolean) => {
    const origin = vertical ? x : y
    const start = vertical ? y : x
    const near = profile(
      data,
      width,
      height,
      vertical,
      start + size * bands[0],
      start + size * bands[1],
      turn,
      lines,
    )
    const far = profile(
      data,
      width,
      height,
      vertical,
      start + size * bands[2],
      start + size * bands[3],
      turn,
      lines,
    )
    const a = start + (size * (bands[0] + bands[1])) / 2,
      b = start + (size * (bands[2] + bands[3])) / 2
    const p = positions(near, origin),
      q = positions(far, origin)
    // Each line as position = offset + slope * (coordinate along it).
    return edges.map((_, i) => ({
      slope: (q[i] - p[i]) / (b - a),
      offset: p[i] - ((q[i] - p[i]) / (b - a)) * a,
    }))
  }
  const columns = across(true),
    rows = across(false)
  // Outer lines crossing: x = c.offset + c.slope * y and y = r.offset + r.slope * x.
  const meet = (
    c: { slope: number; offset: number },
    r: { slope: number; offset: number },
  ): [number, number] => {
    const ux = (c.offset + c.slope * r.offset) / (1 - c.slope * r.slope)
    return [ux, r.offset + r.slope * ux]
  }
  const upright = [
    meet(columns[0], rows[0]),
    meet(columns[gridSize], rows[0]),
    meet(columns[gridSize], rows[gridSize]),
    meet(columns[0], rows[gridSize]),
  ]
  const square = [
    [x, y],
    [x + size, y],
    [x + size, y + size],
    [x, y + size],
  ]
  const shift = Math.max(
    ...upright.map(([ux, uy], i) =>
      Math.hypot(ux - square[i][0], uy - square[i][1]),
    ),
  )
  if (shift > size * MAX_CORNER_SHIFT) return null
  const length = (i: number, j: number) =>
    Math.hypot(upright[i][0] - upright[j][0], upright[i][1] - upright[j][1])
  const sides = [length(0, 1), length(1, 2), length(2, 3), length(3, 0)]
  const side = sides.reduce((sum, value) => sum + value, 0) / 4
  const skew = Math.max(
    ...sides.map((value) => Math.abs(value - side) / side),
    Math.abs(length(0, 2) - length(1, 3)) / (side * Math.SQRT2),
  )
  if (skew < MIN_SKEW) return null
  // Back from the upright view into `data`'s pixels.
  return upright.map(([ux, uy]) => [
    cx + turn.cos * (ux - cx) - turn.sin * (uy - cy),
    cy + turn.sin * (ux - cx) + turn.cos * (uy - cy),
  ])
}

// How well a square face image's grid lines sit on seams: the mean
// axisScore over both axes, at the outer-cell ratio that fits it best - a
// face read at an angle and the same face straightened need different ones.
function squareSeamScore(
  square: Uint8ClampedArray,
  size: number,
  gridSize: number,
): number {
  const columns = profile(square, size, size, true, size * 0.2, size * 0.8)
  const rows = profile(square, size, size, false, size * 0.2, size * 0.8)
  return Math.max(
    ...outerRatios(gridSize).map((outer) => {
      const edges = cellEdges(gridSize, outer)
      return (
        (axisScore(columns, 0, size, gridSize, edges).score +
          axisScore(rows, 0, size, gridSize, edges).score) /
        2
      )
    }),
  )
}

// Opposite edges of a face seen at an angle converge in step: turned about
// one axis, one edge leans one way and its opposite about as far the other,
// so each pair averages out to the face's own tilt (`angle`). A pair whose
// average leans more than MAX_EDGE_PAIR_LEAN has one wrong edge - on a real
// capture the top edge caught a dark band above the face (-12 degrees
// against the face while the bottom leaned -2, a pair average of -7). Real
// perspective is not perfectly symmetric: a strongly turned face that is
// also tilted averaged about -4.4.
const MAX_EDGE_PAIR_LEAN = (6 * Math.PI) / 180

export function cornersConsistent(
  corners: [number, number][],
  angle: number,
): boolean {
  const [tl, tr, br, bl] = corners
  const lean = (
    a: [number, number],
    b: [number, number],
    vertical: boolean,
  ) => {
    const raw = vertical
      ? Math.atan2(-(b[0] - a[0]), b[1] - a[1])
      : Math.atan2(b[1] - a[1], b[0] - a[0])
    return Math.atan2(Math.sin(raw - angle), Math.cos(raw - angle))
  }
  const horizontal = (lean(tl, tr, false) + lean(bl, br, false)) / 2
  const vertical = (lean(tl, bl, true) + lean(tr, br, true)) / 2
  return (
    Math.abs(horizontal) <= MAX_EDGE_PAIR_LEAN &&
    Math.abs(vertical) <= MAX_EDGE_PAIR_LEAN
  )
}

// Whether to read the face through `corners`: they must be consistent (see
// cornersConsistent), straightening through them must put the grid on the
// seams better than reading the turned square as it is - both read the same
// way, as quadrilaterals - and the straightened face must come out upright
// (no measurable tilt left, see estimateTilt), as it does for right corners.
export function acceptFaceCorners(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  found: GridAlignment,
  corners: [number, number][],
  gridSize: number,
): boolean {
  if (!cornersConsistent(corners, found.angle)) return false
  const size = Math.max(16, Math.round(found.size))
  const [cx, cy] = found.center,
    cos = Math.cos(found.angle),
    sin = Math.sin(found.angle),
    h = found.size / 2
  const turned: [number, number][] = [
    [-h, -h],
    [h, -h],
    [h, h],
    [-h, h],
  ].map(([dx, dy]) => [cx + cos * dx - sin * dy, cy + sin * dx + cos * dy])
  const straightened = warpQuadToSquare(data, width, height, corners, size)
  if (
    squareSeamScore(straightened, size, gridSize) <=
    squareSeamScore(
      warpQuadToSquare(data, width, height, turned, size),
      size,
      gridSize,
    )
  )
    return false
  return estimateTilt(straightened, size, size, { x: 0, y: 0, size }) === 0
}

// The face's corners (see estimateFaceCorners) where they pass acceptFaceCorners.
export function faceCornersIfBetter(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  found: GridAlignment,
  gridSize: number,
): [number, number][] | null {
  const corners = estimateFaceCorners(data, width, height, found, gridSize)
  return corners &&
    acceptFaceCorners(data, width, height, found, corners, gridSize)
    ? corners
    : null
}

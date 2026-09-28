// Where the sticker grid really sits inside the capture search area.
//
// Colors are sampled at fixed fractions of the face square, so a cube held
// a little off-center reads its neighbors' colors - and the tolerance is a
// fraction of one cell, i.e. 1/N of the face: a 4% offset misread 11% of a
// 7x7's stickers but ~2% of a 3x3's. First locate the outer face, then
// refine its grid using the dark seams between stickers.
//
// Seams are scored on 1-D strongest-channel profiles (column means for
// vertical seams, row means for horizontal ones), so shift and scale are
// searched per axis in a few hundred cheap evaluations - fast enough for the
// live preview. A face without dark seams (stickerless, washed out) finds no
// alignment that beats the guide, and the guide is kept. A tilted face is
// first measured (estimateTilt) and turned upright, then searched the same.
//
// Loops keep the TypeScript original's float steps and summation order, so
// results match it to the last bit.
module F64 = Pixels.F64

type faceSquare = {x: float, y: float, size: float}

type gridAlignment = {
  x: float,
  y: float,
  size: float,
  // Mean seam darkness (brightness levels, see brightestChannel) at the
  // chosen grid lines.
  score: float,
  // Whether the seams were convincing enough to move off the guide.
  aligned: bool,
  // Whether the returned square's grid lines sit on seams at all - true for
  // an aligned square, and for a kept guide that already fits.
  seams: bool,
  // Seams were found, but their outer lines do not bound a complete face.
  // The caller should ask for the cube to be re-centered instead of reading
  // it.
  needsRecentering?: bool,
  // Width of the outer rows and columns relative to the inner ones.
  outer: float,
  // In-plane tilt (radians, canvas rotate() direction) the square is turned
  // by about its center, and that center in the input's coordinates. x/y
  // are the square's corner before the turn, i.e. center - size / 2.
  angle: float,
  center: (float, float),
}

type corner = (float, float)

let clampInt = (value, low, high) => Math.Int.min(high, Math.Int.max(low, value))
let roundInt = value => Float.toInt(Math.round(value))
let minOf = values => values->Array.reduce(Float.Constants.positiveInfinity, Math.min)
let maxOf = values => values->Array.reduce(Float.Constants.negativeInfinity, Math.max)

// Tilts corrected, and the least worth turning the face upright for.
let maxTilt = 35.0 *. Math.Constants.pi /. 180.0
let minTilt = 1.5 *. Math.Constants.pi /. 180.0
// How much the edge directions must agree (0-1) to consider a tilt. Rounded
// sticker corners and a printed logo spread them: a real 5x5 turned about 4
// degrees agreed only 0.13. A weak tilt is kept only where its grid sits on
// the seams better than the upright one (see alignFace).
let minTiltCoherence = 0.1

// In-plane tilt of the face inside `square`, from the directions of its
// edges: a grid's seams and sticker borders run two ways 90 degrees apart,
// so gradient directions folded to 90 degrees (angle x 4 on the circle,
// weighted by strength) point at the tilt. 0 when the edges show no common
// direction, when the tilt is too small to matter, or beyond maxTilt, where
// rows and columns become ambiguous.
let estimateTilt = (data, width, height, square: faceSquare) => {
  // Luminance averaged over small blocks (~150 across the square): smooths
  // pixel staircases along tilted edges, which would pull the tilt toward
  // the pixel axes, and keeps this cheap.
  let block = Math.Int.max(1, roundInt(square.size /. 150.0))
  let x0 = Math.max(0.0, Math.round(square.x +. square.size *. 0.05))
  let y0 = Math.max(0.0, Math.round(square.y +. square.size *. 0.05))
  let blockF = Int.toFloat(block)
  let cols = Float.toInt(
    Math.floor(
      (Math.min(Int.toFloat(width), Math.round(square.x +. square.size *. 0.95)) -. x0) /. blockF,
    ),
  )
  let rows = Float.toInt(
    Math.floor(
      (Math.min(Int.toFloat(height), Math.round(square.y +. square.size *. 0.95)) -. y0) /. blockF,
    ),
  )
  if cols < 8 || rows < 8 {
    0.0
  } else {
    let x0 = Float.toInt(x0)
    let y0 = Float.toInt(y0)
    let grid = F64.make(cols * rows)
    for r in 0 to rows - 1 {
      for c in 0 to cols - 1 {
        let sum = ref(0.0)
        for y in y0 + r * block to y0 + (r + 1) * block - 1 {
          for x in x0 + c * block to x0 + (c + 1) * block - 1 {
            let i = (y * width + x) * 4
            sum :=
              sum.contents +.
              (0.2126 *. Int.toFloat(data->Pixels.get(i)) +.
              0.7152 *. Int.toFloat(data->Pixels.get(i + 1)) +.
              0.0722 *. Int.toFloat(data->Pixels.get(i + 2)))
          }
        }
        grid->F64.set(r * cols + c, sum.contents /. Int.toFloat(block * block))
      }
    }
    // One 3x3 box blur, then Scharr gradients - both keep the measured
    // direction from leaning toward the grid of blocks.
    let smooth = F64.make(cols * rows)
    for r in 1 to rows - 2 {
      for c in 1 to cols - 2 {
        let sum = ref(0.0)
        for dr in -1 to 1 {
          for dc in -1 to 1 {
            sum := sum.contents +. grid->F64.get((r + dr) * cols + c + dc)
          }
        }
        smooth->F64.set(r * cols + c, sum.contents /. 9.0)
      }
    }
    let at = (c, r) => smooth->F64.get(r * cols + c)
    let sin = ref(0.0)
    let cos = ref(0.0)
    let total = ref(0.0)
    for r in 2 to rows - 3 {
      for c in 2 to cols - 3 {
        let gx =
          3.0 *. (at(c + 1, r - 1) +. at(c + 1, r + 1) -. at(c - 1, r - 1) -. at(c - 1, r + 1)) +.
            10.0 *. (at(c + 1, r) -. at(c - 1, r))
        let gy =
          3.0 *. (at(c - 1, r + 1) +. at(c + 1, r + 1) -. at(c - 1, r - 1) -. at(c + 1, r - 1)) +.
            10.0 *. (at(c, r + 1) -. at(c, r - 1))
        let magnitude = Math.hypot(gx, gy)
        if magnitude >= 60.0 {
          let angle = 4.0 *. Math.atan2(~y=gy, ~x=gx)
          sin := sin.contents +. magnitude *. Math.sin(angle)
          cos := cos.contents +. magnitude *. Math.cos(angle)
          total := total.contents +. magnitude
        }
      }
    }
    if (
      total.contents == 0.0 ||
        Math.hypot(sin.contents, cos.contents) /. total.contents < minTiltCoherence
    ) {
      0.0
    } else {
      let tilt = Math.atan2(~y=sin.contents, ~x=cos.contents) /. 4.0
      Math.abs(tilt) < minTilt || Math.abs(tilt) > maxTilt ? 0.0 : tilt
    }
  }
}

// Big cubes have wider perimeter cubies: on real 6x6 and 7x7 faces the outer
// rows and columns measured 1.25-1.56x the inner ones, 5x5 up to 1.15x,
// 3x3/4x4 about even (1.0-1.1). cellEdges gives the grid lines of an N-cell
// face with the two outer cells `outer` times as wide as the inner ones.
let cellEdges = StickerGeometry.cellEdges

// Outer-cell ratios tried per cube size. 4x4 and smaller measured about
// even, and on their saved crops a ratio search only fit noise.
let outerRatios = gridSize => gridSize >= 5 ? [1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6] : [1.0]

// How far the face may sit from the guide: offsets up to this fraction of
// the guide size, and face sizes within scaleRange of it. Offsets also stay
// under half a cell: a grid shifted by a whole cell still has its inner
// lines on seams, so on a 7x7 (cells 14% of the face) a wider search slips
// by one row or column.
let alignmentMaxOffset = 0.15
let maxOffsetCells = 0.45
let defaultScaleRange = (0.8, 1.12)
let scaleStep = 0.01
// A seam must be this much darker (brightness levels) than the stickers on
// both sides, on average over the grid lines, to count as found...
let minSeamScore = 6.0
// ...and must beat the guide's own grid lines by this much to move it.
let minImprovement = 4.0
// A grid line counts as sitting on a seam at this darkness, and at least
// this fraction of the inner lines on each axis must - a grid that hits one
// seam by chance can still have a good mean.
let minLineDarkness = 4.0
let minLinesOnSeams = 0.75

// A pixel's strongest channel - how bright it is in its own color. Plain
// luminance put red (~76) and blue (~80) stickers below the grey-brown
// plastic between a real cube's tiles (~91), so a seam next to them was no
// dip at all and Detect face lost the whole row; in their strongest channel
// stickers stand at 200+ against the gap's ~100. Faint grey lines on a
// stickerless white face stay dips either way.
let brightestChannel = (data, index) =>
  Math.Int.max(
    data->Pixels.get(index),
    Math.Int.max(data->Pixels.get(index + 1), data->Pixels.get(index + 2)),
  )

// A turn about (cx, cy): profiles are then taken across the face as if it
// were upright, reading each point through the rotation.
type turn = {cx: float, cy: float, cos: float, sin: float}

// Mean brightestChannel of each column (vertical) or row over `from..to` of
// the other axis, averaging every `step`-th line - a mean loses nothing by
// skipping rows on a large guide.
let profile = (data, width, height, vertical, from, to, turn: option<turn>, step) => {
  let length = vertical ? width : height
  let out = F64.make(length)
  let start = Math.Int.max(0, roundInt(from))
  let end = Math.Int.min(vertical ? height : width, roundInt(to))
  let count = ref(0)
  let along = ref(start)
  while along.contents < end {
    for p in 0 to length - 1 {
      let x = vertical ? p : along.contents
      let y = vertical ? along.contents : p
      let index = switch turn {
      | None => (y * width + x) * 4
      | Some(turn) =>
        let dx = Int.toFloat(x) -. turn.cx
        let dy = Int.toFloat(y) -. turn.cy
        let x = clampInt(roundInt(turn.cx +. turn.cos *. dx -. turn.sin *. dy), 0, width - 1)
        let y = clampInt(roundInt(turn.cy +. turn.sin *. dx +. turn.cos *. dy), 0, height - 1)
        (y * width + x) * 4
      }
      out->F64.set(p, out->F64.get(p) +. Int.toFloat(brightestChannel(data, index)))
    }
    along := along.contents + step
    count := count.contents + 1
  }
  let divisor = Int.toFloat(Math.Int.max(1, count.contents))
  for p in 0 to length - 1 {
    out->F64.set(p, out->F64.get(p) /. divisor)
  }
  out
}

// values[min(length - 1, max(0, round(p)))], indexed by the float as the
// original did, so a NaN position reads undefined as before.
let sampleAt = (values, p) =>
  values->F64.getAt(Math.min(Int.toFloat(F64.length(values) - 1), Math.max(0.0, Math.round(p))))

// How much darker a seam at `position` is than the stickers either side:
// the mean over a small window centered on it, against the darker of the
// two sides 0.3 cells away. Positive only for a dark line between two
// brighter regions - a plain color step scores negative. A mean (not the
// darkest point) peaks when the line sits in the middle of a wide seam,
// which pins down the face size on 2x2 and 3x3 grids with few lines.
let seamDarkness = (values, position, cell) => {
  let window = Math.max(1.0, cell *. 0.03)
  let sum = ref(0.0)
  let count = ref(0)
  let p = ref(position -. window)
  while p.contents <= position +. window {
    sum := sum.contents +. sampleAt(values, p.contents)
    p := p.contents +. 1.0
    count := count.contents + 1
  }
  Math.min(sampleAt(values, position -. cell *. 0.3), sampleAt(values, position +. cell *. 0.3)) -.
  sum.contents /. Int.toFloat(count.contents)
}

// The face's outer edge need not be a dark line: a single-color stickerless
// face ends in a plain step to the background. A step measured just either
// side of `position` peaks right at the edge; capped so a high-contrast
// background cannot outweigh the seams inside the face.
let maxEdgeStep = 40.0
let edgeStep = (values, position, cell) =>
  Math.min(
    maxEdgeStep,
    Math.abs(
      sampleAt(values, position +. cell *. 0.05) -. sampleAt(values, position -. cell *. 0.05),
    ),
  )

type axisScore = {score: float, onSeams: float}

// Mean seam darkness over all N + 1 grid lines of one axis (at `edges`, see
// cellEdges), and the share of inner lines on a seam. The outer lines count
// half in the mean and may also be a plain edge (see edgeStep): the far side
// there is background, not a sticker. A 2x2's one inner line leaves only the
// outer lines to agree with it.
let axisScore = (values, offset, size, gridSize, edges) => {
  let edge = i => edges->Array.getUnsafe(i)
  // Seams are judged at the scale of an inner cell, the narrowest one.
  let cell = (gridSize >= 3 ? edge(2) -. edge(1) : 1.0 /. Int.toFloat(gridSize)) *. size
  let sum = ref(0.0)
  let hits = ref(0)
  for i in 0 to gridSize {
    let outer = i == 0 || i == gridSize
    let position = offset +. edge(i) *. size
    let darkness = outer
      ? Math.max(seamDarkness(values, position, cell), edgeStep(values, position, cell))
      : seamDarkness(values, position, cell)
    sum := sum.contents +. (outer ? 0.5 : 1.0) *. darkness
    if (outer ? gridSize == 2 : true) && darkness >= minLineDarkness {
      hits := hits.contents + 1
    }
  }
  let counted = gridSize == 2 ? 3 : gridSize - 1
  {
    score: sum.contents /. Int.toFloat(gridSize),
    onSeams: Int.toFloat(hits.contents) /. Int.toFloat(counted),
  }
}

type upright = {
  x: float,
  y: float,
  size: float,
  score: float,
  aligned: bool,
  seams: bool,
  outer: float,
}

type layout = {outer: float, edges: array<float>}

let searchUpright = (
  data,
  width,
  height,
  guide: faceSquare,
  gridSize,
  turn,
  (lowScale, highScale),
) => {
  // Profiles span the middle of the guide on the other axis, which stays on
  // the face even when it is offset.
  let lines = Math.Int.max(1, roundInt(guide.size /. 300.0))
  let columns = profile(
    data,
    width,
    height,
    true,
    guide.y +. guide.size *. 0.2,
    guide.y +. guide.size *. 0.8,
    turn,
    lines,
  )
  let rows = profile(
    data,
    width,
    height,
    false,
    guide.x +. guide.size *. 0.2,
    guide.x +. guide.size *. 0.8,
    turn,
    lines,
  )
  let layouts =
    outerRatios(gridSize)->Array.map(outer => {outer, edges: cellEdges(gridSize, outer)})
  // The guide as it is, with its best-fitting outer-cell ratio. It counts as
  // a grid only with its lines on seams, as a moved square must: a 2x2
  // outline's edges alone scored enough with no inner seam.
  let stayScore = ref(Float.Constants.negativeInfinity)
  let stayOuter = ref(1.0)
  let stayOnSeams = ref(false)
  layouts->Array.forEach(({outer, edges}) => {
    let x = axisScore(columns, guide.x, guide.size, gridSize, edges)
    let y = axisScore(rows, guide.y, guide.size, gridSize, edges)
    let score = (x.score +. y.score) /. 2.0
    if score > stayScore.contents {
      stayScore := score
      stayOuter := outer
      stayOnSeams := x.onSeams >= minLinesOnSeams && y.onSeams >= minLinesOnSeams
    }
  })

  // Offsets stay under half of the narrowest (inner) cell.
  let maxOffset =
    guide.size *. Math.min(alignmentMaxOffset, maxOffsetCells /. Int.toFloat(gridSize))
  let step = Math.max(1.0, guide.size /. 200.0)
  let best = ref({
    x: guide.x,
    y: guide.y,
    size: guide.size,
    score: stayScore.contents,
    aligned: false,
    seams: false,
    outer: stayOuter.contents,
  })
  let scale = ref(lowScale)
  while scale.contents <= highScale +. 1e-9 {
    let size = guide.size *. scale.contents
    let centered = (guide.size -. size) /. 2.0
    layouts->Array.forEach(({outer, edges}) => {
      let bestOffset = (values, origin) => {
        let topOffset = ref(origin +. centered)
        let topScore = ref(Float.Constants.negativeInfinity)
        let shift = ref(-.maxOffset)
        while shift.contents <= maxOffset {
          let offset = origin +. centered +. shift.contents
          let {score, onSeams} = axisScore(values, offset, size, gridSize, edges)
          if onSeams >= minLinesOnSeams && score > topScore.contents {
            topOffset := offset
            topScore := score
          }
          shift := shift.contents +. step
        }
        (topOffset.contents, topScore.contents)
      }
      let (x, xScore) = bestOffset(columns, guide.x)
      let (y, yScore) = bestOffset(rows, guide.y)
      let score = (xScore +. yScore) /. 2.0
      if score > best.contents.score {
        best := {x, y, size, score, aligned: true, seams: false, outer}
      }
    })
    scale := scale.contents +. scaleStep
  }

  let best = best.contents
  if (
    !best.aligned || best.score < minSeamScore || best.score -. stayScore.contents < minImprovement
  ) {
    let seams = stayScore.contents >= minSeamScore && stayOnSeams.contents
    {
      x: guide.x,
      y: guide.y,
      size: guide.size,
      score: stayScore.contents,
      aligned: false,
      seams,
      outer: seams ? stayOuter.contents : 1.0,
    }
  } else {
    {...best, seams: true}
  }
}

// Finds the face square whose grid lines best match dark seams, within
// alignmentMaxOffset and the scale range of `guide` and turned by `angle`
// (see estimateTilt). `data` is an RGBA region (width x height) containing
// the guide plus a margin around it.
let findGridAlignment = (data, width, height, guide: faceSquare, gridSize, angle, scaleRange) => {
  let cx = guide.x +. guide.size /. 2.0
  let cy = guide.y +. guide.size /. 2.0
  let turn =
    angle != 0.0 && !Float.isNaN(angle)
      ? Some({cx, cy, cos: Math.cos(angle), sin: Math.sin(angle)})
      : None
  let found = searchUpright(data, width, height, guide, gridSize, turn, scaleRange)
  // Back from the upright copy: turn the square's center about the guide's.
  let ux = found.x +. found.size /. 2.0 -. cx
  let uy = found.y +. found.size /. 2.0 -. cy
  let centerX = cx +. Math.cos(angle) *. ux -. Math.sin(angle) *. uy
  let centerY = cy +. Math.sin(angle) *. ux +. Math.cos(angle) *. uy
  {
    x: centerX -. found.size /. 2.0,
    y: centerY -. found.size /. 2.0,
    size: found.size,
    score: found.score,
    aligned: found.aligned,
    seams: found.seams,
    outer: found.outer,
    angle,
    center: (centerX, centerY),
  }
}

let hypot3 = (a, b, c) => Math.hypotMany([a, b, c])

// A one-cell-shifted grid can score strongly on inner seams while an outer
// line sits in the backdrop. Compare pixels just inside and outside each
// candidate edge. One missing side beside a strong side is evidence that
// the fitted seams do not bound the whole face. All-weak outlines are left
// alone so faint stickerless grids can still be read.
let missingFaceEdge = (data, width, height, found: gridAlignment) => {
  let half = found.size /. 2.0
  let inset = found.size *. 0.025
  let cos = Math.cos(found.angle)
  let sin = Math.sin(found.angle)
  let (centerX, centerY) = found.center
  let pixel = (u, v) => {
    let x = roundInt(centerX +. cos *. u -. sin *. v)
    let y = roundInt(centerY +. sin *. u +. cos *. v)
    if x < 0 || x >= width || y < 0 || y >= height {
      None
    } else {
      let i = (y * width + x) * 4
      Some((data->Pixels.get(i), data->Pixels.get(i + 1), data->Pixels.get(i + 2)))
    }
  }
  let contrast = (a, b) =>
    switch (a, b) {
    | (Some((ar, ag, ab)), Some((br, bg, bb))) =>
      hypot3(Int.toFloat(ar - br), Int.toFloat(ag - bg), Int.toFloat(ab - bb))
    | _ => 0.0
    }
  let sides = [0, 1, 2, 3]->Array.map(side => {
    let sum = ref(0.0)
    for i in 0 to 9 {
      let along = ((Int.toFloat(i) +. 0.5) /. 10.0 -. 0.5) *. found.size
      sum :=
        sum.contents +.
        switch side {
        | 0 => contrast(pixel(-.half -. inset, along), pixel(-.half +. inset, along))
        | 1 => contrast(pixel(half -. inset, along), pixel(half +. inset, along))
        | 2 => contrast(pixel(along, -.half -. inset), pixel(along, -.half +. inset))
        | _ => contrast(pixel(along, half -. inset), pixel(along, half +. inset))
        }
    }
    sum.contents /. 10.0
  })
  minOf(sides) < 5.0 && maxOf(sides) > 30.0
}

// A sparse perimeter scan supplies an approximate square, independent of
// sticker count. It compares points just inside and outside all four edges;
// a complete outline wins over an inner seam or a single background edge.
let locateFaceOutline = (data, width, height, guide: faceSquare) => {
  let index = (x, y) => (roundInt(y) * width + roundInt(x)) * 4
  let channel = (i, c) => Int.toFloat(data->Pixels.get(i + c))
  let difference = (ax, ay, bx, by) => {
    let a = index(ax, ay)
    let b = index(bx, by)
    hypot3(
      channel(a, 0) -. channel(b, 0),
      channel(a, 1) -. channel(b, 1),
      channel(a, 2) -. channel(b, 2),
    )
  }
  let widthF = Int.toFloat(width)
  let heightF = Int.toFloat(height)
  let cx = guide.x +. guide.size /. 2.0
  let cy = guide.y +. guide.size /. 2.0
  // The 40 points just outside the edges, as pixel indexes.
  let outside = Array.make(~length=40, 0)
  let best = ref(None)
  let scale = ref(0.7)
  while scale.contents <= 1.3 +. 1e-9 {
    let size = guide.size *. scale.contents
    let inset = size *. 0.025
    let ox = ref(-0.22)
    while ox.contents <= 0.22 +. 1e-9 {
      let x = cx +. ox.contents *. guide.size -. size /. 2.0
      if !(x -. inset < 0.0 || x +. size +. inset >= widthF) {
        let oy = ref(-0.22)
        while oy.contents <= 0.22 +. 1e-9 {
          let y = cy +. oy.contents *. guide.size -. size /. 2.0
          if !(y -. inset < 0.0 || y +. size +. inset >= heightF) {
            let left = ref(0.0)
            let right = ref(0.0)
            let top = ref(0.0)
            let bottom = ref(0.0)
            for sample in 0 to 9 {
              let t = (Int.toFloat(sample) +. 0.5) /. 10.0
              let sx = x +. t *. size
              let sy = y +. t *. size
              outside->Array.setUnsafe(sample * 4, index(x -. inset, sy))
              outside->Array.setUnsafe(sample * 4 + 1, index(x +. size +. inset, sy))
              outside->Array.setUnsafe(sample * 4 + 2, index(sx, y -. inset))
              outside->Array.setUnsafe(sample * 4 + 3, index(sx, y +. size +. inset))
              left := left.contents +. difference(x -. inset, sy, x +. inset, sy)
              right := right.contents +. difference(x +. size -. inset, sy, x +. size +. inset, sy)
              top := top.contents +. difference(sx, y -. inset, sx, y +. inset)
              bottom :=
                bottom.contents +. difference(sx, y +. size -. inset, sx, y +. size +. inset)
            }
            // A face has four edges. Penalize candidates explaining only one
            // or two strong lines, common with furniture and internal grid
            // seams.
            let weakest =
              Math.min(
                Math.min(Math.min(left.contents, right.contents), top.contents),
                bottom.contents,
              ) /. 10.0
            // The spread of the outside colors, summed in the original's
            // order: per channel for the mean, per point for the deviations.
            let mean = c => {
              let sum = ref(0.0)
              for k in 0 to 39 {
                sum := sum.contents +. channel(outside->Array.getUnsafe(k), c)
              }
              sum.contents /. 40.0
            }
            let m0 = mean(0)
            let m1 = mean(1)
            let m2 = mean(2)
            let deviations = ref(0.0)
            for k in 0 to 39 {
              let i = outside->Array.getUnsafe(k)
              deviations :=
                deviations.contents +.
                (0.0 +.
                (channel(i, 0) -. m0) ** 2.0 +.
                (channel(i, 1) -. m1) ** 2.0 +.
                (channel(i, 2) -. m2) ** 2.0)
            }
            let spread = Math.sqrt(deviations.contents /. 40.0)
            let score =
              (0.0 +. left.contents +. right.contents +. top.contents +. bottom.contents) /. 40.0 +.
              weakest -.
              spread +.
              150.0 *. scale.contents
            // Only a higher score replaces the best: a candidate reading
            // past the frame scores NaN and never does.
            let better = switch best.contents {
            | Some((_, bestScore)) => score > bestScore
            | None => true
            }
            if better {
              best := Some(({x, y, size}, score))
            }
          }
          oy := oy.contents +. 0.025
        }
      }
      ox := ox.contents +. 0.025
    }
    scale := scale.contents +. 0.03
  }
  switch best.contents {
  | Some((square, score)) if score >= 45.0 +. 150.0 *. (square.size /. guide.size) => Some(square)
  | _ => None
  }
}

// Tilt, position and size of the face around `guide`: the measured tilt is
// kept only when a grid shows up under it. Edge directions alone can point
// at a tilt in anything striped; then the face is searched upright.
let alignFace = (data, width, height, guide, gridSize) => {
  let checked = (found: gridAlignment) =>
    gridSize >= 6 && found.seams && missingFaceEdge(data, width, height, found)
      ? {...found, seams: false, aligned: false, needsRecentering: true}
      : found
  // The perimeter fixes the grid origin before the seam search. Searching
  // seams from the fixed guide alone can land one whole cell off on 7x7.
  let coarse = locateFaceOutline(data, width, height, guide)
  let searchGuide = coarse->Option.getOr(guide)
  // The outline can take in a clear shell's rim and the fingers holding it
  // (20% too big on a solved GoCube), so on 2x2-4x4 the seams may shrink it
  // by up to most of a cell - no more, or the grid could slip by a whole
  // cell - but barely grow it: a face never reaches past its outline. From
  // 5x5 up the outer cells' width varies too (see outerRatios), and a
  // smaller square with wider outer cells fits the same inner seams.
  let minScale = gridSize <= 4 ? 1.0 -. 0.8 /. Int.toFloat(gridSize) : 0.92
  let scaleRange = coarse->Option.isSome ? (minScale, 1.08) : defaultScaleRange
  let alignedIfCoarse = (found: gridAlignment) =>
    coarse->Option.isSome ? {...found, aligned: true} : found
  let angle = estimateTilt(data, width, height, searchGuide)
  let aligned = findGridAlignment(data, width, height, searchGuide, gridSize, 0.0, scaleRange)
  // The tilt must beat reading the face upright, not merely find seams:
  // round stickers can suggest a tilt that isn't there.
  let tilted =
    angle != 0.0
      ? Some(findGridAlignment(data, width, height, searchGuide, gridSize, angle, scaleRange))
      : None
  switch tilted {
  | Some(tilted) if tilted.seams && (!aligned.seams || tilted.score > aligned.score) =>
    checked(alignedIfCoarse(tilted))
  | _ =>
    if aligned.seams {
      checked(alignedIfCoarse(aligned))
    } else if coarse->Option.isNone {
      aligned
    } else {
      checked(findGridAlignment(data, width, height, guide, gridSize, 0.0, defaultScaleRange))
    }
  }
}

// The outer-cell ratio of a face that already fills `data` (an aligned
// crop): the layout whose grid lines sit best on dark seams, or 1 when no
// layout shows convincing seams.
let estimateOuterCellRatio = (data, width, height, gridSize) => {
  let layouts = outerRatios(gridSize)
  if Array.length(layouts) == 1 {
    1.0
  } else {
    let widthF = Int.toFloat(width)
    let heightF = Int.toFloat(height)
    let columns = profile(data, width, height, true, heightF *. 0.2, heightF *. 0.8, None, 1)
    let rows = profile(data, width, height, false, widthF *. 0.2, widthF *. 0.8, None, 1)
    let bestScore = ref(Float.Constants.negativeInfinity)
    let bestOuter = ref(1.0)
    let even = ref(Float.Constants.negativeInfinity)
    layouts->Array.forEach(outer => {
      let edges = cellEdges(gridSize, outer)
      let score =
        (axisScore(columns, 0.0, widthF, gridSize, edges).score +.
        axisScore(rows, 0.0, heightF, gridSize, edges).score) /. 2.0
      if outer == 1.0 {
        even := score
      }
      if score > bestScore.contents {
        bestScore := score
        bestOuter := outer
      }
    })
    bestScore.contents >= minSeamScore && bestScore.contents -. even.contents >= minImprovement
      ? bestOuter.contents
      : 1.0
  }
}

// The face's four corners (top-left, top-right, bottom-right, bottom-left,
// in `data`'s pixels) when it is seen at an angle, else null. Starting from
// the aligned square `found` (turned by its angle), each grid line is found
// twice: vertical ones in a band near the top and near the bottom,
// horizontal ones near the left and right. Joined up they give each line's
// slope, and the outer lines cross at the corners. Null when the corners
// form a square already (sides and diagonals within minSkew of each other)
// or are implausible (a corner beyond maxCornerShift of the aligned
// square's).
let minSkew = 0.02
let maxCornerShift = 0.3

type line = {slope: float, offset: float}

let estimateFaceCorners = (data, width, height, found: gridAlignment, gridSize) => {
  let size = found.size
  let (cx, cy) = found.center
  let x = cx -. size /. 2.0
  let y = cy -. size /. 2.0
  let turn = {cx, cy, cos: Math.cos(found.angle), sin: Math.sin(found.angle)}
  let edges = cellEdges(gridSize, found.outer)
  let edge = i => edges->Array.getUnsafe(i)
  let cell = size /. Int.toFloat(gridSize)
  let lines = Math.Int.max(1, roundInt(size /. 300.0))
  let bands = [0.1, 0.3, 0.7, 0.9]
  let band = i => bands->Array.getUnsafe(i)
  // Position of each grid line in one band's profile. Inner lines are
  // searched around where the square puts them; each outer line around
  // where its inner neighbours extrapolate it to (the square itself can be
  // off on a face seen at an angle), and may be a plain edge (see
  // edgeStep). Every line sits where it is darkest against the sticker next
  // to it. An outer line is compared with its inner side only: the
  // background beyond it can be anything, and edge steps vary with each
  // sticker's brightness, which tilted the edges between bands.
  let search = (values, predicted, side) => {
    let window = Math.max(1.0, cell *. 0.03)
    let bestAt = ref(predicted)
    let bestScore = ref(Float.Constants.negativeInfinity)
    let p = ref(predicted -. cell *. 0.3)
    while p.contents <= predicted +. cell *. 0.3 {
      let p' = p.contents
      let sum = ref(0.0)
      let count = ref(0)
      let q = ref(p' -. window)
      while q.contents <= p' +. window {
        sum := sum.contents +. sampleAt(values, q.contents)
        q := q.contents +. 1.0
        count := count.contents + 1
      }
      let inside =
        side == 0
          ? Math.min(sampleAt(values, p' -. cell *. 0.3), sampleAt(values, p' +. cell *. 0.3))
          : sampleAt(values, p' -. Int.toFloat(side) *. cell *. 0.3)
      let score = inside -. sum.contents /. Int.toFloat(count.contents)
      if score > bestScore.contents {
        bestAt := p'
        bestScore := score
      }
      p := p' +. 0.5
    }
    bestAt.contents
  }
  let positions = (values, origin) => {
    let at =
      edges->Array.mapWithIndex((edge, i) =>
        i == 0 || i == gridSize ? Float.Constants.nan : search(values, origin +. edge *. size, 0)
      )
    let get = i => at->Array.getUnsafe(i)
    let ratio = (i, j, k) => (edge(i) -. edge(j)) /. (edge(k) -. edge(j))
    // Outer lines from the two nearest inner lines (a 2x2 has only one).
    let first = gridSize > 2 ? get(1) +. (get(2) -. get(1)) *. ratio(0, 1, 2) : origin
    let last =
      gridSize > 2
        ? get(gridSize - 1) +.
          (get(gridSize - 2) -. get(gridSize - 1)) *. ratio(gridSize, gridSize - 1, gridSize - 2)
        : origin +. size
    at->Array.setUnsafe(0, search(values, first, -1))
    at->Array.setUnsafe(gridSize, search(values, last, 1))
    at
  }
  let across = vertical => {
    let origin = vertical ? x : y
    let start = vertical ? y : x
    let near = profile(
      data,
      width,
      height,
      vertical,
      start +. size *. band(0),
      start +. size *. band(1),
      Some(turn),
      lines,
    )
    let far = profile(
      data,
      width,
      height,
      vertical,
      start +. size *. band(2),
      start +. size *. band(3),
      Some(turn),
      lines,
    )
    let a = start +. size *. (band(0) +. band(1)) /. 2.0
    let b = start +. size *. (band(2) +. band(3)) /. 2.0
    let p = positions(near, origin)
    let q = positions(far, origin)
    // Each line as position = offset + slope * (coordinate along it).
    edges->Array.mapWithIndex((_, i) => {
      let pi = p->Array.getUnsafe(i)
      let qi = q->Array.getUnsafe(i)
      {slope: (qi -. pi) /. (b -. a), offset: pi -. (qi -. pi) /. (b -. a) *. a}
    })
  }
  let columns = across(true)
  let rows = across(false)
  // Outer lines crossing: x = c.offset + c.slope * y and y = r.offset +
  // r.slope * x.
  let meet = (c, r) => {
    let ux = (c.offset +. c.slope *. r.offset) /. (1.0 -. c.slope *. r.slope)
    (ux, r.offset +. r.slope *. ux)
  }
  let column = i => columns->Array.getUnsafe(i)
  let row = i => rows->Array.getUnsafe(i)
  let upright = [
    meet(column(0), row(0)),
    meet(column(gridSize), row(0)),
    meet(column(gridSize), row(gridSize)),
    meet(column(0), row(gridSize)),
  ]
  let square = [(x, y), (x +. size, y), (x +. size, y +. size), (x, y +. size)]
  let shift = maxOf(
    upright->Array.mapWithIndex(((ux, uy), i) => {
      let (sx, sy) = square->Array.getUnsafe(i)
      Math.hypot(ux -. sx, uy -. sy)
    }),
  )
  if shift > size *. maxCornerShift {
    Null.null
  } else {
    let length = (i, j) => {
      let (ix, iy) = upright->Array.getUnsafe(i)
      let (jx, jy) = upright->Array.getUnsafe(j)
      Math.hypot(ix -. jx, iy -. jy)
    }
    let sides = [length(0, 1), length(1, 2), length(2, 3), length(3, 0)]
    let side = sides->Array.reduce(0.0, (sum, value) => sum +. value) /. 4.0
    let skew = maxOf(
      [
        ...sides->Array.map(value => Math.abs(value -. side) /. side),
        Math.abs(length(0, 2) -. length(1, 3)) /. (side *. Math.Constants.sqrt2),
      ],
    )
    if skew < minSkew {
      Null.null
    } else {
      // Back from the upright view into `data`'s pixels.
      Null.make(
        upright->Array.map(((ux, uy)) => (
          cx +. turn.cos *. (ux -. cx) -. turn.sin *. (uy -. cy),
          cy +. turn.sin *. (ux -. cx) +. turn.cos *. (uy -. cy),
        )),
      )
    }
  }
}

// How well a square face image's grid lines sit on seams: the mean
// axisScore over both axes, at the outer-cell ratio that fits it best - a
// face read at an angle and the same face straightened need different ones.
let squareSeamScore = (square, size, gridSize) => {
  let sizeF = Int.toFloat(size)
  let columns = profile(square, size, size, true, sizeF *. 0.2, sizeF *. 0.8, None, 1)
  let rows = profile(square, size, size, false, sizeF *. 0.2, sizeF *. 0.8, None, 1)
  maxOf(
    outerRatios(gridSize)->Array.map(outer => {
      let edges = cellEdges(gridSize, outer)
      (axisScore(columns, 0.0, sizeF, gridSize, edges).score +.
      axisScore(rows, 0.0, sizeF, gridSize, edges).score) /. 2.0
    }),
  )
}

// Opposite edges of a face seen at an angle converge in step: turned about
// one axis, one edge leans one way and its opposite about as far the other,
// so each pair averages out to the face's own tilt (`angle`). A pair whose
// average leans more than maxEdgePairLean has one wrong edge - on a real
// capture the top edge caught a dark band above the face (-12 degrees
// against the face while the bottom leaned -2, a pair average of -7). Real
// perspective is not perfectly symmetric: a strongly turned face that is
// also tilted averaged about -4.4.
let maxEdgePairLean = 6.0 *. Math.Constants.pi /. 180.0

let cornersConsistent = (corners: array<corner>, angle) => {
  let corner = i => corners->Array.getUnsafe(i)
  let lean = ((ax, ay), (bx, by), vertical) => {
    let raw = vertical
      ? Math.atan2(~y=-.(bx -. ax), ~x=by -. ay)
      : Math.atan2(~y=by -. ay, ~x=bx -. ax)
    Math.atan2(~y=Math.sin(raw -. angle), ~x=Math.cos(raw -. angle))
  }
  let horizontal = (lean(corner(0), corner(1), false) +. lean(corner(3), corner(2), false)) /. 2.0
  let vertical = (lean(corner(0), corner(3), true) +. lean(corner(1), corner(2), true)) /. 2.0
  Math.abs(horizontal) <= maxEdgePairLean && Math.abs(vertical) <= maxEdgePairLean
}

// Whether to read the face through `corners`: they must be consistent (see
// cornersConsistent), straightening through them must put the grid on the
// seams better than reading the turned square as it is - both read the same
// way, as quadrilaterals - and the straightened face must come out upright
// (no measurable tilt left, see estimateTilt), as it does for right corners.
let acceptFaceCorners = (data, width, height, found: gridAlignment, corners, gridSize) =>
  cornersConsistent(corners, found.angle) && {
    let size = Math.Int.max(16, roundInt(found.size))
    let (cx, cy) = found.center
    let cos = Math.cos(found.angle)
    let sin = Math.sin(found.angle)
    let h = found.size /. 2.0
    let turned =
      [(-.h, -.h), (h, -.h), (h, h), (-.h, h)]->Array.map(((dx, dy)) => (
        cx +. cos *. dx -. sin *. dy,
        cy +. sin *. dx +. cos *. dy,
      ))
    let straightened = Perspective.warpQuadToSquare(data, width, height, corners, size)
    squareSeamScore(straightened, size, gridSize) >
    squareSeamScore(
      Perspective.warpQuadToSquare(data, width, height, turned, size),
      size,
      gridSize,
    ) && estimateTilt(straightened, size, size, {x: 0.0, y: 0.0, size: Int.toFloat(size)}) == 0.0
  }

// The face's corners (see estimateFaceCorners) where they pass
// acceptFaceCorners.
let faceCornersIfBetter = (data, width, height, found, gridSize) =>
  switch Null.toOption(estimateFaceCorners(data, width, height, found, gridSize)) {
  | Some(corners) if acceptFaceCorners(data, width, height, found, corners, gridSize) =>
    Null.make(corners)
  | _ => Null.null
  }

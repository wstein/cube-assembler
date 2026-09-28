// Reading a face's sticker colors from its pixels, and the checks that a
// cube face is there at all. Canvases and images stay with the TypeScript
// caller; these work on raw RGBA pixels, so they also run on decoded photos
// in tests.
type rgb = StickerGeometry.rgb = {r: float, g: float, b: float}
type colorDetection = Recalibration.colorDetection

// A pixel's color as floats; `index` may be past the buffer, which reads
// undefined as in the original.
let colorAt = (data, index) => (
  data->Pixels.getAt(index),
  data->Pixels.getAt(index +. 1.0),
  data->Pixels.getAt(index +. 2.0),
)

let clampF = (value, low, high) => Math.min(high, Math.max(low, value))

// The pixels of `rect` (clipped to the face).
let samplePixels = (data, faceWidth, faceHeight, rect: StickerGeometry.rect) => {
  let pixels = []
  let x0 = Math.round(rect.x)
  let y0 = Math.round(rect.y)
  let x1 = x0 +. Math.round(rect.width)
  let y1 = y0 +. Math.round(rect.height)
  let y = ref(y0)
  while y.contents < y1 {
    let x = ref(x0)
    while x.contents < x1 {
      let px = x.contents
      let py = y.contents
      if px >= 0.0 && px < faceWidth && py >= 0.0 && py < faceHeight {
        let (r, g, b) = colorAt(data, (py *. faceWidth +. px) *. 4.0)
        pixels->Array.push({r, g, b})
      }
      x := px +. 1.0
    }
    y := y.contents +. 1.0
  }
  pixels
}

// The per-sticker sampling and classification on pixels that already cover
// exactly the face region to sample (a saved fixture photo is already the
// cropped region, per cropFaceRegionToDataUrl).
let extractColorsFromImageData = (
  data,
  faceWidth,
  faceHeight,
  gridSize,
  gains,
  sampling: StickerGeometry.samplingGeometry,
  palette: option<Dict.t<rgb>>,
): colorDetection => {
  // Big cubes' perimeter cubies are wider; sample the layout this face
  // shows.
  let outerCellRatio = GridAlignment.estimateOuterCellRatio(
    data,
    Float.toInt(faceWidth),
    Float.toInt(faceHeight),
    gridSize,
  )
  let colors = []
  let cellConfidences = []
  let cellColors = []
  let centerColor = ref(None)
  let totalConfidence = ref(0.0)
  let middle = (gridSize - 1) / 2
  for row in 0 to gridSize - 1 {
    let rowColors = []
    let rowConfidences = []
    let rowRGB = []
    for col in 0 to gridSize - 1 {
      // Sample only the cell's core, ignoring a dead zone around its
      // border: sticker edges are where gap-line bleed, glare off the
      // plastic bezel, and slight grid misalignment are most likely to
      // contaminate the average.
      let rect = StickerGeometry.stickerSampleRect(
        row,
        col,
        gridSize,
        faceWidth,
        faceHeight,
        sampling,
        outerCellRatio,
      )
      let pixels = samplePixels(data, faceWidth, faceHeight, rect)
      switch Null.toOption(FaceSampling.stickerColor(pixels)) {
      | Some(measured) =>
        let avgColor = ColorMath.applyGains(measured, gains)
        rowRGB->Array.push(avgColor)
        let judged = if mod(gridSize, 2) == 1 && gridSize >= 3 && row == middle && col == row {
          let logoSafe = FaceSampling.centerStickerColor(
            samplePixels(
              data,
              faceWidth,
              faceHeight,
              StickerGeometry.stickerSampleRect(
                row,
                col,
                gridSize,
                faceWidth,
                faceHeight,
                {stickerCore: Math.max(sampling.stickerCore, FaceSampling.centerCore)},
                outerCellRatio,
              ),
            ),
          )
          switch Null.toOption(logoSafe) {
          | Some(logoSafe) =>
            let center = ColorMath.applyGains(logoSafe, gains)
            centerColor := Some(center)
            center
          | None => avgColor
          }
        } else {
          avgColor
        }
        let {color, confidence} = ColorMath.classifySticker(judged, palette)
        rowColors->Array.push(color)
        rowConfidences->Array.push(confidence)
        totalConfidence := totalConfidence.contents +. confidence
      | None =>
        rowRGB->Array.push({r: 255.0, g: 255.0, b: 255.0})
        rowColors->Array.push("W")
        rowConfidences->Array.push(0.0)
      }
    }
    colors->Array.push(rowColors)
    cellConfidences->Array.push(rowConfidences)
    cellColors->Array.push(rowRGB)
  }
  let confidence = Math.min(1.0, totalConfidence.contents /. Int.toFloat(gridSize * gridSize))
  let result: colorDetection = {colors, confidence, cellConfidences, cellColors}
  let result = outerCellRatio != 1.0 ? {...result, outerCellRatio} : result
  switch centerColor.contents {
  | Some(centerColor) => {...result, centerColor}
  | None => result
  }
}

// A cropped face can be one solid color, so seams are optional when the
// uncropped camera frame shows the cube's outer silhouette instead.
// `outerCellRatio` widens the outer rows and columns (see cellEdges).
let hasCoherentStickerInteriors = (data, width, height, gridSize, outerCellRatio) =>
  if gridSize < 2 || width < Int.toFloat(gridSize * 8) || height < Int.toFloat(gridSize * 8) {
    false
  } else {
    let edges = StickerGeometry.cellEdges(gridSize, outerCellRatio)
    let edge = i => edges->Array.getUnsafe(i)
    let coherentCells = ref(0)
    for row in 0 to gridSize - 1 {
      for col in 0 to gridSize - 1 {
        let samples = []
        let cellW = (edge(col + 1) -. edge(col)) *. width
        let cellH = (edge(row + 1) -. edge(row)) *. height
        let centerX = (edge(col) +. edge(col + 1)) /. 2.0 *. width
        let centerY = (edge(row) +. edge(row + 1)) /. 2.0 *. height
        for dy in -2 to 2 {
          for dx in -2 to 2 {
            let x = Math.round(centerX +. Int.toFloat(dx) *. 0.1 *. cellW)
            let y = Math.round(centerY +. Int.toFloat(dy) *. 0.1 *. cellH)
            let index = (Math.min(height -. 1.0, y) *. width +. Math.min(width -. 1.0, x)) *. 4.0
            samples->Array.push(colorAt(data, index))
          }
        }
        let count = Int.toFloat(Array.length(samples))
        let (m0, m1, m2) =
          samples->Array.reduce((0.0, 0.0, 0.0), ((s0, s1, s2), (r, g, b)) => (
            s0 +. r,
            s1 +. g,
            s2 +. b,
          ))
        let m0 = m0 /. count
        let m1 = m1 /. count
        let m2 = m2 /. count
        let deviation =
          samples->Array.reduce(0.0, (sum, (r, g, b)) =>
            sum +. (0.0 +. Math.abs(r -. m0) +. Math.abs(g -. m1) +. Math.abs(b -. m2)) /. 3.0
          ) /. count
        if deviation <= 35.0 {
          coherentCells := coherentCells.contents + 1
        }
      }
    }
    Int.toFloat(coherentCells.contents) >= Math.ceil(Int.toFloat(gridSize * gridSize) *. 0.6)
  }

let luminanceAt = (data, width, height, x, y) => {
  let index =
    (clampF(Math.round(y), 0.0, height -. 1.0) *. width +.
      clampF(Math.round(x), 0.0, width -. 1.0)) *. 4.0
  0.2126 *. data->Pixels.getAt(index) +.
  0.7152 *. data->Pixels.getAt(index +. 1.0) +.
  0.0722 *. data->Pixels.getAt(index +. 2.0)
}

let clampedColorAt = (data, width, height, x, y) =>
  colorAt(
    data,
    (clampF(Math.round(y), 0.0, height -. 1.0) *. width +.
      clampF(Math.round(x), 0.0, width -. 1.0)) *. 4.0,
  )

let colorDistance = ((ar, ag, ab), (br, bg, bb)) =>
  (Math.abs(ar -. br) +. Math.abs(ag -. bg) +. Math.abs(ab -. bb)) /. 3.0

// The classifier assigns a color even to a wall. Look for repeated sticker
// seams, allowing for small perspective/framing offsets around each
// expected boundary. Room edges can occasionally imitate seams, so Detect
// face also requires the outer face boundary in the full camera frame.
let hasPlausibleStickerFace = (data, width, height, gridSize, outerCellRatio) =>
  hasCoherentStickerInteriors(data, width, height, gridSize, outerCellRatio) && {
    let edges = StickerGeometry.cellEdges(gridSize, outerCellRatio)
    let xs = edges->Array.map(edge => edge *. width)
    let ys = edges->Array.map(edge => edge *. height)
    let line = (lines, i) => lines->Array.getUnsafe(i)
    // Size of the narrower cell on either side of grid line i.
    let narrower = (lines, i) =>
      Math.min(line(lines, i) -. line(lines, i - 1), line(lines, i + 1) -. line(lines, i))
    let luminance = (x, y) => luminanceAt(data, width, height, x, y)
    let segmentHasSeam = (vertical, boundary, segment) => {
      let acrossLines = vertical ? xs : ys
      let alongLines = vertical ? ys : xs
      let across = narrower(acrossLines, boundary)
      let along = line(alongLines, segment + 1) -. line(alongLines, segment)
      let edge = line(acrossLines, boundary)
      let center = (line(alongLines, segment) +. line(alongLines, segment + 1)) /. 2.0
      let read = (distance, offset) =>
        vertical
          ? luminance(edge +. distance, center +. offset)
          : luminance(center +. offset, edge +. distance)
      let near = ref(0.0)
      let far = ref(0.0)
      for i in -2 to 2 {
        let offset = Int.toFloat(i) *. along *. 0.07
        near := near.contents +. read(-.across *. 0.38, offset)
        far := far.contents +. read(across *. 0.38, offset)
      }
      let darkest = ref(Float.Constants.positiveInfinity)
      for shift in -4 to 4 {
        let seam = ref(0.0)
        for i in -2 to 2 {
          let offset = Int.toFloat(i) *. along *. 0.07
          seam := seam.contents +. read(Int.toFloat(shift) *. across *. 0.04, offset)
        }
        darkest := Math.min(darkest.contents, seam.contents /. 5.0)
      }
      Math.min(near.contents, far.contents) /. 5.0 -. darkest.contents >= 12.0
    }
    let hasRepeatedSeams = vertical => {
      let found = ref(0)
      for boundary in 1 to gridSize - 1 {
        for segment in 0 to gridSize - 1 {
          if segmentHasSeam(vertical, boundary, segment) {
            found := found.contents + 1
          }
        }
      }
      Int.toFloat(found.contents) >= Math.ceil(Int.toFloat((gridSize - 1) * gridSize) *. 0.5)
    }
    if hasRepeatedSeams(true) && hasRepeatedSeams(false) {
      true
    } else {
      // Rounded stickers expose the dark cube body mainly at four-sticker
      // intersections, even when their straight seams are too narrow or
      // skewed to align with the grid. Like a seam, the corner must also
      // be darker than the stickers around it (on average - dark blue or
      // red stickers can be darker than a grey-lit body), or light grout
      // between wall tiles would pass as a cube body.
      let visibleIntersections = ref(0)
      let colorAt = (x, y) => clampedColorAt(data, width, height, x, y)
      for row in 1 to gridSize - 1 {
        for col in 1 to gridSize - 1 {
          let x = line(xs, col)
          let y = line(ys, row)
          let cellW = narrower(xs, col)
          let cellH = narrower(ys, row)
          let neighbors = [
            colorAt(x -. cellW *. 0.45, y -. cellH *. 0.45),
            colorAt(x +. cellW *. 0.45, y -. cellH *. 0.45),
            colorAt(x -. cellW *. 0.45, y +. cellH *. 0.45),
            colorAt(x +. cellW *. 0.45, y +. cellH *. 0.45),
          ]
          let stickerLuminance =
            neighbors->Array.reduce(0.0, (sum, (r, g, b)) =>
              sum +. 0.2126 *. r +. 0.7152 *. g +. 0.0722 *. b
            ) /. 4.0
          let cornerContrast = ref(0.0)
          let darkestCorner = ref(Float.Constants.positiveInfinity)
          for dy in -2 to 2 {
            for dx in -2 to 2 {
              let px = x +. Int.toFloat(dx) *. cellW *. 0.06
              let py = y +. Int.toFloat(dy) *. cellH *. 0.06
              let corner = colorAt(px, py)
              let closest =
                neighbors->Array.reduce(Float.Constants.positiveInfinity, (least, neighbor) =>
                  Math.min(least, colorDistance(corner, neighbor))
                )
              cornerContrast := Math.max(cornerContrast.contents, closest)
              darkestCorner := Math.min(darkestCorner.contents, luminance(px, py))
            }
          }
          if cornerContrast.contents >= 25.0 && darkestCorner.contents < stickerLuminance {
            visibleIntersections := visibleIntersections.contents + 1
          }
        }
      }
      Int.toFloat(visibleIntersections.contents) >=
      Math.ceil(Int.toFloat((gridSize - 1) * (gridSize - 1)) *. 0.5)
    }
  }

type visibility = {
  visible: bool,
  coherent: bool,
  plausible?: bool,
  outline?: bool,
}

// The live cube check on the read square `data`, step by step: coherent
// sticker interiors, then a sticker pattern or a visible outline. Detect
// face requires the outer outline even when room lines mimic sticker seams;
// Guide grid keeps the more permissive manual check.
let faceVisibility = (
  data,
  faceWidth,
  faceHeight,
  gridSize,
  outline: unit => bool,
  requireOutline,
) => {
  // Judge the face in the layout it is sampled in (see
  // extractColorsFromImageData).
  let outer = GridAlignment.estimateOuterCellRatio(
    data,
    Float.toInt(faceWidth),
    Float.toInt(faceHeight),
    gridSize,
  )
  if !hasCoherentStickerInteriors(data, faceWidth, faceHeight, gridSize, outer) {
    {visible: false, coherent: false}
  } else {
    let plausible = hasPlausibleStickerFace(data, faceWidth, faceHeight, gridSize, outer)
    if plausible && !requireOutline {
      {visible: true, coherent: true, plausible: true}
    } else {
      let edge = outline()
      {visible: edge, coherent: true, plausible, outline: edge}
    }
  }
}

// Whether the square of `bounds` stands out from its surroundings along at
// least 3 of its sides, in the full width x height `frame`.
let outlineVisible = (frame, width, height, bounds: FaceSampling.faceBounds) => {
  let {faceWidth, faceHeight} = bounds
  let inset = Math.min(faceWidth, faceHeight) *. 0.06
  // The outline of the square that was read - aligned, maybe tilted - in
  // its own frame: (u, v) from its center, turned with it.
  let cx = bounds.startX +. faceWidth /. 2.0
  let cy = bounds.startY +. faceHeight /. 2.0
  let angle = bounds.angle->Option.getOr(0.0)
  let cos = Math.cos(angle)
  let sin = Math.sin(angle)
  let at = (u, v) =>
    clampedColorAt(frame, width, height, cx +. cos *. u -. sin *. v, cy +. sin *. u +. cos *. v)
  let halfW = faceWidth /. 2.0
  let halfH = faceHeight /. 2.0
  let visibleSides = ref(0)
  for side in 0 to 3 {
    let contrasted = ref(0)
    for i in 1 to 9 {
      let u = (Int.toFloat(i) /. 10.0 -. 0.5) *. faceWidth
      let v = (Int.toFloat(i) /. 10.0 -. 0.5) *. faceHeight
      let (inside, outside) = switch side {
      | 0 => (at(-.halfW +. inset, v), at(-.halfW -. inset, v))
      | 1 => (at(halfW -. inset, v), at(halfW +. inset, v))
      | 2 => (at(u, -.halfH +. inset), at(u, -.halfH -. inset))
      | _ => (at(u, halfH -. inset), at(u, halfH +. inset))
      }
      if colorDistance(inside, outside) >= 25.0 {
        contrasted := contrasted.contents + 1
      }
    }
    if contrasted.contents >= 6 {
      visibleSides := visibleSides.contents + 1
    }
  }
  visibleSides.contents >= 3
}

// The original's `!bounds.angle`: no angle, zero, or NaN.
let untilted = (bounds: FaceSampling.faceBounds) =>
  switch bounds.angle {
  | Some(angle) => angle == 0.0 || Float.isNaN(angle)
  | None => true
  }

// `result` with where its square sat relative to the guide (gridOffset),
// when it was moved off the guide - what the live overlay is drawn from.
let withGridOffset = (
  result: colorDetection,
  bounds: FaceSampling.faceBounds,
  guide: FaceSampling.faceBounds,
) =>
  if (
    bounds.startX == guide.startX &&
    bounds.startY == guide.startY &&
    bounds.faceWidth == guide.faceWidth &&
    untilted(bounds)
  ) {
    result
  } else {
    {
      ...result,
      gridOffset: {
        x: (bounds.startX +. bounds.faceWidth /. 2.0 -. guide.startX -. guide.faceWidth /. 2.0) /.
          guide.faceWidth,
        y: (bounds.startY +. bounds.faceHeight /. 2.0 -. guide.startY -. guide.faceHeight /. 2.0) /.
          guide.faceHeight,
        scale: bounds.faceWidth /. guide.faceWidth,
        angle: bounds.angle->Option.getOr(0.0) *. 180.0 /. Math.Constants.pi,
      },
    }
  }

// Focus measure for a photo: variance of the Laplacian of its luminance (a
// standard blur metric - edges produce large Laplacian values, so a sharp
// image has a wide spread and a blurred one a narrow spread). Only
// comparable between photos of similar content and size, e.g. the 6 faces
// of one capture; saved with fixtures so an out-of-focus face can be
// spotted.
let measureSharpness = (data, width, height) =>
  if width < 3 || height < 3 {
    0.0
  } else {
    let luma = Pixels.F32.make(width * height)
    for i in 0 to width * height - 1 {
      luma->Pixels.F32.set(
        i,
        0.2126 *. Int.toFloat(data->Pixels.get(i * 4)) +.
        0.7152 *. Int.toFloat(data->Pixels.get(i * 4 + 1)) +.
        0.0722 *. Int.toFloat(data->Pixels.get(i * 4 + 2)),
      )
    }
    let at = i => luma->Pixels.F32.get(i)
    let sum = ref(0.0)
    let sumSq = ref(0.0)
    let count = ref(0)
    for y in 1 to height - 2 {
      for x in 1 to width - 2 {
        let i = y * width + x
        let laplacian = at(i - 1) +. at(i + 1) +. at(i - width) +. at(i + width) -. 4.0 *. at(i)
        sum := sum.contents +. laplacian
        sumSq := sumSq.contents +. laplacian *. laplacian
        count := count.contents + 1
      }
    }
    let count = Int.toFloat(count.contents)
    let mean = sum.contents /. count
    sumSq.contents /. count -. mean *. mean
  }

type crop = {
  x: float,
  y: float,
  width: float,
  height: float,
  angle?: float,
  corners?: array<array<float>>,
}

// Where a saved crop came from: its rectangle, the degrees it was turned
// upright by, and the corners it was straightened from (to 0.1 pixel).
let cropRecord = (bounds: FaceSampling.faceBounds) => {
  let crop = {
    x: bounds.startX,
    y: bounds.startY,
    width: bounds.faceWidth,
    height: bounds.faceHeight,
  }
  let crop = switch bounds.angle {
  | Some(angle) if !untilted(bounds) => {...crop, angle: angle *. 180.0 /. Math.Constants.pi}
  | _ => crop
  }
  switch bounds.corners {
  | Some(corners) => {
      ...crop,
      corners: corners->Array.map(((x, y)) => [
        Math.round(x *. 10.0) /. 10.0,
        Math.round(y *. 10.0) /. 10.0,
      ]),
    }
  | None => crop
  }
}

// Where to read a face in a frame, and the colors read from it: the guide
// square, the aligned square, the backdrop reading behind the cube and the
// per-sticker color measurements. Drawing and reading canvases stays in
// the TypeScript caller.
type rgb = StickerGeometry.rgb = {r: float, g: float, b: float}

type faceBounds = {
  startX: float,
  startY: float,
  faceWidth: float,
  faceHeight: float,
  // Tilt (radians, canvas rotate() direction) about the square's center;
  // the square is read turned upright.
  angle?: float,
  // A face seen at an angle: its corners (top-left, top-right,
  // bottom-right, bottom-left) in the frame's pixels. When set, the face is
  // read straightened through them (see warpQuadToSquare) instead of the
  // square.
  corners?: array<(float, float)>,
  // Set by seam alignment. False means the returned guide is only a
  // placeholder; Detect face must not capture it as an automatic result.
  gridFound?: bool,
  // A seam fit was rejected because its outer lines missed the face edge.
  needsRecentering?: bool,
}

// Fraction of the frame (of min(width,height)) the sticker guide square
// covers - the ONLY thing extractColorsFromImageData ever samples for
// classification.
let sampleFaceFraction = 0.6

// The guide square of a width x height frame: the cube face is assumed
// centered, matching the fixed guide square shown during capture.
let guideBounds = (width, height, fraction) => {
  let centerX = width /. 2.0
  let centerY = height /. 2.0
  let faceSize = Math.min(width, height) *. fraction
  let startX = Math.max(0.0, centerX -. faceSize /. 2.0)
  let startY = Math.max(0.0, centerY -. faceSize /. 2.0)
  let endX = Math.min(width, startX +. faceSize)
  let endY = Math.min(height, startY +. faceSize)
  // Rounded to integers - getImageData takes doubles, but the ImageData it
  // returns is integer-pixel-sized, so a caller that reuses fractional
  // bounds for both the getImageData argument and its own
  // (row * width + col) index math disagrees on the row stride and reads
  // past the buffer end (undefined, NaN downstream). Round once here so
  // every consumer agrees on the same integer bounds.
  {
    startX: Math.round(startX),
    startY: Math.round(startY),
    faceWidth: Math.round(endX -. startX),
    faceHeight: Math.round(endY -. startY),
  }
}

type area = {x0: float, y0: float, x1: float, y1: float}
type origin = {x0: float, y0: float}

// The part of a width x height frame searched around `guide`: room for the
// largest offset plus the largest face (1.12x the guide), and for the
// corners of a tilted one.
let alignmentArea = (guide: faceBounds, width, height): area => {
  let margin = Math.ceil(guide.faceWidth *. (GridAlignment.alignmentMaxOffset +. 0.06 +. 0.2))
  {
    x0: Math.max(0.0, guide.startX -. margin),
    y0: Math.max(0.0, guide.startY -. margin),
    x1: Math.min(width, guide.startX +. guide.faceWidth +. margin),
    y1: Math.min(height, guide.startY +. guide.faceHeight +. margin),
  }
}

// alignFace on `data`, the alignmentArea's pixels.
let alignFaceInArea = (data, width, height, guide: faceBounds, area: origin, gridSize) =>
  GridAlignment.alignFace(
    data,
    width,
    height,
    {x: guide.startX -. area.x0, y: guide.startY -. area.y0, size: guide.faceWidth},
    gridSize,
  )

let withRecentering = (bounds: faceBounds, found: GridAlignment.gridAlignment) =>
  found.needsRecentering == Some(true) ? {...bounds, needsRecentering: true} : bounds

// The frame bounds an alignment (found in `area`) leads to.
let boundsFromAlignment = (
  found: GridAlignment.gridAlignment,
  guide: faceBounds,
  area: origin,
  width,
  height,
  corners: Nullable.t<array<(float, float)>>,
) => {
  let angle = found.angle
  // The original's `angle && {angle}`: a zero or NaN angle is no tilt.
  let tilted = angle != 0.0 && !Float.isNaN(angle)
  if !found.aligned && !tilted {
    withRecentering({...guide, gridFound: found.seams}, found)
  } else {
    let size = Math.round(found.size)
    let (foundX, foundY) = found.center
    // Keep the square's center on the canvas; a tilted square is read
    // through a rotation, which clamps nothing else.
    let centerX = Math.min(width -. size /. 2.0, Math.max(size /. 2.0, area.x0 +. foundX))
    let centerY = Math.min(height -. size /. 2.0, Math.max(size /. 2.0, area.y0 +. foundY))
    let bounds = {
      startX: Math.round(centerX -. size /. 2.0),
      startY: Math.round(centerY -. size /. 2.0),
      faceWidth: size,
      faceHeight: size,
    }
    let bounds = tilted ? {...bounds, angle} : bounds
    let bounds = switch Nullable.toOption(corners) {
    | Some(corners) => {
        ...bounds,
        corners: corners->Array.map(((x, y)) => (area.x0 +. x, area.y0 +. y)),
      }
    | None => bounds
    }
    withRecentering({...bounds, gridFound: found.seams}, found)
  }
}

// The face in the alignment area: its aligned square, and its corners when
// it is seen at an angle and straightening helps (see faceCornersIfBetter).
let alignedBoundsInArea = (
  region,
  regionWidth,
  regionHeight,
  guide,
  area: origin,
  gridSize,
  width,
  height,
) => {
  let found = alignFaceInArea(region, regionWidth, regionHeight, guide, area, gridSize)
  let corners =
    found.seams && found.aligned
      ? GridAlignment.faceCornersIfBetter(region, regionWidth, regionHeight, found, gridSize)
      : Null.null
  boundsFromAlignment(
    found,
    guide,
    area,
    width,
    height,
    corners->Null.toOption->Nullable.fromOption,
  )
}

// Band around the detected cube that's always left out of the background
// sample, as a fraction of the face's side on each side: the cube's own
// body (its other sides show at any angle) and the fingers holding it sit
// right around the face, and neither is the constant backdrop the white
// balance relies on.
let backgroundCubeGap = 0.25

// Every backgroundStride-th pixel in each direction is sampled - the
// trimmed mean needs a representative sample, not all ~2M pixels of a 1080p
// frame.
let backgroundStride = 2

// Fraction of a cell's sampled pixels discarded from each luminance extreme
// before averaging - rejects glare (a specular highlight off the sticker's
// glossy plastic) and shadow/bleed outliers a plain mean would blend in.
// 15% each end rejects a real highlight streak, which only ever covers a
// minority of a sticker's sampled area, without making a uniform sticker's
// estimate noisier.
let outlierTrimFraction = 0.15

let luminance = (c: rgb) => 0.2126 *. c.r +. 0.7152 *. c.g +. 0.0722 *. c.b

// Averages pixel colors after discarding the brightest/darkest tails by
// luminance, instead of a plain mean over every sampled pixel.
let trimmedMeanColor = (pixels: array<rgb>, trimFraction) => {
  let count = Array.length(pixels)
  if count == 0 {
    Null.null
  } else {
    let byLuminance = pixels->Array.toSorted((a, b) => luminance(a) -. luminance(b))
    let trimCount = Float.toInt(Math.floor(Int.toFloat(count) *. trimFraction))
    // Only trim when there's enough left afterward - never let trimming
    // itself produce an empty (or asymmetric) result on a very small
    // sample.
    let kept =
      trimCount * 2 < count
        ? byLuminance->Array.slice(~start=trimCount, ~end=count - trimCount)
        : byLuminance
    let sumR = ref(0.0)
    let sumG = ref(0.0)
    let sumB = ref(0.0)
    kept->Array.forEach(p => {
      sumR := sumR.contents +. p.r
      sumG := sumG.contents +. p.g
      sumB := sumB.contents +. p.b
    })
    let length = Int.toFloat(Array.length(kept))
    Null.make({r: sumR.contents /. length, g: sumG.contents /. length, b: sumB.contents /. length})
  }
}

// The backdrop's color on a live frame: the trimmed mean of the whole frame
// outside the detected face (the guide square without one), its rotated
// bounding box grown by backgroundCubeGap of its side on each side. The
// whole remaining frame rather than a band near the cube, so one local
// contamination (a shadow, a reflection) is averaged out instead of
// skewing the reading. Null if the frame is too small, too little of it is
// left, or it reads too dark to be a reliable reference.
let extractBackgroundColorFromPixels = (data, width, height, face: faceBounds) =>
  if width < 40 || height < 40 {
    Null.null
  } else {
    let turn = face.angle->Option.getOr(0.0)
    let half =
      face.faceWidth /. 2.0 *. (Math.abs(Math.cos(turn)) +. Math.abs(Math.sin(turn))) +.
        backgroundCubeGap *. face.faceWidth
    let cx = face.startX +. face.faceWidth /. 2.0
    let cy = face.startY +. face.faceHeight /. 2.0
    let left = cx -. half
    let right = cx +. half
    let top = cy -. half
    let bottom = cy +. half
    let pixels = []
    let y = ref(0)
    while y.contents < height {
      let yF = Int.toFloat(y.contents)
      let inCubeRow = yF >= top && yF < bottom
      let x = ref(0)
      while x.contents < width {
        let xF = Int.toFloat(x.contents)
        if !(inCubeRow && xF >= left && xF < right) {
          let index = (y.contents * width + x.contents) * 4
          pixels->Array.push({
            StickerGeometry.r: Int.toFloat(data->Pixels.get(index)),
            g: Int.toFloat(data->Pixels.get(index + 1)),
            b: Int.toFloat(data->Pixels.get(index + 2)),
          })
        }
        x := x.contents + backgroundStride
      }
      y := y.contents + backgroundStride
    }
    let stride = Int.toFloat(backgroundStride)

    // Too little backdrop left (the cube fills the frame) to stand for it.
    if (
      Int.toFloat(Array.length(pixels)) <
      0.05 *. (Int.toFloat(width) /. stride) *. (Int.toFloat(height) /. stride)
    ) {
      Null.null
    } else {
      switch Null.toOption(trimmedMeanColor(pixels, outlierTrimFraction)) {
      | Some(mean) if Float.isFinite(mean.r) && Float.isFinite(mean.g) && Float.isFinite(mean.b) =>
        // Too dark to be a reliable reference.
        luminance(mean) < 5.0 ? Null.null : Null.make(mean)
      | _ => Null.null
      }
    }
  }

// Largest per-channel correction (and 1/this the smallest) a background
// gain may apply. The background patch is only a rough gray card - it picks
// up the cube's own colored reflections and exposure changes - so a strong
// gain overcorrects: one 7x7 fixture's red gain of 1.56 pushed its reds
// into orange. Sweeping every local fixture that recorded gains, 1.3 kept
// or widened the worst Red/Orange margin on all of them, while no gain at
// all broke another capture. That limit was set on sRGB values; gains now
// scale linear light (see applyGains), where the same strength is 1.3^2.2.
let maxBackgroundGain = 1.3 ** 2.2

// Clamps a background-derived gain into [1/maxBackgroundGain,
// maxBackgroundGain], with a neutral (1) gain for any channel that comes
// out non-finite rather than propagating NaN into applyGains.
let limitBackgroundGain = (gains: rgb): rgb => {
  let clampGain = g =>
    Float.isFinite(g) ? Math.max(1.0 /. maxBackgroundGain, Math.min(maxBackgroundGain, g)) : 1.0
  {r: clampGain(gains.r), g: clampGain(gains.g), b: clampGain(gains.b)}
}

// How background white balance is computed, saved with fixtures so only
// gains made this way are replayed (older captures recorded gains relative
// to face 1 over a region without a gap to the cube, which swapped red and
// orange on real captures; v1 gains were sRGB ratios, v2 are linear).
let backgroundWbMethod = "median-around-cube/v2"

let median = values => {
  let sorted = values->Array.toSorted((a, b) => a -. b)
  let count = Array.length(sorted)
  let mid = count / 2
  mod(count, 2) == 1
    ? sorted->Array.getUnsafe(mid)
    : (sorted->Array.getUnsafe(mid - 1) +. sorted->Array.getUnsafe(mid)) /. 2.0
}

let linearRgb = (bg: rgb): rgb => {
  r: ColorMath.srgbChannelToLinear(bg.r),
  g: ColorMath.srgbChannelToLinear(bg.g),
  b: ColorMath.srgbChannelToLinear(bg.b),
}

// Per-face gains bring each face's backdrop to the median backdrop of all
// faces - the median rather than face 1, so one odd reading (a hand in the
// frame, a shadow) moves only its own face, and the corrections stay small.
// The median backdrop in linear light, or None with fewer than 3 readings.
let linearBackdropReference = (backgrounds: Dict.t<Nullable.t<rgb>>) => {
  let lin =
    backgrounds
    ->Dict.valuesToArray
    ->Array.filterMap(Nullable.toOption)
    ->Array.map(linearRgb)
  Array.length(lin) < 3
    ? None
    : Some({
        StickerGeometry.r: median(lin->Array.map(bg => bg.r)),
        g: median(lin->Array.map(bg => bg.g)),
        b: median(lin->Array.map(bg => bg.b)),
      })
}

// The backdrop every face is brought to (see computeBackgroundGains), in
// sRGB.
let backdropReference = backgrounds =>
  switch linearBackdropReference(backgrounds) {
  | Some(reference) =>
    Null.make({
      StickerGeometry.r: ColorMath.linearChannelToSrgb(reference.r),
      g: ColorMath.linearChannelToSrgb(reference.g),
      b: ColorMath.linearChannelToSrgb(reference.b),
    })
  | None => Null.null
  }

let computeBackgroundGains = backgrounds =>
  switch linearBackdropReference(backgrounds) {
  | None => Null.null
  | Some(reference) =>
    // Ratios of linear light, like the gains are applied (see applyGains).
    let floor = ColorMath.srgbChannelToLinear(1.0)
    Null.make(
      Dict.fromArray(
        backgrounds
        ->Dict.toArray
        ->Array.map(((face, bg)) =>
          switch Nullable.toOption(bg) {
          | None => (face, ColorMath.neutralGains)
          | Some(bg) =>
            let l = linearRgb(bg)
            (
              face,
              limitBackgroundGain({
                r: reference.r /. Math.max(floor, l.r),
                g: reference.g /. Math.max(floor, l.g),
                b: reference.b /. Math.max(floor, l.b),
              }),
            )
          }
        ),
      ),
    )
  }

// A sticker's color from its sampled pixels. Glossy stickers can mirror a
// lamp or window across half their area, and that reflection turned red and
// orange stickers alike pale pink-purple, more than the trimmed mean's 15%
// tails can reject. The sticker's own color survives in its most colorful
// pixels, so a colored sticker is measured from the most colorful
// stickerCoreSaturatedFraction of them (ranked by RGB channel spread, which
// ranks like OKLab chroma here at a fraction of the cost). A near-white
// sticker (trimmed-mean chroma below stickerWhiteChroma) keeps the trimmed
// mean: its "most colorful" pixels are only colored fringes.
let stickerCoreSaturatedFraction = 0.3
let stickerWhiteChroma = 0.07

// Names how stickerColor measures, saved with fixtures next to their
// per-sticker readings: readings from an older measurement can't be
// compared with today's.
let stickerMeasurement = "colorful-30/v1"

let stickerColor = (pixels: array<rgb>) => {
  let plain = trimmedMeanColor(pixels, outlierTrimFraction)
  switch Null.toOption(plain) {
  | Some(mean) if ColorMath.rgbToOKLCH(mean).c >= stickerWhiteChroma =>
    let spread = (c: rgb) => Math.max(c.r, Math.max(c.g, c.b)) -. Math.min(c.r, Math.min(c.g, c.b))
    let colorful =
      pixels
      ->Array.toSorted((a, b) => spread(b) -. spread(a))
      ->Array.slice(
        ~start=0,
        ~end=Float.toInt(
          Math.ceil(Int.toFloat(Array.length(pixels)) *. stickerCoreSaturatedFraction),
        ),
      )
    let count = Int.toFloat(Array.length(colorful))
    Null.make({
      StickerGeometry.r: colorful->Array.reduce(0.0, (sum, c) => sum +. c.r) /. count,
      g: colorful->Array.reduce(0.0, (sum, c) => sum +. c.g) /. count,
      b: colorful->Array.reduce(0.0, (sum, c) => sum +. c.b) /. count,
    })
  | _ => plain
  }
}

// Center pieces of odd cubes carry the maker's logo, often large and in a
// sticker color. On a GAN white center the blue logo pulled the cap's mean
// to blue, and stickerColor's colorful-core step then picked exactly the
// logo pixels. This splits the cell into two color groups (2-means in
// OKLab, seeded by its lightest and its most colorful pixel) and measures
// only the larger one, the cap; over the wider centerCore the cap's plain
// ring outnumbers the logo. A plain sticker splits into two halves of its
// own color, so its reading barely moves.
let centerCore = 0.85

let centerStickerColor = (pixels: array<rgb>) =>
  if Array.length(pixels) < 8 {
    stickerColor(pixels)
  } else {
    let step = Math.Int.max(1, Array.length(pixels) / 4000)
    let sample = pixels->Array.filterWithIndex((_, i) => mod(i, step) == 0)
    let lab = sample->Array.map(ColorMath.rgbToOklab)
    let chroma = (c: ColorMath.oklab) => Math.hypot(c.a, c.b)
    // The original's reduce without a start value: from the first pixel.
    let pick = better =>
      lab->Array.reduce(lab->Array.getUnsafe(0), (best, c) => better(c, best) ? c : best)
    let seeds = ref([pick((c, best) => c.l > best.l), pick((c, best) => chroma(c) > chroma(best))])
    let groups = ref([])
    for _ in 0 to 7 {
      let current = seeds.contents
      groups :=
        lab->Array.map(c => {
          let d =
            current->Array.map(seed =>
              (c.l -. seed.l) ** 2.0 +. (c.a -. seed.a) ** 2.0 +. (c.b -. seed.b) ** 2.0
            )
          d->Array.getUnsafe(0) <= d->Array.getUnsafe(1) ? 0 : 1
        })
      seeds :=
        [0, 1]->Array.map(g => {
          let members =
            lab->Array.filterWithIndex((_, i) => groups.contents->Array.getUnsafe(i) == g)
          if Array.length(members) == 0 {
            current->Array.getUnsafe(g)
          } else {
            let count = Int.toFloat(Array.length(members))
            {
              ColorMath.l: members->Array.reduce(0.0, (sum, c) => sum +. c.l) /. count,
              a: members->Array.reduce(0.0, (sum, c) => sum +. c.a) /. count,
              b: members->Array.reduce(0.0, (sum, c) => sum +. c.b) /. count,
            }
          }
        })
    }
    let groups = groups.contents
    let zeros = groups->Array.filter(g => g == 0)->Array.length
    let larger = Int.toFloat(zeros) >= Int.toFloat(Array.length(groups)) /. 2.0 ? 0 : 1
    stickerColor(sample->Array.filterWithIndex((_, i) => groups->Array.getUnsafe(i) == larger))
  }

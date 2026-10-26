// Where a capture's stickers sit by hue and lightness, labeled with the
// color each ended up with. A palette that fits shows one cloud per color;
// two colors sharing a cloud are the ones that get mixed up.
open StickerGeometry

type sample = {rgb: rgb, label: string}

type point = {
  label: string,
  // Position on the hue axis (see hueAxis); meaningless when neutral.
  hue: float,
  // OKLCH lightness, 0-1, and chroma (how saturated).
  l: float,
  chroma: float,
  // Has no usable hue: a white sticker, however tinted, or any sticker too
  // gray to tell its hue.
  neutral: bool,
}

// The hue circle is cut at this angle, between blue and red, so that red
// (which sits on both sides of 0 degrees) stays in one piece and orange
// follows it.
let hueCut = 330.0

// Without a whole cube, a sticker below this chroma is drawn as gray, with
// no hue: where the production clustering stops trusting hue (see
// ColorMath).
let neutralChroma = ColorMath.clusterChromaThreshold

// Hue in degrees on the cut axis: 0 at hueCut, going around.
let hueAxis = hue => {
  let shifted = hue -. hueCut
  shifted < 0.0 ? shifted +. 360.0 : shifted
}

// Whether an OKLCH color fits the sRGB cube (checked before any clamping).
let inGamut = (l, c, hue) => {
  let rad = hue *. Math.Constants.pi /. 180.0
  let a = c *. Math.cos(rad)
  let b = c *. Math.sin(rad)
  let l_ = l +. 0.3963377774 *. a +. 0.2158037573 *. b
  let m_ = l -. 0.1055613458 *. a -. 0.0638541728 *. b
  let s_ = l -. 0.0894841775 *. a -. 1.291485548 *. b
  let l3 = l_ *. l_ *. l_
  let m3 = m_ *. m_ *. m_
  let s3 = s_ *. s_ *. s_
  let fits = v => v >= -1e-4 && v <= 1.0001
  fits(4.0767416621 *. l3 -. 3.3077115913 *. m3 +. 0.2309699292 *. s3) &&
  fits(-1.2684380046 *. l3 +. 2.6097574011 *. m3 -. 0.3413193965 *. s3) &&
  fits(-0.0041960863 *. l3 -. 0.7034186147 *. m3 +. 1.707614701 *. s3)
}

// The most saturated color of a true hue at lightness `l`: the chroma
// grows until the color leaves the sRGB cube. For the hue axis' color bar.
let hueBarColor = (hue, l) => {
  let lo = ref(0.0)
  let hi = ref(0.4)
  for _ in 1 to 30 {
    let mid = (lo.contents +. hi.contents) /. 2.0
    inGamut(l, mid, hue) ? lo := mid : hi := mid
  }
  let rad = hue *. Math.Constants.pi /. 180.0
  ColorMath.oklabToRgb({l, a: lo.contents *. Math.cos(rad), b: lo.contents *. Math.sin(rad)})
}

type deviation = {label: string, count: int, expected: int}
type xy = {x: float, y: float}

// A whole cube has the same number of stickers of each of the six colors.
// The colors whose count differs, most stickers first; empty when the
// stickers do not divide into six equal shares.
let countDeviations = (samples: array<sample>) => {
  let total = Array.length(samples)
  if total == 0 || mod(total, 6) != 0 {
    []
  } else {
    let expected = total / 6
    let count = label => samples->Array.filter(sample => sample.label == label)->Array.length
    ["W", "Y", "O", "R", "G", "B"]
    ->Array.map(label => {label, count: count(label), expected})
    ->Array.filter(deviation => deviation.count != expected)
    ->Array.toSorted((a, b) => Int.toFloat(b.count - a.count))
  }
}

// Where each sticker sits: hue against lightness. Red and orange overlap in
// hue alone but orange is lighter, so the two clouds stay apart.
let hueScatter = (samples: array<sample>) => {
  let lch = samples->Array.map(sample => ColorMath.rgbToOKLCH(sample.rgb))
  let count = Array.length(samples)
  // A cube has as many stickers of each color, so the least saturated ones
  // are the whites, however much a tint or a dull lamp lifts their chroma.
  // Without a whole cube's six colors, the fixed limit stands in.
  let cutoff =
    count > 0 && mod(count, 6) == 0
      ? Some(
          lch
          ->Array.map(l => l.c)
          ->Array.toSorted((a, b) => a -. b)
          ->Array.getUnsafe(count / 6 - 1),
        )
      : None
  let isNeutral = c =>
    switch cutoff {
    | Some(limit) => c <= limit
    | None => c < neutralChroma
    }
  samples->Array.mapWithIndex((sample, i) => {
    let lch = lch->Array.getUnsafe(i)
    {
      label: sample.label,
      hue: hueAxis(lch.h),
      l: lch.l,
      chroma: lch.c,
      neutral: sample.label == "W" || isNeutral(lch.c),
    }
  })
}

// The mean sticker color per final color: the palette the corrected capture
// itself shows, for comparing with the standard and the learned colors.
let meansByLabel = (samples: array<sample>) => {
  let sums: Dict.t<(float, float, float, int)> = Dict.make()
  samples->Array.forEach(({rgb, label}) => {
    let (r, g, b, n) = sums->Dict.get(label)->Option.getOr((0.0, 0.0, 0.0, 0))
    sums->Dict.set(label, (r +. rgb.r, g +. rgb.g, b +. rgb.b, n + 1))
  })
  sums
  ->Dict.toArray
  ->Array.map(((label, (r, g, b, n))) => {
    let count = Int.toFloat(n)
    (label, {r: r /. count, g: g /. count, b: b /. count})
  })
  ->Dict.fromArray
}

// How far apart two colors look, as the Oklab distance times 100: a shade
// is a point or two, another color tens.
let colorDelta = (a: rgb, b: rgb) => {
  let x = ColorMath.rgbToOklab(a)
  let y = ColorMath.rgbToOklab(b)
  let dl = x.l -. y.l
  let da = x.a -. y.a
  let db = x.b -. y.b
  100.0 *. Math.sqrt(dl *. dl +. da *. da +. db *. db)
}

// The indices of the points inside a hand-drawn outline (even-odd rule),
// so it does not matter which way the outline was drawn or whether it
// crosses itself. An outline of fewer than three points holds nothing.
let pointsInPolygon = (polygon: array<xy>, points: array<xy>) =>
  if Array.length(polygon) < 3 {
    []
  } else {
    let n = Array.length(polygon)
    let inside = (p: xy) => {
      let result = ref(false)
      for i in 0 to n - 1 {
        let a = polygon->Array.getUnsafe(i)
        let b = polygon->Array.getUnsafe(mod(i + n - 1, n))
        if a.y > p.y != (b.y > p.y) && p.x < (b.x -. a.x) *. (p.y -. a.y) /. (b.y -. a.y) +. a.x {
          result := !result.contents
        }
      }
      result.contents
    }
    points
    ->Array.mapWithIndex((p, i) => (p, i))
    ->Array.filter(((p, _)) => inside(p))
    ->Array.map(((_, i)) => i)
  }

// How many of the chosen stickers have each color, most first, with the
// share a whole cube has of each color (0 unless the stickers divide into
// six equal shares).
let selectionCounts = (samples: array<sample>, chosen: array<int>) => {
  let total = Array.length(samples)
  let expected = total > 0 && mod(total, 6) == 0 ? total / 6 : 0
  let count = label =>
    chosen
    ->Array.filter(i => (samples->Array.getUnsafe(i)).label == label)
    ->Array.length
  ["W", "Y", "O", "R", "G", "B"]
  ->Array.map(label => {label, count: count(label), expected})
  ->Array.filter(deviation => deviation.count > 0)
  ->Array.toSorted((a, b) => Int.toFloat(b.count - a.count))
}

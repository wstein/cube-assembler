// Where a capture's stickers sit by hue and lightness, labeled with the
// color each ended up with. A palette that fits shows one cloud per color;
// two colors sharing a cloud are the ones that get mixed up.
open StickerGeometry

type sample = {rgb: rgb, label: string}

type point = {
  label: string,
  // Position on the hue axis (see hueAxis); meaningless when neutral.
  hue: float,
  // OKLCH lightness, 0-1.
  l: float,
  // Too gray to have a usable hue (white stickers).
  neutral: bool,
}

// The hue circle is cut at this angle, between blue and red, so that red
// (which sits on both sides of 0 degrees) stays in one piece and orange
// follows it.
let hueCut = 340.0

// Below this chroma a sticker has no usable hue: nearly all whites, while
// the dullest colored stickers (a washed-out yellow) stay above 0.03 and
// all but a few above 0.08. A tinted white lands among the hues, which is
// what the chart is there to show.
let neutralChroma = 0.05

// Hue in degrees on the cut axis: 0 at hueCut, going around.
let hueAxis = hue => {
  let shifted = hue -. hueCut
  shifted < 0.0 ? shifted +. 360.0 : shifted
}

// Where each sticker sits: hue against lightness. Red and orange overlap in
// hue alone but orange is lighter, so the two clouds stay apart.
let hueScatter = (samples: array<sample>) =>
  samples->Array.map(sample => {
    let lch = ColorMath.rgbToOKLCH(sample.rgb)
    {label: sample.label, hue: hueAxis(lch.h), l: lch.l, neutral: lch.c < neutralChroma}
  })

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

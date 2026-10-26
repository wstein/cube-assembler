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
  // Too gray to have a usable hue (white stickers).
  neutral: bool,
  // Sits with another color's stickers than the one it ended up as (see
  // hueScatter).
  misplaced: bool,
  // The color whose cloud it sits in: its own unless misplaced. White has no
  // hue, so a colored sticker is never "in" the whites.
  sitsWith: string,
}

// The hue circle is cut at this angle, between blue and red, so that red
// (which sits on both sides of 0 degrees) stays in one piece and orange
// follows it.
let hueCut = 340.0

// Without a whole cube, a sticker below this chroma is drawn as gray, with
// no hue: where the production clustering stops trusting hue (see
// ColorMath).
let neutralChroma = ColorMath.clusterChromaThreshold

// Hue in degrees on the cut axis: 0 at hueCut, going around.
let hueAxis = hue => {
  let shifted = hue -. hueCut
  shifted < 0.0 ? shifted +. 360.0 : shifted
}

// How far apart two stickers sit on the chart, in units where 20 degrees of
// hue and 0.15 of lightness count the same.
let chartDistance = (a: point, b: point) => {
  let dh = (a.hue -. b.hue) /. 20.0
  let dl = (a.l -. b.l) /. 0.15
  Math.sqrt(dh *. dh +. dl *. dl)
}

// Where each sticker sits: hue against lightness. Red and orange overlap in
// hue alone but orange is lighter, so the two clouds stay apart. A sticker
// is misplaced when it sits nearer another color's cloud than its own (a
// gray one when it isn't white, a colored one when it is).
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
  let base = samples->Array.mapWithIndex((sample, i) => {
    let lch = lch->Array.getUnsafe(i)
    {
      label: sample.label,
      hue: hueAxis(lch.h),
      l: lch.l,
      chroma: lch.c,
      neutral: isNeutral(lch.c),
      misplaced: false,
      sitsWith: sample.label,
    }
  })
  // Each color's cloud center, from its colored stickers (white has none).
  let sums: Dict.t<(float, float, int)> = Dict.make()
  base->Array.forEach(point =>
    if !point.neutral && point.label != "W" {
      let (h, l, n) = sums->Dict.get(point.label)->Option.getOr((0.0, 0.0, 0))
      sums->Dict.set(point.label, (h +. point.hue, l +. point.l, n + 1))
    }
  )
  let centers =
    sums
    ->Dict.toArray
    ->Array.map(((label, (h, l, n))) => {
      let count = Int.toFloat(n)
      {
        label,
        hue: h /. count,
        l: l /. count,
        chroma: 0.0,
        neutral: false,
        misplaced: false,
        sitsWith: label,
      }
    })
  base->Array.map(point =>
    if point.neutral {
      {...point, misplaced: point.label != "W", sitsWith: "W"}
    } else {
      let nearest = centers->Array.reduce(None, (best, center) =>
        switch best {
        | Some((_, distance)) if distance <= chartDistance(point, center) => best
        | _ => Some((center.label, chartDistance(point, center)))
        }
      )
      let sitsWith = nearest->Option.mapOr(point.label, ((label, _)) => label)
      {...point, misplaced: point.label == "W" || sitsWith != point.label, sitsWith}
    }
  )
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

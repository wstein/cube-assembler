// Where a capture's stickers sit around the hue circle: one count per bin,
// split by the color each sticker ended up with. A palette that fits shows
// one tight peak per color; two colors sharing a peak are the ones that
// get mixed up.
open StickerGeometry

type sample = {rgb: rgb, label: string}

type histogram = {
  // Per hue bin, stickers by final color. Bin i covers hues from
  // i * 360 / binCount, going around the OKLCH hue circle.
  bins: array<Dict.t<int>>,
  // Stickers too gray to have a hue (white ones), by final color.
  neutral: Dict.t<int>,
}

// Below this chroma a sticker has no usable hue: nearly all whites, while
// the dullest colored stickers (a washed-out yellow) stay above 0.03 and
// all but a few above 0.08. A tinted white lands among the hues, which is
// what the chart is there to show.
let neutralChroma = 0.05

let hueBin = (rgb, binCount) => {
  let hue = ColorMath.rgbToOKLCH(rgb).h
  let bin = Math.floor(hue /. 360.0 *. Int.toFloat(binCount))->Float.toInt
  mod(bin + binCount, binCount)
}

let bump = (counts: Dict.t<int>, label) =>
  counts->Dict.set(label, counts->Dict.get(label)->Option.getOr(0) + 1)

let hueHistogram = (samples: array<sample>, binCount) => {
  let bins = Array.fromInitializer(~length=binCount, _ => Dict.make())
  let neutral = Dict.make()
  samples->Array.forEach(sample =>
    if ColorMath.rgbToOKLCH(sample.rgb).c < neutralChroma {
      bump(neutral, sample.label)
    } else {
      bump(bins->Array.getUnsafe(hueBin(sample.rgb, binCount)), sample.label)
    }
  )
  {bins, neutral}
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

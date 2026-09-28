// Sticker classification measures closeness in OKLCH (Ottosson's
// perceptually uniform Oklab in polar lightness/chroma/hue form, as CSS's
// oklch() uses), not raw sRGB: canonical red and orange sit only 127 units
// apart on one RGB channel, and OKLCH separates hue from lightness and
// chroma. Distances use Oklab's Cartesian (L, a, b) form, which avoids the
// 0/360 degree wraparound of hue angles.
open StickerGeometry

type oklch = {l: float, c: float, h: float}
type oklab = {l: float, a: float, b: float}

let clamp = (low, high, value) => Math.max(low, Math.min(high, value))

let srgbChannelToLinear = c => {
  let v = c /. 255.0
  v <= 0.04045 ? v /. 12.92 : Math.pow((v +. 0.055) /. 1.055, ~exp=2.4)
}

// From linear-light channels, which may exceed 1 (a color scaled past what
// sRGB can store). Matrices per Ottosson's reference.
let linearRgbToOklab = (r, g, b): oklab => {
  let l_ = Math.cbrt(0.4122214708 *. r +. 0.5363325363 *. g +. 0.0514459929 *. b)
  let m_ = Math.cbrt(0.2119034982 *. r +. 0.6806995451 *. g +. 0.1073969566 *. b)
  let s_ = Math.cbrt(0.0883024619 *. r +. 0.2817188376 *. g +. 0.6299787005 *. b)
  {
    l: 0.2104542553 *. l_ +. 0.793617785 *. m_ -. 0.0040720468 *. s_,
    a: 1.9779984951 *. l_ -. 2.428592205 *. m_ +. 0.4505937099 *. s_,
    b: 0.0259040371 *. l_ +. 0.7827717662 *. m_ -. 0.808675766 *. s_,
  }
}

let rgbToOklab = (rgb: rgb) =>
  linearRgbToOklab(
    srgbChannelToLinear(rgb.r),
    srgbChannelToLinear(rgb.g),
    srgbChannelToLinear(rgb.b),
  )

let linearChannelToSrgb = v => {
  let clamped = clamp(0.0, 1.0, v)
  let encoded =
    clamped <= 0.0031308 ? clamped *. 12.92 : 1.055 *. Math.pow(clamped, ~exp=1.0 /. 2.4) -. 0.055
  clamp(0.0, 255.0, Math.round(encoded *. 255.0))
}

// Inverse of rgbToOklab: k-means averages cluster members in Oklab, so each
// centroid is converted back for display and storage.
let oklabToRgb = (lab: oklab): rgb => {
  let l_ = lab.l +. 0.3963377774 *. lab.a +. 0.2158037573 *. lab.b
  let m_ = lab.l -. 0.1055613458 *. lab.a -. 0.0638541728 *. lab.b
  let s_ = lab.l -. 0.0894841775 *. lab.a -. 1.291485548 *. lab.b
  let l = l_ *. l_ *. l_
  let m = m_ *. m_ *. m_
  let s = s_ *. s_ *. s_
  {
    r: linearChannelToSrgb(4.0767416621 *. l -. 3.3077115913 *. m +. 0.2309699292 *. s),
    g: linearChannelToSrgb(-1.2684380046 *. l +. 2.6097574011 *. m -. 0.3413193965 *. s),
    b: linearChannelToSrgb(-0.0041960863 *. l -. 0.7034186147 *. m +. 1.707614701 *. s),
  }
}

let rgbToOKLCH = rgb => {
  let {l, a, b}: oklab = rgbToOklab(rgb)
  let c = Math.sqrt(a *. a +. b *. b)
  let degrees = Math.atan2(~y=b, ~x=a) *. 180.0 /. Math.Constants.pi
  {l, c, h: degrees < 0.0 ? degrees +. 360.0 : degrees}
}

type hueRange = {min: float, max: float, span: float}

// The smallest arc (min .. max degrees, clockwise from min) containing
// every hue - not a naive min/max, which breaks at the 0/360 wraparound.
// The arc is everything but the largest gap between consecutive hues.
let hueCircularRange = (hues: array<float>) => {
  let count = Array.length(hues)
  if count == 0 {
    Null.null
  } else {
    let sorted = hues->Array.toSorted((a, b) => a -. b)
    let at = i => sorted->Array.getUnsafe(i)
    let largestGap = ref(0.0)
    let gapStart = ref(count - 1)
    for i in 0 to count - 1 {
      let previous = i == 0 ? at(count - 1) -. 360.0 : at(i - 1)
      let gap = at(i) -. previous
      if gap > largestGap.contents {
        largestGap := gap
        gapStart := (i == 0 ? count - 1 : i - 1)
      }
    }
    Null.make({
      min: at(mod(gapStart.contents + 1, count)),
      max: at(gapStart.contents),
      span: 360.0 -. largestGap.contents,
    })
  }
}

// Whether two arcs share any point: checked on a 0.5 degree walk around
// the circle rather than with interval formulas, whose wraparound cases
// are easy to get subtly wrong.
let hueRangesOverlap = (a: hueRange, b: hueRange) => {
  let inArc = (degrees, range: hueRange) => {
    let relative = Float.mod(Float.mod(degrees -. range.min, 360.0) +. 360.0, 360.0)
    relative <= range.span +. 1e-9
  }
  Array.fromInitializer(~length=720, i => Int.toFloat(i) *. 360.0 /. 720.0)->Array.some(degrees =>
    inArc(degrees, a) && inArc(degrees, b)
  )
}

type linearRange = {min: float, max: float}

// Plain min/max for lightness and chroma, which don't wrap around.
let linearRange = (values: array<float>) =>
  switch values[0] {
  | None => Null.null
  | Some(first) =>
    Null.make({
      min: values->Array.reduce(first, (a, b) => Math.min(a, b)),
      max: values->Array.reduce(first, (a, b) => Math.max(a, b)),
    })
  }

// How much less lightness counts than hue and chroma when clustering and
// classifying. Real per-sticker lightness varies far more shot to shot
// (glare, shadow, exposure) than hue or chroma; weighting it down to 0.6
// (a stable plateau from 0.5 to 0.72 on the real fixtures) cut Red/Orange
// mismatches from 10/228 to 2/228, while weighting it up made them far
// worse. Near-neutral colors have no reliable hue, so below the chroma
// threshold the weight tapers back to full trust in lightness - White's
// identity is high lightness and no chroma. 0.07 sits in the middle of a
// 0.055-0.08 plateau clear of Red/Orange chroma (~0.15-0.19).
let clusterLWeight = 0.6
let clusterChromaThreshold = 0.07

let clusterOklabDistance = (o1: oklab, o2: oklab) => {
  let chroma1 = Math.sqrt(o1.a *. o1.a +. o1.b *. o1.b)
  let chroma2 = Math.sqrt(o2.a *. o2.a +. o2.b *. o2.b)
  // Either point being low-chroma makes hue unreliable for it, so the
  // smaller chroma decides.
  let t = Math.min(1.0, Math.min(chroma1, chroma2) /. clusterChromaThreshold)
  let lWeight = t *. clusterLWeight +. (1.0 -. t)
  let dl = (o1.l -. o2.l) *. lWeight
  let da = o1.a -. o2.a
  let db = o1.b -. o2.b
  Math.sqrt(dl *. dl +. da *. da +. db *. db)
}

let clusterDistance = (c1, c2) => clusterOklabDistance(rgbToOklab(c1), rgbToOklab(c2))

// Turns a distance into a 0-1 confidence: Red-Orange, the closest pair,
// sits ~0.15 apart and White-Blue ~0.63, so a sample on the Red/Orange
// boundary reads moderately confident and one far from its color ~0.
let confidenceDistanceScale = 0.4

type classification = {color: string, confidence: float}

// First-pass classification of a single sticker. With a palette learned
// from an earlier capture it is simply the nearest of those. Without one
// it reads only what's stable across cubes and exposure: nearly no chroma
// is White, otherwise the nearest typical hue - fixed swatches misread 115
// of 294 stickers on a real 7x7. Red and orange stay the least reliable
// until a palette has been learned.
let neutralChroma = 0.04
let typicalHue = [("R", 22.0), ("O", 45.0), ("Y", 105.0), ("G", 150.0), ("B", 255.0)]

let classifySticker = (rgb, palette: option<Dict.t<rgb>>) =>
  switch palette {
  | Some(palette) =>
    let (color, distance) =
      palette
      ->Dict.toArray
      ->Array.reduce(("W", Float.Constants.positiveInfinity), (
        (best, bestDistance),
        (name, centroid),
      ) => {
        let d = clusterDistance(rgb, centroid)
        d < bestDistance ? (name, d) : (best, bestDistance)
      })
    {color, confidence: Math.max(0.0, 1.0 -. distance /. confidenceDistanceScale)}
  | None =>
    let {c, h} = rgbToOKLCH(rgb)

    // Confidence fades to 0.5 as chroma approaches the neutral limit.
    if c < neutralChroma {
      {color: "W", confidence: 1.0 -. c /. neutralChroma *. 0.5}
    } else {
      let byHue =
        typicalHue
        ->Array.map(((name, center)) => {
          let d = Math.abs(h -. center)
          (name, Math.min(d, 360.0 -. d))
        })
        ->Array.toSorted(((_, a), (_, b)) => a -. b)
      let (name, nearest) = byHue->Array.getUnsafe(0)
      let (_, next) = byHue->Array.getUnsafe(1)
      // 1 at a typical hue, 0 halfway to the next one; less sure near neutral.
      let hueConfidence = (next -. nearest) /. (next +. nearest)
      let chromaConfidence = Math.min(1.0, c /. (2.0 *. neutralChroma))
      {color: name, confidence: hueConfidence *. chromaConfidence}
    }
  }

// A per-channel gain, applied in linear light. Only relative gains are
// used: each face's backdrop brought to the others' after all six are in
// (computeBackgroundGains). Live preview and single captures are neutral.
let neutralGains = {r: 1.0, g: 1.0, b: 1.0}

let applyGains = (rgb, gains) => {
  let round = v => clamp(0.0, 255.0, Math.round(v))
  if gains.r == 1.0 && gains.g == 1.0 && gains.b == 1.0 {
    {r: round(rgb.r), g: round(rgb.g), b: round(rgb.b)}
  } else {
    {
      r: linearChannelToSrgb(srgbChannelToLinear(rgb.r) *. gains.r),
      g: linearChannelToSrgb(srgbChannelToLinear(rgb.g) *. gains.g),
      b: linearChannelToSrgb(srgbChannelToLinear(rgb.b) *. gains.b),
    }
  }
}

// A sticker reading as it was before applyGains - exact up to rounding and
// channels clipped at 255.
let removeGains = (rgb, gains) =>
  applyGains(rgb, {r: 1.0 /. gains.r, g: 1.0 /. gains.g, b: 1.0 /. gains.b})

// A photo's pixels (RGBA) adjusted like its stickers are, for showing what
// the backdrop white balance did to a face.
let applyGainsToPixels = (data, gains) => {
  let out = Pixels.make(Pixels.length(data))
  let i = ref(0)
  while i.contents < Pixels.length(data) {
    let at = i.contents
    let {r, g, b} = applyGains(
      {
        r: Int.toFloat(data->Pixels.get(at)),
        g: Int.toFloat(data->Pixels.get(at + 1)),
        b: Int.toFloat(data->Pixels.get(at + 2)),
      },
      gains,
    )
    out->Pixels.setFloat(at, r)
    out->Pixels.setFloat(at + 1, g)
    out->Pixels.setFloat(at + 2, b)
    out->Pixels.set(at + 3, data->Pixels.get(at + 3))
    i := at + 4
  }
  out
}

// A synthetic face photo from a color grid: flat plastic stickers on a dark
// backdrop, shaped like the cropped photos of real captures (the face fills
// the square, stickers are rounded with dark gaps). It is a plain
// parametric model, meant to be improved; a thin border strip carries the
// word SYNTHETIC so no one mistakes the photo for a camera shot.
open StickerGeometry

// The lighting a photo can be rendered with: none, one of the problems the
// color pipeline has to live with, or clean light with the sticker-to-sticker
// scatter of real captures.
let presets = [
  "clean",
  "scatter",
  "real",
  "gradient",
  "shadow",
  "dim-warm",
  "glare",
  "noise",
  "bad-camera",
]

// What real stickers look like in a photo: not the idealized swatches.
let palette = Dict.fromArray([
  ("W", {r: 232.0, g: 232.0, b: 224.0}),
  ("Y", {r: 238.0, g: 206.0, b: 44.0}),
  ("O", {r: 238.0, g: 122.0, b: 34.0}),
  ("R", {r: 190.0, g: 36.0, b: 46.0}),
  ("G", {r: 34.0, g: 150.0, b: 74.0}),
  ("B", {r: 34.0, g: 84.0, b: 192.0}),
])
let backdrop = {r: 20.0, g: 20.0, b: 24.0}
let unknownSticker = {r: 128.0, g: 128.0, b: 128.0}

// Border around the face, as a fraction of the photo's side. It holds the
// lettering and is the backdrop real crops show at their edge.
let marginFraction = 0.035
// Gap between stickers and corner radius, as fractions of a sticker.
let gapFraction = 0.07
let radiusFraction = 0.14

// Counter-based random numbers, so the same seed makes the same photo.
let hash = (seed, i) => {
  let x = seed * 374761393 + i * 668265263
  let x = Int.bitwiseXor(x, Int.shiftRightUnsigned(x, 13)) * 1274126177
  Int.bitwiseXor(x, Int.shiftRightUnsigned(x, 16))
}
let unit = (seed, i) => Int.toFloat(Int.bitwiseAnd(hash(seed, i), 0xFFFFFF)) /. 16777216.0
let gauss = (seed, i) => {
  let u1 = unit(seed, 2 * i) +. 1e-9
  let u2 = unit(seed, 2 * i + 1)
  Math.sqrt(-2.0 *. Math.log(u1)) *. Math.cos(2.0 *. Math.Constants.pi *. u2)
}

let clamp = (v, low, high) => Math.min(high, Math.max(low, v))

// Stickers of one color are not one color: the plastic, its wear and the
// lamp shift each one's hue and chroma (OKLCH) a little. The spreads are the
// medians over the saved captures of valid cubes: hue in degrees, chroma as
// a share of its own mean. White has hardly any chroma, so its hue is all
// over and its chroma varies by a third.
let scatters = Dict.fromArray([
  ("W", (22.0, 0.35)),
  ("Y", (2.5, 0.045)),
  ("O", (1.2, 0.034)),
  ("R", (1.4, 0.043)),
  ("G", (0.7, 0.063)),
  ("B", (1.0, 0.08)),
])
let defaultScatter = (2.0, 0.05)

// How the brightness of a sticker goes with its hue and chroma, measured on
// the saved captures of valid cubes after the lighting gradient of the face
// is taken out: the spread of the brightness (as a share of its own mean)
// and the correlation of the brightness with the chroma and with the hue.
// A darker blue is also a more saturated one; a brighter green leans yellow.
let tones = Dict.fromArray([
  ("W", (0.02, 0.38, -0.03)),
  ("Y", (0.018, -0.09, 0.29)),
  ("O", (0.016, 0.23, -0.35)),
  ("R", (0.035, 0.64, -0.29)),
  ("G", (0.029, 0.53, 0.44)),
  ("B", (0.055, 0.78, -0.34)),
])
let defaultTone = (0.025, 0.0, 0.0)

// One photo is lit and white balanced a little differently from the next, and
// each color feels it differently. The shifts are what the spread of a color
// over all six photos of a cube has left after the spread within a photo
// (scatter, tone and shading) is taken out: brightness and chroma as a share
// of their own mean, hue in degrees. Blue and white are moved the most.
let faceShifts = Dict.fromArray([
  ("W", (0.054, 0.275, 0.0)),
  ("Y", (0.025, 0.041, 2.45)),
  ("O", (0.0, 0.038, 1.37)),
  ("R", (0.044, 0.028, 1.64)),
  ("G", (0.053, 0.0, 0.61)),
  ("B", (0.08, 0.07, 0.36)),
])
let defaultFaceShift = (0.035, 0.05, 1.0)
let shiftLetters = "WYORGB"

// The light falls on a face from one side: brightness changes by a plane
// across the photo, 8 percent per photo width in the median.
let shadingScale = 0.075

// A mix of a shared and an own standard normal value with correlation rho.
let correlated = (shared, own, rho) => rho *. shared +. Math.sqrt(1.0 -. rho *. rho) *. own

let scatterColor = (base: rgb, label, seed, k, ~scatter as scale, ~tone, ~faceShift) => {
  let (hueSpread, chromaSpread) = scatters->Dict.get(label)->Option.getOr(defaultScatter)
  let hueScatter = hueSpread *. scale
  let chromaScatter = chromaSpread *. scale
  let lch = ColorMath.rgbToOKLCH(base)
  let hueNoise = gauss(seed, 6000 + 2 * k)
  let chromaNoise = gauss(seed, 6001 + 2 * k)
  // The brightness deviation of the sticker, and the hue and chroma
  // deviations that go with it.
  let (lightness, hueNoise, chromaNoise) = if tone > 0.0 {
    let (spread, rhoChroma, rhoHue) = tones->Dict.get(label)->Option.getOr(defaultTone)
    let shared = gauss(seed, 10000 + 3 * k)
    (
      lch.l *. (1.0 +. spread *. tone *. shared),
      correlated(shared, hueNoise, rhoHue),
      correlated(shared, chromaNoise, rhoChroma),
    )
  } else {
    (lch.l, hueNoise, chromaNoise)
  }
  let hue = lch.h +. hueNoise *. hueScatter
  let chroma = lch.c *. (1.0 +. chromaNoise *. chromaScatter)
  // The photo as a whole.
  let (lightness, chroma, hue) = if faceShift > 0.0 {
    let (shiftL, shiftC, shiftH) = faceShifts->Dict.get(label)->Option.getOr(defaultFaceShift)
    // One draw per photo and color.
    let letter = shiftLetters->String.indexOf(label)
    let at = 9000 + 3 * (letter < 0 ? String.length(shiftLetters) : letter)
    // The photo's light moves brightness, chroma and hue together, as it
    // does within a photo.
    let (_, rhoChroma, rhoHue) = tones->Dict.get(label)->Option.getOr(defaultTone)
    let shared = gauss(seed, at)
    (
      lightness *. (1.0 +. shiftL *. faceShift *. shared),
      chroma *. (1.0 +. shiftC *. faceShift *. correlated(shared, gauss(seed, at + 1), rhoChroma)),
      hue +. shiftH *. faceShift *. correlated(shared, gauss(seed, at + 2), rhoHue),
    )
  } else {
    (lightness, chroma, hue)
  }
  let radians = hue *. Math.Constants.pi /. 180.0
  let chroma = Math.max(0.0, chroma)
  ColorMath.oklabToRgb({
    l: lightness,
    a: chroma *. Math.cos(radians),
    b: chroma *. Math.sin(radians),
  })
}

// 5x7 lettering for the border strip.
let glyphs = Dict.fromArray([
  ("A", ["01110", "10001", "10001", "11111", "10001", "10001", "10001"]),
  ("B", ["11110", "10001", "10001", "11110", "10001", "10001", "11110"]),
  ("C", ["01110", "10001", "10000", "10000", "10000", "10001", "01110"]),
  ("D", ["11110", "10001", "10001", "10001", "10001", "10001", "11110"]),
  ("E", ["11111", "10000", "10000", "11110", "10000", "10000", "11111"]),
  ("G", ["01110", "10001", "10000", "10111", "10001", "10001", "01111"]),
  ("H", ["10001", "10001", "10001", "11111", "10001", "10001", "10001"]),
  ("I", ["01110", "00100", "00100", "00100", "00100", "00100", "01110"]),
  ("L", ["10000", "10000", "10000", "10000", "10000", "10000", "11111"]),
  ("M", ["10001", "11011", "10101", "10101", "10001", "10001", "10001"]),
  ("N", ["10001", "11001", "10101", "10011", "10001", "10001", "10001"]),
  ("O", ["01110", "10001", "10001", "10001", "10001", "10001", "01110"]),
  ("R", ["11110", "10001", "10001", "11110", "10100", "10010", "10001"]),
  ("S", ["01111", "10000", "10000", "01110", "00001", "00001", "11110"]),
  ("T", ["11111", "00100", "00100", "00100", "00100", "00100", "00100"]),
  ("W", ["10001", "10001", "10001", "10101", "10101", "11011", "10001"]),
  ("Y", ["10001", "10001", "01010", "00100", "00100", "00100", "00100"]),
  ("-", ["00000", "00000", "00000", "11111", "00000", "00000", "00000"]),
])

let setPixel = (data, size, x, y, c: rgb) => {
  let i = (y * size + x) * 4
  Pixels.setFloat(data, i, c.r)
  Pixels.setFloat(data, i + 1, c.g)
  Pixels.setFloat(data, i + 2, c.b)
  Pixels.set(data, i + 3, 255)
}

// A logo on one sticker: a round patch of a palette color on sticker (row,
// col), `size` (default 0.5) of the sticker's half width across its radius.
type logo = {row: int, col: int, color: string, size?: float}

// The face's shape as fractions: the border around it and, of a sticker,
// the gap between stickers and the corner radius.
type geometry = {gap?: float, radius?: float, margin?: float}

// How a shadow lies on the face (see applyShadow).
type shadow = {strength?: float, shape?: string, softness?: float}

// What the generator can be told beyond the grid, preset and seed; every
// field is optional, so options can be added without touching the callers.
// - scatter: scales the hue and chroma spread of stickers of one color; 0 is
//   none, 1 the spread measured in the saved captures. Defaults to 1 for the
//   scatter preset and 0 for all others, so clean stays clear.
// - tone: scales the brightness spread of stickers of one color and ties it
//   to their hue and chroma as in the saved captures (default 1 for the real
//   preset, else 0).
// - shading: scales a plane of light across the photo, as the light falls
//   on a face from one side (default 1 for the real preset, else 0).
// - faceShift: scales a brightness, chroma and hue shift shared by all
//   stickers of the photo, as each photo of a cube is lit a little
//   differently (default 1 for the real preset, else 0).
// - shadow: the strength, shape and edge of a shadow (see shadow); the shadow
//   preset takes it, any other preset gets a shadow when it is given.
// - lightness: scales the brightness scatter between stickers (default 1).
// - palette: sticker colors by letter, replacing the default ones.
// - logo: see above.
// - noise: Gaussian noise (sigma in 0-255 levels) on top of the preset.
// - blur: a box blur of this radius in pixels on top of the preset.
// - brightness: multiplies the light on every pixel (default 1).
// - geometry: see above.
type options = {
  scatter?: float,
  tone?: float,
  shading?: float,
  faceShift?: float,
  lightness?: float,
  palette?: Dict.t<rgb>,
  logo?: logo,
  noise?: float,
  blur?: float,
  brightness?: float,
  geometry?: geometry,
  shadow?: shadow,
}

// The face itself, before any lighting: stickers by their color.
let drawFace = (
  data,
  grid: array<array<string>>,
  seed,
  size,
  ~scatter,
  ~lightness,
  ~tone,
  ~shading,
  ~faceShift,
  ~colors,
  ~logo,
  ~margin as marginShare,
  ~gap as gapShare,
  ~radius as radiusShare,
) => {
  let n = Array.length(grid)
  let side = Int.toFloat(size)
  let margin = Math.round(side *. marginShare)
  let inner = side -. 2.0 *. margin
  let cell = inner /. Int.toFloat(n)
  let gap = Math.max(2.0, cell *. gapShare)
  let radius = cell *. radiusShare
  let half = cell /. 2.0 -. gap /. 2.0
  let corner = half -. radius
  // The plane of light: a direction and a slope per photo width.
  let angle = 2.0 *. Math.Constants.pi *. unit(seed, 7000)
  let slope = shading *. shadingScale *. Math.sqrt(-2.0 *. Math.log(1.0 -. unit(seed, 7001)))
  let planeX = slope *. Math.cos(angle)
  let planeY = slope *. Math.sin(angle)
  for y in 0 to size - 1 {
    for x in 0 to size - 1 {
      let fx = Int.toFloat(x) +. 0.5 -. margin
      let fy = Int.toFloat(y) +. 0.5 -. margin
      let color = if fx < 0.0 || fy < 0.0 || fx >= inner || fy >= inner {
        backdrop
      } else {
        let col = Float.toInt(Math.floor(fx /. cell))
        let row = Float.toInt(Math.floor(fy /. cell))
        let dx = fx -. (Int.toFloat(col) +. 0.5) *. cell
        let dy = fy -. (Int.toFloat(row) +. 0.5) *. cell
        let qx = Math.abs(dx) -. corner
        let qy = Math.abs(dy) -. corner
        let outside = Math.sqrt(
          Math.max(qx, 0.0) *. Math.max(qx, 0.0) +. Math.max(qy, 0.0) *. Math.max(qy, 0.0),
        )
        // Negative inside the sticker, in pixels.
        let distance = outside +. Math.min(Math.max(qx, qy), 0.0) -. radius
        let coverage = clamp(0.5 -. distance, 0.0, 1.0)
        let label = grid->Array.getUnsafe(row)->Array.getUnsafe(col)
        let base = scatterColor(
          colors->Dict.get(label)->Option.getOr(unknownSticker),
          label,
          seed,
          row * n + col,
          ~scatter,
          ~tone,
          ~faceShift,
        )
        // A logo patch takes the palette color of the logo.
        let base = switch logo {
        | Some({row: logoRow, col: logoCol, color: logoColor, ?size})
          if logoRow == row && logoCol == col =>
          let reach = size->Option.getOr(0.5) *. half
          if Math.sqrt(dx *. dx +. dy *. dy) <= reach {
            colors->Dict.get(logoColor)->Option.getOr(unknownSticker)
          } else {
            base
          }
        | _ => base
        }
        // Darker toward the rim, a little lighter toward one corner, and each
        // sticker a touch different from the next.
        let rim = 1.0 -. 0.1 *. clamp(1.0 -. -.distance /. (cell *. 0.08), 0.0, 1.0)
        let tilt = 1.0 +. 0.04 *. (-.(dx +. dy) /. cell)
        let jitter = 1.0 +. (unit(seed, row * n + col + 1000) -. 0.5) *. 0.05 *. lightness
        let shade = rim *. tilt *. jitter
        {
          r: backdrop.r *. (1.0 -. coverage) +. base.r *. shade *. coverage,
          g: backdrop.g *. (1.0 -. coverage) +. base.g *. shade *. coverage,
          b: backdrop.b *. (1.0 -. coverage) +. base.b *. shade *. coverage,
        }
      }
      // A gentle vignette over the whole photo.
      let cx = Int.toFloat(x) /. side -. 0.5
      let cy = Int.toFloat(y) /. side -. 0.5
      let falloff = 1.0 -. 0.07 *. 4.0 *. (cx *. cx +. cy *. cy)
      let falloff = shading > 0.0 ? falloff *. (1.0 +. planeX *. cx +. planeY *. cy) : falloff
      setPixel(
        data,
        size,
        x,
        y,
        {r: color.r *. falloff, g: color.g *. falloff, b: color.b *. falloff},
      )
    }
  }
}

// Applies f to every pixel with its position in the photo (0-1) and index.
let eachPixel = (data, size, f: (float, float, int, int, int, int) => (float, float, float)) => {
  let side = Int.toFloat(size)
  for y in 0 to size - 1 {
    for x in 0 to size - 1 {
      let i = (y * size + x) * 4
      let (r, g, b) = f(
        Int.toFloat(x) /. side,
        Int.toFloat(y) /. side,
        Pixels.get(data, i),
        Pixels.get(data, i + 1),
        Pixels.get(data, i + 2),
        y * size + x,
      )
      Pixels.setFloat(data, i, r)
      Pixels.setFloat(data, i + 1, g)
      Pixels.setFloat(data, i + 2, b)
    }
  }
}

let addNoise = (data, size, seed, sigma) =>
  eachPixel(data, size, (_, _, r, g, b, k) => (
    Int.toFloat(r) +. gauss(seed, 3 * k) *. sigma,
    Int.toFloat(g) +. gauss(seed, 3 * k + 1) *. sigma,
    Int.toFloat(b) +. gauss(seed, 3 * k + 2) *. sigma,
  ))

// Red rises and blue falls from left to right: light of two colors from
// either side.
let applyGradient = (data, size) =>
  eachPixel(data, size, (t, _, r, g, b, _) => (
    Int.toFloat(r) *. (0.7 +. 0.6 *. t),
    Int.toFloat(g),
    Int.toFloat(b) *. (1.3 -. 0.6 *. t),
  ))

// How a shadow lies on the face. strength is how much light it takes (0.15
// is a soft real shadow), softness the width of its edge as a share of the
// photo, and shape one of the names below.
let shadowShapes = ["band", "half", "spot", "corner"]
let defaultShadowStrength = 0.15
let defaultShadowSoftness = 0.03

// A shadow: dimmer than its surroundings, in the given shape.
// - band: a diagonal band across the face.
// - half: everything below the diagonal through the middle.
// - spot: a round patch toward the upper right.
// - corner: a round patch around the lower right corner.
let applyShadow = (data, size, shadow: shadow) => {
  let shape = shadow.shape->Option.getOr("band")
  if !(shadowShapes->Array.includes(shape)) {
    JsError.throwWithMessage(`Unknown shadow shape: ${shape}`)
  }
  let strength = shadow.strength->Option.getOr(defaultShadowStrength)
  let width = Math.max(shadow.softness->Option.getOr(defaultShadowSoftness), 1e-6)
  eachPixel(data, size, (tx, ty, r, g, b, _) => {
    let inside = switch shape {
    | "half" => clamp(((tx +. ty) /. 2.0 -. 0.5) /. width +. 0.5, 0.0, 1.0)
    | "spot" =>
      let d = Math.sqrt((tx -. 0.65) *. (tx -. 0.65) +. (ty -. 0.35) *. (ty -. 0.35))
      clamp((0.25 -. d) /. width, 0.0, 1.0)
    | "corner" =>
      let d = Math.sqrt((tx -. 1.0) *. (tx -. 1.0) +. (ty -. 1.0) *. (ty -. 1.0))
      clamp((0.7 -. d) /. width, 0.0, 1.0)
    | _ =>
      let t = (tx +. ty) /. 2.0
      clamp((t -. 0.4) /. width, 0.0, 1.0) *. clamp((0.65 -. t) /. width, 0.0, 1.0)
    }
    let factor = 1.0 -. strength *. inside
    (Int.toFloat(r) *. factor, Int.toFloat(g) *. factor, Int.toFloat(b) *. factor)
  })
}

// Little light, and a warm one: blue is hit hardest.
let applyDimWarm = (data, size) =>
  eachPixel(data, size, (_, _, r, g, b, _) => (
    Int.toFloat(r) *. 0.6,
    Int.toFloat(g) *. 0.5,
    Int.toFloat(b) *. 0.35,
  ))

// Four soft highlights toward white, where the plastic mirrors a lamp.
let applyGlare = (data, size, seed) => {
  let spots = Array.fromInitializer(~length=4, k => (
    unit(seed, 5000 + k * 4),
    unit(seed, 5001 + k * 4),
    0.06 +. unit(seed, 5002 + k * 4) *. 0.08,
    0.05 +. unit(seed, 5003 + k * 4) *. 0.07,
  ))
  eachPixel(data, size, (x, y, r, g, b, _) => {
    let weight = spots->Array.reduce(0.0, (acc, (cx, cy, rx, ry)) => {
      let q = (x -. cx) *. (x -. cx) /. (rx *. rx) +. (y -. cy) *. (y -. cy) /. (ry *. ry)
      Math.max(acc, q < 1.0 ? 0.7 *. (1.0 -. q) : 0.0)
    })
    let mix = c => Int.toFloat(c) *. (1.0 -. weight) +. 255.0 *. weight
    (mix(r), mix(g), mix(b))
  })
}

// A soft lens: a box blur of the given radius in pixels.
// The bad-camera preset uses half a percent of the photo.
let blur = (data, size, radius) => {
  let source = Pixels.make(Pixels.length(data))
  Pixels.setFrom(source, data, 0)
  let pass = (from, into, horizontal) =>
    for y in 0 to size - 1 {
      for x in 0 to size - 1 {
        let sums = [0, 0, 0]
        let count = ref(0)
        for d in -radius to radius {
          let xx = horizontal ? Math.Int.min(size - 1, Math.Int.max(0, x + d)) : x
          let yy = horizontal ? y : Math.Int.min(size - 1, Math.Int.max(0, y + d))
          let j = (yy * size + xx) * 4
          for c in 0 to 2 {
            sums->Array.setUnsafe(c, sums->Array.getUnsafe(c) + Pixels.get(from, j + c))
          }
          count := count.contents + 1
        }
        let i = (y * size + x) * 4
        for c in 0 to 2 {
          Pixels.setFloat(
            into,
            i + c,
            Int.toFloat(sums->Array.getUnsafe(c)) /. Int.toFloat(count.contents),
          )
        }
        Pixels.set(into, i + 3, 255)
      }
    }
  let middle = Pixels.make(Pixels.length(data))
  pass(source, middle, true)
  pass(middle, data, false)
}

// SYNTHETIC and the preset's name, light on the dark bottom border.
let drawLabel = (data, size, preset, marginShare) => {
  let side = Int.toFloat(size)
  let margin = Float.toInt(Math.round(side *. marginShare))
  let scale = Math.Int.max(1, (margin - 4) / 7)
  let text = `SYNTHETIC ${String.toUpperCase(preset)}`
  let lettering = {r: 170.0, g: 170.0, b: 176.0}
  let top = size - margin + (margin - 7 * scale) / 2
  text
  ->String.split("")
  ->Array.forEachWithIndex((char, index) =>
    switch glyphs->Dict.get(char) {
    | None => ()
    | Some(rows) =>
      rows->Array.forEachWithIndex((row, gy) =>
        row
        ->String.split("")
        ->Array.forEachWithIndex(
          (bit, gx) =>
            if bit == "1" {
              for dy in 0 to scale - 1 {
                for dx in 0 to scale - 1 {
                  setPixel(
                    data,
                    size,
                    margin + (index * 6 + gx) * scale + dx,
                    top + gy * scale + dy,
                    lettering,
                  )
                }
              }
            },
        )
      )
    }
  )
}

// The photo of one face, size x size RGBA pixels, in the given lighting.
// The same grid, preset and seed always make the same photo.
let defaultBlurRadius = size => Math.max(1.0, Math.round(Int.toFloat(size) *. 0.006))->Float.toInt

let renderFace = (
  grid: array<array<string>>,
  preset: string,
  seed: int,
  size: int,
  options: options,
) => {
  if !(presets->Array.includes(preset)) {
    JsError.throwWithMessage(`Unknown synthetic preset: ${preset}`)
  }
  let real = preset == "real"
  let geometry = options.geometry->Option.getOr({})
  let marginShare = geometry.margin->Option.getOr(marginFraction)
  let colors = switch options.palette {
  | None => palette
  | Some(own) => Dict.fromArray(Array.concat(palette->Dict.toArray, own->Dict.toArray))
  }
  let data = Pixels.make(size * size * 4)
  drawFace(
    data,
    grid,
    seed,
    size,
    ~scatter=options.scatter->Option.getOr(preset == "scatter" || real ? 1.0 : 0.0),
    ~lightness=options.lightness->Option.getOr(real ? 0.0 : 1.0),
    ~tone=options.tone->Option.getOr(real ? 1.0 : 0.0),
    ~shading=options.shading->Option.getOr(real ? 1.0 : 0.0),
    ~faceShift=options.faceShift->Option.getOr(real ? 1.0 : 0.0),
    ~colors,
    ~logo=options.logo,
    ~margin=marginShare,
    ~gap=geometry.gap->Option.getOr(gapFraction),
    ~radius=geometry.radius->Option.getOr(radiusFraction),
  )
  switch preset {
  | "gradient" => applyGradient(data, size)
  | "shadow" => applyShadow(data, size, options.shadow->Option.getOr({}))
  | "dim-warm" =>
    applyDimWarm(data, size)
    addNoise(data, size, seed, 8.0)
  | "glare" => applyGlare(data, size, seed)
  | "noise" => addNoise(data, size, seed, 20.0)
  | "bad-camera" =>
    blur(data, size, defaultBlurRadius(size))
    addNoise(data, size, seed, 15.0)
  | _ => ()
  }
  // On top of the preset: a shadow, more light or less, a lens, noise.
  switch options.shadow {
  | Some(shadow) if preset != "shadow" => applyShadow(data, size, shadow)
  | _ => ()
  }
  switch options.brightness {
  | Some(factor) =>
    eachPixel(data, size, (_, _, r, g, b, _) => (
      Int.toFloat(r) *. factor,
      Int.toFloat(g) *. factor,
      Int.toFloat(b) *. factor,
    ))
  | None => ()
  }
  switch options.blur {
  | Some(radius) if radius >= 1.0 => blur(data, size, Float.toInt(Math.round(radius)))
  | _ => ()
  }
  switch options.noise {
  | Some(sigma) if sigma > 0.0 => addNoise(data, size, seed + 7919, sigma)
  | _ => ()
  }
  drawLabel(data, size, preset, marginShare)
  data
}

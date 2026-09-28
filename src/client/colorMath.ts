import type { RGB } from './stickerColorGeometry'

// ─────────────────────────────────────────────────────────────────────────────
// OKLCH color space
//
// Sticker classification measures "closeness" in OKLCH (Björn Ottosson's
// perceptually-uniform Oklab, in its polar Lightness/Chroma/Hue form - the
// same space CSS's oklch() uses), not raw sRGB. Plain RGB Euclidean
// distance is a poor stand-in for how different two colors actually look:
// canonical Red (255,0,0) and Orange (255,127,0) sit only 127 units apart,
// entirely on the G channel - a modest lighting- or camera-driven G shift
// is enough to flip which one a sample reads as closer to. OKLCH separates
// hue from lightness/chroma explicitly, which is the property that
// actually distinguishes Red from Orange perceptually.
//
// Distance is computed in Oklab's Cartesian (L,a,b) form, not polar
// (L,C,h): they're the same space (a = C·cos h, b = C·sin h), but
// Cartesian Euclidean distance avoids the circular-wraparound edge case
// hue angles have at 0°/360° that a naive |h1-h2| would need special
// handling for.
// ─────────────────────────────────────────────────────────────────────────────

export interface OKLCH {
  l: number // lightness, 0-1
  c: number // chroma, unbounded (~0-0.4 for in-gamut sRGB)
  h: number // hue, degrees, 0-360
}

export type Oklab = { l: number; a: number; b: number }

export function srgbChannelToLinear(c: number): number {
  const v = c / 255
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
}

// Internal Cartesian form - what colorDistance actually computes in.
// Matrices per Ottosson's OKLab reference (https://bottosson.github.io/posts/oklab/).
export function rgbToOklab(rgb: RGB): Oklab {
  return linearRgbToOklab(
    srgbChannelToLinear(rgb.r),
    srgbChannelToLinear(rgb.g),
    srgbChannelToLinear(rgb.b),
  )
}

// The same from linear-light channels, which may exceed 1 (a color scaled
// past what sRGB can store, see balancedPaletteDistance).
export function linearRgbToOklab(r: number, g: number, b: number): Oklab {
  const l_ = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m_ = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s_ = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)

  return {
    l: 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  }
}

export function linearChannelToSrgb(v: number): number {
  const clamped = Math.max(0, Math.min(1, v))
  const encoded =
    clamped <= 0.0031308
      ? clamped * 12.92
      : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055
  return Math.max(0, Math.min(255, Math.round(encoded * 255)))
}

// Inverse of rgbToOklab - needed because k-means averages cluster members
// in this same OKLab space (see kMeansCluster) rather than in RGB, so each
// updated centroid has to be converted back to RGB for display/storage.
// Matrices per Ottosson's OKLab reference (the exact inverse of the ones
// rgbToOklab uses).
export function oklabToRgb(lab: Oklab): RGB {
  const l_ = lab.l + 0.3963377774 * lab.a + 0.2158037573 * lab.b
  const m_ = lab.l - 0.1055613458 * lab.a - 0.0638541728 * lab.b
  const s_ = lab.l - 0.0894841775 * lab.a - 1.291485548 * lab.b

  const l = l_ * l_ * l_
  const m = m_ * m_ * m_
  const s = s_ * s_ * s_

  return {
    r: linearChannelToSrgb(
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    ),
    g: linearChannelToSrgb(
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    ),
    b: linearChannelToSrgb(
      -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
    ),
  }
}

export function rgbToOKLCH(rgb: RGB): OKLCH {
  const { l, a, b } = rgbToOklab(rgb)
  const c = Math.sqrt(a * a + b * b)
  const hRad = Math.atan2(b, a)
  const h = hRad < 0 ? (hRad * 180) / Math.PI + 360 : (hRad * 180) / Math.PI
  return { l, c, h }
}

export interface HueRange {
  min: number
  max: number
  span: number
}

// The smallest arc (min degrees .. max degrees, going clockwise from min
// to max) that contains every given hue - NOT a naive Math.min/Math.max,
// which breaks near the 0°/360° wraparound (e.g. samples at 355° and 5°
// are 10° apart on the circle, but a plain min/max reports an incorrect
// 350° span). Finds the largest gap between consecutive hues around the
// circle; the arc is everything else, starting right after that gap.
export function hueCircularRange(hues: number[]): HueRange | null {
  if (hues.length === 0) return null
  const sorted = [...hues].sort((a, b) => a - b)
  let largestGap = 0
  let gapStartIdx = sorted.length - 1 // gap from last (wrapping) to first
  for (let i = 0; i < sorted.length; i++) {
    const prev = i === 0 ? sorted[sorted.length - 1] - 360 : sorted[i - 1]
    const gap = sorted[i] - prev
    if (gap > largestGap) {
      largestGap = gap
      gapStartIdx = i === 0 ? sorted.length - 1 : i - 1
    }
  }
  const min = sorted[(gapStartIdx + 1) % sorted.length]
  const max = sorted[gapStartIdx]
  const span = 360 - largestGap
  return { min, max, span }
}

// Whether two hueCircularRange arcs share any point on the circle.
// Deliberately NOT solved with modular-arithmetic interval-overlap
// formulas (get the wraparound/containment cases subtly wrong easily,
// and this file has already hit that class of bug once with the corner/
// edge facelet tables) - instead walks a fine (0.5°) discretization of
// the whole circle and checks direct membership in both arcs. Slower
// than a closed-form check, but by a trivially small, one-time-per-
// render amount (720 steps), and its correctness doesn't depend on
// getting a wraparound case right by construction.
export function hueRangesOverlap(a: HueRange, b: HueRange): boolean {
  const STEPS = 720
  const inArc = (deg: number, r: HueRange) => {
    const rel = (((deg - r.min) % 360) + 360) % 360
    return rel <= r.span + 1e-9
  }
  for (let i = 0; i < STEPS; i++) {
    const deg = (i * 360) / STEPS
    if (inArc(deg, a) && inArc(deg, b)) return true
  }
  return false
}

export interface LinearRange {
  min: number
  max: number
}

// Plain min/max range for OKLCH's lightness and chroma - unlike hue, these
// are bounded (not circular), so no wraparound handling is needed.
export function linearRange(values: number[]): LinearRange | null {
  if (values.length === 0) return null
  return { min: Math.min(...values), max: Math.max(...values) }
}

// How much less the L (lightness) axis counts than a/b (hue+chroma) in the
// learnStickerColors clustering pipeline (and classifySticker's palette
// lookup) - rather than a plain, unweighted OKLab distance. Counterintuitive
// finding (2026-09-23 real-fixture design discussion, "F3"): Red/Orange's
// average L gap looked like the more reliable separator than hue in real
// captures, so the first attempt WEIGHTED L UP - that made things much
// worse (10/228 real-fixture mismatches -> 125/228 at high weights).
// Real per-sticker L varies far more than hue/chroma does shot-to-shot
// (glare, shadow, exposure), so weighting it up let that noise dominate
// the metric for every color pair, not just the close ones. Weighting L
// DOWN instead - discounting the noisier axis rather than trusting it
// more - is what actually helped: 0.6 sits in the middle of a stable
// plateau (0.5-0.72 score identically) found by sweeping against all 4
// real fixtures, dropping mismatches to 2/228 (both remaining cases are
// genuine Red/Orange hue-boundary ties with no signal left to resolve).
//
// This discount is WRONG for White (or any near-neutral sample): hue is
// only meaningful when there's enough chroma to compute it from - a real
// White cluster's hue was observed spanning 27°-209° on a live capture
// (near-zero chroma makes atan2(b,a) numerically unstable), so for a
// low-chroma point, L isn't a noisy also-ran, it's the ONLY reliable
// signal (White's entire identity IS "high L, ~zero C"). Discounting L
// there was letting hue noise pull White toward whatever saturated color
// its meaningless hue reading happened to land near - CLUSTER_L_WEIGHT
// only applies once chroma clears CLUSTER_CHROMA_THRESHOLD; below that it
// tapers smoothly back to full trust in L.
//
// Threshold swept against all 5 real fixtures on hand at the time
// (2026-09-23): 0.1 was too wide - it softened the discount for
// legitimate Red/Orange comparisons too (their chroma sits ~0.15-0.19,
// not far above 0.1), regressing a fixture that CLUSTER_L_WEIGHT alone
// had fully fixed (0/54 -> back to 4/54 wrong). 0.055-0.08 is a real
// plateau clear of that interference - 0.07 sits in the middle, and
// incidentally cleared the two remaining Red/Orange hue-ties on that
// same fixture too (0/54), on top of protecting White. No fixture on
// hand at tuning time actually exercised a live White-hue-noise failure
// (the one that first surfaced this, a 2026-09-23 capture with visible
// White/Orange confusion, was overwritten before it could be saved as a
// regression fixture) - so this specific threshold's benefit for White
// is reasoned from the mechanism and the 27°-209° hue-span observation,
// not yet confirmed by a saved before/after fixture. Revisit if a future
// White-confusion fixture shows this doesn't actually help.
const CLUSTER_L_WEIGHT = 0.6
const CLUSTER_CHROMA_THRESHOLD = 0.07

export function clusterOklabDistance(o1: Oklab, o2: Oklab): number {
  const chroma1 = Math.sqrt(o1.a * o1.a + o1.b * o1.b)
  const chroma2 = Math.sqrt(o2.a * o2.a + o2.b * o2.b)
  // Either point being low-chroma is enough to make hue unreliable FOR
  // THAT POINT, so the discount is gated on the smaller of the two - not
  // an average, which would still under-trust L when comparing a
  // genuinely-white point to a saturated one.
  const t = Math.min(1, Math.min(chroma1, chroma2) / CLUSTER_CHROMA_THRESHOLD)
  const lWeight = t * CLUSTER_L_WEIGHT + (1 - t) * 1
  const dl = (o1.l - o2.l) * lWeight
  const da = o1.a - o2.a
  const db = o1.b - o2.b
  return Math.sqrt(dl * dl + da * da + db * db)
}

export function clusterDistance(c1: RGB, c2: RGB): number {
  return clusterOklabDistance(rgbToOklab(c1), rgbToOklab(c2))
}

// Calibration for turning an OKLab colorDistance into a 0-1 confidence
// score (see cellConfidence below): the closest pair of the 6 canonical
// colors (Red-Orange) sits ~0.15 apart in this space, and the farthest
// (White-Blue) ~0.63 apart. 0.4 sits between those, so a sample right on
// the Red/Orange boundary reads as a moderate-but-flagged confidence
// rather than a false "high confidence", while a sample nowhere near its
// assigned color reads as ~0.
export const CONFIDENCE_DISTANCE_SCALE = 0.4

// First-pass classification of a single sticker, before (or without) the
// cross-face learning in learnStickerColors - what the live preview, the
// sampling setup and each face's initial colors show.
//
// With a `palette` (the colors learned from an earlier capture of the same
// cube, see cube profiles in index.tsx) it's simply the nearest of those.
// Without one it must not assume particular sticker shades: comparing to
// fixed swatches (STICKER_COLORS) misread 115 of 294 stickers on a real
// 7x7 capture - a dim white is closer to orange than to pure white, and
// real oranges (hue 30-45) are far redder than the swatch (53). So it
// reads only what's stable across manufacturers and exposure: nearly no
// chroma is White, otherwise the nearest typical hue. Red and orange sit
// close in hue and where exactly varies by cube and lighting, so those two
// stay the least reliable until a palette has been learned.
const NEUTRAL_CHROMA = 0.04
const TYPICAL_HUE: Record<string, number> = {
  R: 22,
  O: 45,
  Y: 105,
  G: 150,
  B: 255,
}

export function classifySticker(
  rgb: RGB,
  palette?: Record<string, RGB>,
): { color: string; confidence: number } {
  if (palette) {
    let color = 'W'
    let distance = Infinity
    for (const [name, centroid] of Object.entries(palette)) {
      const d = clusterDistance(rgb, centroid)
      if (d < distance) {
        distance = d
        color = name
      }
    }
    return {
      color,
      confidence: Math.max(0, 1 - distance / CONFIDENCE_DISTANCE_SCALE),
    }
  }
  const { c, h } = rgbToOKLCH(rgb)
  // Confidence fades to 0.5 as chroma approaches the neutral limit.
  if (c < NEUTRAL_CHROMA)
    return { color: 'W', confidence: 1 - (c / NEUTRAL_CHROMA) * 0.5 }
  const byHue = Object.entries(TYPICAL_HUE)
    .map(([name, center]) => ({
      name,
      d: Math.min(Math.abs(h - center), 360 - Math.abs(h - center)),
    }))
    .sort((a, b) => a.d - b.d)
  // 1 at a typical hue, 0 halfway to the next one; less sure near neutral.
  const hueConfidence = (byHue[1].d - byHue[0].d) / (byHue[1].d + byHue[0].d)
  const chromaConfidence = Math.min(1, c / (2 * NEUTRAL_CHROMA))
  return { color: byHue[0].name, confidence: hueConfidence * chromaConfidence }
}

// ─────────────────────────────────────────────────────────────────────────────
// Gains
//
// A per-channel multiplicative gain {r,g,b}, applicable to sampled RGB
// before classification (a simple diagonal, von Kries-style correction —
// no cross-channel terms, no offset). The app deliberately does NOT use
// this to estimate or correct white balance in software any more — no
// user-facing WB mode, no gray-world estimate from the frame. Two reasons:
// getUserMedia/ImageCapture give no reliable way to know what the camera's
// own hardware auto-WB already did to a frame, so a software gain on top
// is correcting an unknown, possibly-already-corrected input; and the
// actual, confirmed fix for real-capture misclassification is on the
// CLASSIFICATION TARGET side, not the pixel side - learnStickerColors
// (+ its canonical-anchor shrinkage) shifts each of the 6 reference colors
// to match what THIS capture's stickers actually measured, which directly
// addresses the failure vector (distance to the wrong reference color)
// instead of trying to normalize pixels toward an assumed-neutral state
// first. The one gain that is applied is relative, not absolute: after
// all 6 faces are in, each face's backdrop is brought to the others'
// (computeBackgroundGains), evening out drift between the shots. Live
// preview and single captures use NEUTRAL_GAINS.
// ─────────────────────────────────────────────────────────────────────────────

export const NEUTRAL_GAINS: RGB = { r: 1, g: 1, b: 1 }

// Gains scale light, so they apply in linear light: sRGB values are
// decoded, scaled and encoded again (see computeBackgroundGains).
export function applyGains(rgb: RGB, gains: RGB): RGB {
  const round = (v: number) => Math.max(0, Math.min(255, Math.round(v)))
  if (gains.r === 1 && gains.g === 1 && gains.b === 1)
    return { r: round(rgb.r), g: round(rgb.g), b: round(rgb.b) }
  return {
    r: linearChannelToSrgb(srgbChannelToLinear(rgb.r) * gains.r),
    g: linearChannelToSrgb(srgbChannelToLinear(rgb.g) * gains.g),
    b: linearChannelToSrgb(srgbChannelToLinear(rgb.b) * gains.b),
  }
}

// A sticker reading as it was before applyGains - exact up to rounding and
// channels clipped at 255, since the gains scale a sticker's averaged color.
export function removeGains(rgb: RGB, gains: RGB): RGB {
  return applyGains(rgb, { r: 1 / gains.r, g: 1 / gains.g, b: 1 / gains.b })
}

// A photo's pixels (RGBA) adjusted like its stickers are, for showing what
// the backdrop white balance did to a face.
export function applyGainsToPixels(
  data: Uint8ClampedArray,
  gains: RGB,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(data.length)
  for (let i = 0; i < data.length; i += 4) {
    const { r, g, b } = applyGains(
      { r: data[i], g: data[i + 1], b: data[i + 2] },
      gains,
    )
    out[i] = r
    out[i + 1] = g
    out[i + 2] = b
    out[i + 3] = data[i + 3]
  }
  return out
}

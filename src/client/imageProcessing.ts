// Image processing utilities for cube face detection and color extraction

import { ALIGNMENT_MAX_OFFSET, alignFace, cellEdges, estimateOuterCellRatio } from './gridAlignment'

export interface ColorDetectionResult {
  colors: string[][]
  confidence: number
  cellConfidences: number[][]
  cellColors: RGB[][]
  // Per sticker, the other color it sits close to the boundary with (see
  // nearestOtherColor), or null when it's clearly its own color. Only set
  // after the cross-face recalibration, since it needs the learned colors.
  cellLookalikes?: (string | null)[][]
  // Where the sampled square sat relative to the capture guide, when it was
  // aligned onto the sticker grid: center offset and size, in guide sizes,
  // and its tilt in degrees.
  gridOffset?: { x: number; y: number; scale: number; angle: number }
  // Width of the outer rows/columns relative to the inner ones, when the
  // face showed wider perimeter cubies (see cellEdges); sampled that way.
  outerCellRatio?: number
}

export interface RGB {
  r: number
  g: number
  b: number
}

// Fraction of each sticker cell actually sampled, centered — the rest is a
// dead zone the color/edge detectors ignore. Exported so the UI can draw
// the same boundary the detector actually uses, instead of implying the
// whole cell is being read.
export const SAMPLE_CORE_FRACTION = 0.6

// Which parts of the frame get sampled - adjustable per cube size in the
// capture dialog's sampling setup, since cubes differ in how wide the gaps
// between stickers are, and in how much cube body and hand shows around
// the face.
export interface SamplingGeometry {
  // Band around the guide square that's left out of the background sample
  // (see extractBackgroundColor), as a fraction of the square's side on
  // each side - covers the cube's own plastic edge and the fingers holding
  // it, which aren't the constant backdrop the white balance relies on.
  backgroundGap: number
  // Fraction of each sticker cell that's sampled, centered (the rest is
  // the gap/dead zone around it).
  stickerCore: number
}

export const DEFAULT_SAMPLING: SamplingGeometry = { backgroundGap: 0, stickerCore: SAMPLE_CORE_FRACTION }

// Largest backgroundGap that still leaves some background inside the frame
// (the guide square is SAMPLE_FACE_FRACTION of the frame's shorter side).
export const MAX_BACKGROUND_GAP = 0.3

// A sticker cell's sampled rectangle within a face of the given size -
// shared by the detector and the UI overlay so both draw the same zones.
// `outerCellRatio` widens the outer rows and columns (see cellEdges).
export function stickerSampleRect(
  row: number,
  col: number,
  gridSize: number,
  faceWidth: number,
  faceHeight: number,
  sampling: SamplingGeometry = DEFAULT_SAMPLING,
  outerCellRatio = 1
): { x: number; y: number; width: number; height: number } {
  const inset = (1 - sampling.stickerCore) / 2
  if (outerCellRatio === 1) {
    // Even cells, computed exactly as always so saved readings still match.
    const cellWidth = faceWidth / gridSize
    const cellHeight = faceHeight / gridSize
    return {
      x: (col + inset) * cellWidth,
      y: (row + inset) * cellHeight,
      width: cellWidth * sampling.stickerCore,
      height: cellHeight * sampling.stickerCore,
    }
  }
  const edges = cellEdges(gridSize, outerCellRatio)
  const cellWidth = (edges[col + 1] - edges[col]) * faceWidth
  const cellHeight = (edges[row + 1] - edges[row]) * faceHeight
  return {
    x: edges[col] * faceWidth + inset * cellWidth,
    y: edges[row] * faceHeight + inset * cellHeight,
    width: cellWidth * sampling.stickerCore,
    height: cellHeight * sampling.stickerCore,
  }
}

// Standard cube sticker colors (WCA compliant)
export const STICKER_COLORS: Record<string, RGB> = {
  W: { r: 255, g: 255, b: 255 }, // White
  Y: { r: 255, g: 255, b: 0 },   // Yellow
  O: { r: 255, g: 127, b: 0 },   // Orange
  R: { r: 255, g: 0, b: 0 },     // Red
  G: { r: 0, g: 128, b: 0 },     // Green
  B: { r: 0, g: 0, b: 255 },     // Blue
}

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

type Oklab = { l: number; a: number; b: number }

function srgbChannelToLinear(c: number): number {
  const v = c / 255
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
}

// Internal Cartesian form - what colorDistance actually computes in.
// Matrices per Ottosson's OKLab reference (https://bottosson.github.io/posts/oklab/).
function rgbToOklab(rgb: RGB): Oklab {
  const r = srgbChannelToLinear(rgb.r)
  const g = srgbChannelToLinear(rgb.g)
  const b = srgbChannelToLinear(rgb.b)

  const l_ = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m_ = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s_ = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)

  return {
    l: 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_,
  }
}

function linearChannelToSrgb(v: number): number {
  const clamped = Math.max(0, Math.min(1, v))
  const encoded = clamped <= 0.0031308 ? clamped * 12.92 : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055
  return Math.max(0, Math.min(255, Math.round(encoded * 255)))
}

// Inverse of rgbToOklab - needed because k-means averages cluster members
// in this same OKLab space (see kMeansCluster) rather than in RGB, so each
// updated centroid has to be converted back to RGB for display/storage.
// Matrices per Ottosson's OKLab reference (the exact inverse of the ones
// rgbToOklab uses).
function oklabToRgb(lab: Oklab): RGB {
  const l_ = lab.l + 0.3963377774 * lab.a + 0.2158037573 * lab.b
  const m_ = lab.l - 0.1055613458 * lab.a - 0.0638541728 * lab.b
  const s_ = lab.l - 0.0894841775 * lab.a - 1.2914855480 * lab.b

  const l = l_ * l_ * l_
  const m = m_ * m_ * m_
  const s = s_ * s_ * s_

  return {
    r: linearChannelToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: linearChannelToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: linearChannelToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s),
  }
}

export function rgbToOKLCH(rgb: RGB): OKLCH {
  const { l, a, b } = rgbToOklab(rgb)
  const c = Math.sqrt(a * a + b * b)
  const hRad = Math.atan2(b, a)
  const h = hRad < 0 ? (hRad * 180) / Math.PI + 360 : (hRad * 180) / Math.PI
  return { l, c, h }
}

// The three OKLCH component values as CSS oklch()'s own percentage/degree
// units (https://www.w3.org/TR/css-color-4/#specifying-oklch), without the
// oklch(...) wrapper: lightness is already 0-1 so it maps directly to
// 0%-100%, and chroma's percentage form is spec-defined as 100% == 0.4
// (chroma is otherwise unitless, ~0-0.4 for in-gamut sRGB).
export function formatOKLCHValues(oklch: OKLCH): string {
  const lPct = Math.round(oklch.l * 100)
  const cPct = Math.round((oklch.c / 0.4) * 100)
  const h = Math.round(oklch.h)
  return `${lPct}% ${cPct}% ${h}deg`
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
    if (gap > largestGap) { largestGap = gap; gapStartIdx = i === 0 ? sorted.length - 1 : i - 1 }
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
    const rel = ((deg - r.min) % 360 + 360) % 360
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

function clusterOklabDistance(o1: Oklab, o2: Oklab): number {
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

function clusterDistance(c1: RGB, c2: RGB): number {
  return clusterOklabDistance(rgbToOklab(c1), rgbToOklab(c2))
}

// Calibration for turning an OKLab colorDistance into a 0-1 confidence
// score (see cellConfidence below): the closest pair of the 6 canonical
// colors (Red-Orange) sits ~0.15 apart in this space, and the farthest
// (White-Blue) ~0.63 apart. 0.4 sits between those, so a sample right on
// the Red/Orange boundary reads as a moderate-but-flagged confidence
// rather than a false "high confidence", while a sample nowhere near its
// assigned color reads as ~0.
const CONFIDENCE_DISTANCE_SCALE = 0.4

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
const TYPICAL_HUE: Record<string, number> = { R: 22, O: 45, Y: 105, G: 150, B: 255 }

export function classifySticker(rgb: RGB, palette?: Record<string, RGB>): { color: string; confidence: number } {
  if (palette) {
    let color = 'W'
    let distance = Infinity
    for (const [name, centroid] of Object.entries(palette)) {
      const d = clusterDistance(rgb, centroid)
      if (d < distance) { distance = d; color = name }
    }
    return { color, confidence: Math.max(0, 1 - distance / CONFIDENCE_DISTANCE_SCALE) }
  }
  const { c, h } = rgbToOKLCH(rgb)
  // Confidence fades to 0.5 as chroma approaches the neutral limit.
  if (c < NEUTRAL_CHROMA) return { color: 'W', confidence: 1 - (c / NEUTRAL_CHROMA) * 0.5 }
  const byHue = Object.entries(TYPICAL_HUE)
    .map(([name, center]) => ({ name, d: Math.min(Math.abs(h - center), 360 - Math.abs(h - center)) }))
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
// first. `gains` stays as plain shared infrastructure through the
// extraction pipeline below - every caller now always passes
// NEUTRAL_GAINS (or omits the argument, defaulting to it).
// ─────────────────────────────────────────────────────────────────────────────

export const NEUTRAL_GAINS: RGB = { r: 1, g: 1, b: 1 }

export function applyGains(rgb: RGB, gains: RGB): RGB {
  return {
    r: Math.max(0, Math.min(255, Math.round(rgb.r * gains.r))),
    g: Math.max(0, Math.min(255, Math.round(rgb.g * gains.g))),
    b: Math.max(0, Math.min(255, Math.round(rgb.b * gains.b))),
  }
}

export interface StickerSample {
  rgb: RGB
  colorGuess: string
}

// Minimum-cost perfect bipartite matching on a square cost matrix
// (Kuhn-Munkres / "Hungarian algorithm", O(n^3) via successive shortest
// augmenting paths with potentials - the standard formulation, e.g.
// https://cp-algorithms.com/graph/hungarian-algorithm.html). Returns
// assignment[row] = column minimizing total cost[row][assignment[row]].
// Verified against brute-force optimal search on random small cases (see
// test/imageProcessing.test.ts) - a from-scratch min-cost-matching
// implementation is exactly the kind of code where "looks right" and "is
// right" can quietly diverge. Exported (unlike this file's other
// clustering internals) specifically so that verification can call it
// directly, rather than only indirectly through learnStickerColors' much
// larger surface (k-means iteration, seeding, canonical-color matching,
// ...), which would leave failures here hard to isolate.
export function hungarianAssignment(cost: number[][]): number[] {
  const n = cost.length
  const INF = Infinity
  // 1-indexed throughout (index 0 is a sentinel "no row/column yet"),
  // matching the standard reference formulation this is ported from.
  const u = new Array(n + 1).fill(0)
  const v = new Array(n + 1).fill(0)
  const p = new Array(n + 1).fill(0) // p[j] = row currently matched to column j
  const way = new Array(n + 1).fill(0)

  for (let i = 1; i <= n; i++) {
    p[0] = i
    let j0 = 0
    const minv = new Array(n + 1).fill(INF)
    const used = new Array(n + 1).fill(false)
    do {
      used[j0] = true
      const i0 = p[j0]
      let delta = INF
      let j1 = -1
      for (let j = 1; j <= n; j++) {
        if (!used[j]) {
          const cur = cost[i0 - 1][j - 1] - u[i0] - v[j]
          if (cur < minv[j]) { minv[j] = cur; way[j] = j0 }
          if (minv[j] < delta) { delta = minv[j]; j1 = j }
        }
      }
      for (let j = 0; j <= n; j++) {
        if (used[j]) { u[p[j]] += delta; v[j] -= delta }
        else { minv[j] -= delta }
      }
      j0 = j1
    } while (p[j0] !== 0)
    do {
      const j1 = way[j0]
      p[j0] = p[j1]
      j0 = j1
    } while (j0 !== 0)
  }

  const result = new Array(n)
  for (let j = 1; j <= n; j++) {
    if (p[j] > 0) result[p[j] - 1] = j - 1
  }
  return result
}

// k-means (Lloyd's algorithm), fixed k, over raw RGB points. Deterministic:
// seeds centroids by sorting points along their dominant spread axis and
// picking k evenly-spaced ones, rather than random init, so results are
// reproducible for the same capture.
// Assigns each point to exactly one of `centroids`, enforcing that every
// centroid receives (as close as possible to, and exactly when n divides
// evenly by k) points.length / centroids.length points — the hard
// constraint that a valid NxN cube capture always has exactly N^2
// stickers of each of the 6 colors. Solved as a genuine minimum-cost
// assignment problem: each centroid becomes `capacity` identical-cost
// "slots" (so 16 points can legitimately want the same centroid), padded
// with zero-cost dummy points if capacity*k > n (points don't divide
// evenly across centroids), then hungarianAssignment finds the
// GLOBALLY cheapest full assignment - not just a locally-greedy one.
//
// This replaced an earlier greedy heuristic (sort every point/centroid
// pairing by distance, walk it assigning each point to its nearest
// still-available centroid) after a real capture showed it can strand a
// point at a wildly wrong color: a point 0.04 (OKLab distance) from its
// obviously-correct centroid got assigned to a centroid 0.49 away purely
// because its correct centroid's capacity filled up first with other,
// even-closer points, and by the point's own turn every *other* centroid
// happened to be full too - greedy has no way to reconsider an earlier
// choice once made, even when a cheap swap would fix both assignments at
// once. An optimal solver doesn't have that blind spot: it considers the
// assignment as a whole, so it will never leave a huge-cost pairing on
// the table when a cheaper global arrangement exists.
function balancedAssign(points: RGB[], centroids: RGB[]): number[] {
  const k = centroids.length
  const n = points.length
  const capacity = Math.ceil(n / k)
  const totalSlots = k * capacity

  const cost: number[][] = []
  for (let pi = 0; pi < n; pi++) {
    const row: number[] = []
    for (let ci = 0; ci < k; ci++) {
      const d = clusterDistance(points[pi], centroids[ci])
      for (let s = 0; s < capacity; s++) row.push(d)
    }
    cost.push(row)
  }
  // Dummy rows (real points don't reach this far into `cost`) cost
  // nothing to place anywhere, so the solver always "spends" them on
  // whichever leftover slots are cheapest to leave empty rather than
  // distorting a real point's assignment.
  for (let pi = n; pi < totalSlots; pi++) cost.push(new Array(totalSlots).fill(0))

  const slotAssignment = hungarianAssignment(cost)
  return slotAssignment.slice(0, n).map((slot) => Math.floor(slot / capacity))
}

function kMeansCluster(points: RGB[], k: number, iterations = 20): RGB[] {
  // Deterministic farthest-point seeding: start from the first point, then
  // repeatedly add whichever remaining point has the largest distance to
  // its NEAREST already-chosen centroid. This reliably spreads initial
  // centroids across distinct clusters even when real colors are
  // well-separated corners of RGB space.
  //
  // A first version seeded by sorting all points along whichever single
  // channel had the widest spread and picking k evenly-spaced points from
  // that order. That silently breaks when two different colors tie on
  // that one axis: green (0,128,0) and blue (0,0,255) both have r=0, so
  // sorting by r leaves them adjacent regardless of how different they
  // actually are — confirmed by testing on a perfectly clean (zero-noise,
  // zero-cast) synthetic capture, which should trivially cluster into 6
  // exact corners but instead produced two 0-member clusters and one
  // 26-member cluster the axis-sort seeding couldn't recover from.
  let centroids: RGB[] = points.length > 0 ? [points[0]] : []
  while (centroids.length < k && centroids.length < points.length) {
    let farthest = points[0]
    let farthestMinDist = -1
    for (const p of points) {
      let minDist = Infinity
      for (const c of centroids) minDist = Math.min(minDist, clusterDistance(p, c))
      if (minDist > farthestMinDist) { farthestMinDist = minDist; farthest = p }
    }
    centroids.push(farthest)
  }

  for (let iter = 0; iter < iterations; iter++) {
    const assignment = balancedAssign(points, centroids)
    // Averaged in OKLab space, not RGB: assignment/distance both operate
    // in OKLab (colorDistance), and Lloyd's algorithm only converges
    // correctly when the centroid update minimizes the same metric the
    // assignment step used - an RGB-space mean isn't the point that
    // minimizes total OKLab distance to the cluster's members, since
    // OKLab is a nonlinear (cube-root) remapping of RGB.
    const sums = Array.from({ length: k }, () => ({ l: 0, a: 0, b: 0, count: 0 }))
    points.forEach((p, pi) => {
      const c = assignment[pi]
      const lab = rgbToOklab(p)
      sums[c].l += lab.l; sums[c].a += lab.a; sums[c].b += lab.b; sums[c].count++
    })
    centroids = centroids.map((c, i) =>
      sums[i].count > 0
        ? oklabToRgb({ l: sums[i].l / sums[i].count, a: sums[i].a / sums[i].count, b: sums[i].b / sums[i].count })
        : c // keep empty clusters where they were rather than collapsing to NaN
    )
  }

  return centroids
}

// Brute-force over all k! assignments (k=6 -> 720, trivial) to find the
// pairing of cluster centroids to canonical colors that minimizes total
// squared distance. Small enough that an exhaustive search is simpler and
// more obviously correct than an approximate matching algorithm.
function bestPermutationMatch(centroids: RGB[], canonical: RGB[]): number[] {
  const k = centroids.length
  const indices = Array.from({ length: k }, (_, i) => i)
  let bestAssignment = indices
  let bestCost = Infinity

  function permute(arr: number[], l: number) {
    if (l === arr.length) {
      let cost = 0
      for (let i = 0; i < k; i++) cost += clusterDistance(centroids[i], canonical[arr[i]]) ** 2
      if (cost < bestCost) { bestCost = cost; bestAssignment = [...arr] }
      return
    }
    for (let i = l; i < arr.length; i++) {
      [arr[l], arr[i]] = [arr[i], arr[l]]
      permute(arr, l + 1)
      ;[arr[l], arr[i]] = [arr[i], arr[l]]
    }
  }
  permute([...indices], 0)

  return bestAssignment
}

export interface LearnedColors {
  colors: Record<string, RGB>
  clusterSizes: Record<string, number>
  labelsBySampleIndex: string[]
  // Each sample's distance to its assigned cluster's centroid computed
  // WITHOUT that sample (leave-one-out), not the ordinary centroid — see
  // the comment on this function's confidence handling for why.
  leaveOneOutDistances: number[]
}

// "Virtual sample count" a learned centroid is shrunk toward its matched
// canonical anchor by (see shrinkTowardCanonical) - the centroid gets
// weight sampleCount/(sampleCount+this) of its own k-means position, and
// the rest pulled back to canonical. A 2x2x2 capture (only 4 real
// samples/color) is where this actually matters: real 2x2 fixtures
// showed k-means centroids from just 4 points swing wildly
// (leave-one-out distances up to 0.28, vs. ~0.15 between the CLOSEST two
// canonical colors), letting a single noisy point drag its whole
// cluster's label off - the canonical anchor is a far more stable
// estimate than 4 samples can produce alone. But it must NOT meaningfully
// touch 3x3/4x4-sized clusters (9-16 samples/color): those are already
// well-estimated from real data, and canonical anchors are measurably
// WRONG for exactly the pairs that matter most here (real captures put
// Red/Orange and Green/Yellow far closer together in hue than the
// idealized WCA swatches do - see the 2026-09-23 real-fixture root-cause
// analysis), so pulling an already-correct 9- or 16-point centroid
// toward canonical only reintroduces that bias. 3 is the value found by
// sweeping against all 4 real fixtures: it's the middle of a plateau
// (1.9-3.8 all score identically) that fully fixes the 2x2 fixture (5/24
// -> 0/24 mismatches) with zero change to the 3x3/4x4 fixtures' mismatch
// counts - stronger priors (4+) start moving the 3x3/4x4 numbers the
// wrong way. This shrink is a fix for small-sample instability ONLY, not
// for the separate, confirmed root cause of Red/Orange and Green/Yellow
// mislabels on 3x3/4x4 captures (spatially-clustered lighting bias
// shrinking those pairs' already-narrow real hue gap even further) - see
// TODO.md / the 2026-09-23 real-fixture design discussion for that one.
const CENTROID_SHRINKAGE_PRIOR = 3

// Blends a k-means-learned centroid toward its matched canonical anchor
// in OKLab space (not RGB - consistent with every other averaging this
// file does, for the same nonlinear-remapping reason kMeansCluster's
// centroid update is). weight=1 (large sampleCount) is effectively "trust
// the data"; weight→0 (sampleCount→0) is "fall back to canonical" - never
// fully either at any finite sampleCount, deliberately, since a
// canonical anchor isn't perfectly correct either (see e.g. the R/O gap
// being narrower in real captures than in the idealized WCA swatches).
function shrinkTowardCanonical(learned: RGB, canonical: RGB, sampleCount: number): RGB {
  const weight = sampleCount / (sampleCount + CENTROID_SHRINKAGE_PRIOR)
  const learnedLab = rgbToOklab(learned)
  const canonicalLab = rgbToOklab(canonical)
  return oklabToRgb({
    l: learnedLab.l * weight + canonicalLab.l * (1 - weight),
    a: learnedLab.a * weight + canonicalLab.a * (1 - weight),
    b: learnedLab.b * weight + canonicalLab.b * (1 - weight),
  })
}

// Learns each of the 6 sticker colors' actual RGB directly from the
// capture itself, using ALL captured stickers (typically all 54 across 6
// faces) as calibration data, instead of assuming the hardcoded WCA
// reference swatches (STICKER_COLORS) are what the camera+lighting
// actually produced. Every sticker is then classified by a balanced
// assignment against these learned colors (labelsBySampleIndex), not the
// hardcoded ones — the hardcoded palette is used here only to LABEL which
// cluster is which color name, never as the classification target itself.
//
// An earlier version of this instead solved for a global per-channel gain
// (observed * gain ~= canonical) and reclassified against the still-fixed
// canonical palette. Dropped after testing surfaced two real failure
// modes: (1) grouping samples by their own nearest-canonical-color guess
// is self-poisoning under a strong enough cast (the guess is already
// wrong, so the gain gets fit to the wrong target — one test pushed a
// channel's gain to 0.5 when ~4x was needed, backwards); and (2) even
// after fixing that with clustering, a color with very few captured
// stickers produces a poorly-constrained, sometimes wildly wrong gain for
// the channel that mostly distinguishes it (observed b=2.56x on a capture
// with no real color cast at all, because only 2 of 54 stickers happened
// to land in the white/blue clusters that channel depends on). Learning
// the colors directly sidesteps both: there is no reference-target
// mismatch to poison, and no gain to overshoot — each cluster centroid IS
// the learned color, so a sparse cluster just means a less-precise learned
// color, not a runaway correction applied to everything.
export function learnStickerColors(samples: StickerSample[]): LearnedColors | null {
  const points = samples.map((s) => s.rgb)
  const K = 6
  if (points.length < K) return null

  const centroids = kMeansCluster(points, K)
  const canonicalKeys = Object.keys(STICKER_COLORS)
  const canonicalList = canonicalKeys.map((k) => STICKER_COLORS[k])
  const permutation = bestPermutationMatch(centroids, canonicalList)

  // Provisional assignment against the raw k-means centroids, used only to
  // count how many real samples actually back each cluster - needed
  // before shrinkage can weigh "trust the data" vs. "trust canonical" per
  // cluster (see CENTROID_SHRINKAGE_PRIOR). Superseded below by the
  // shrunk-centroid pointAssignment for every other purpose.
  const provisionalAssignment = balancedAssign(points, centroids)
  const clusterCounts = new Array(K).fill(0)
  for (const clusterIdx of provisionalAssignment) clusterCounts[clusterIdx]++

  // Shrink each centroid toward its matched canonical anchor before doing
  // anything else with it - see shrinkTowardCanonical. A well-populated
  // cluster (e.g. 16 samples on a 4x4) barely moves; a thin one (e.g. 4
  // samples on a 2x2) leans on the far more stable canonical estimate.
  const shrunkCentroids = centroids.map((c, i) => shrinkTowardCanonical(c, canonicalList[permutation[i]], clusterCounts[i]))

  // DEFINITIVE balanced-assignment pass, against the shrunk centroids -
  // this is what actually gets used as each sticker's color, not an
  // independent nearest-centroid lookup per sticker (which would reopen
  // the same "one cluster steals another's points" failure the whole
  // balanced-assignment approach exists to close) and not the
  // provisional pre-shrink assignment above (which is only there to size
  // the shrinkage weight).
  const pointAssignment = balancedAssign(points, shrunkCentroids)

  const colors: Record<string, RGB> = {}
  const clusterSizes: Record<string, number> = {}
  for (let i = 0; i < K; i++) {
    const name = canonicalKeys[permutation[i]]
    colors[name] = shrunkCentroids[i]
    clusterSizes[name] = clusterCounts[i]
  }

  const labelsBySampleIndex = pointAssignment.map((clusterIdx) => canonicalKeys[permutation[clusterIdx]])

  // A sample's distance to the centroid it was assigned to is a biased
  // confidence signal: the centroid IS the mean of its members, so any
  // sample — including one the capacity constraint force-assigned to the
  // "wrong" (but not-yet-full) cluster because its true cluster had
  // already hit quota — pulls that centroid slightly toward itself,
  // making itself look closer than it really is. A cluster made up
  // partly of misclassified points reads as confident about exactly the
  // points it got wrong. Leave-one-out fixes this: recompute the
  // centroid excluding the sample being scored, so it can't be flattered
  // by its own membership.
  // Summed in OKLab space to match colorDistance below, for the same
  // reason kMeansCluster's centroid update is: an RGB-space mean isn't
  // the point that minimizes OKLab distance to the cluster's members.
  const pointsOklab = points.map(rgbToOklab)
  const clusterSums = Array.from({ length: K }, () => ({ l: 0, a: 0, b: 0 }))
  pointAssignment.forEach((clusterIdx, i) => {
    clusterSums[clusterIdx].l += pointsOklab[i].l
    clusterSums[clusterIdx].a += pointsOklab[i].a
    clusterSums[clusterIdx].b += pointsOklab[i].b
  })
  const leaveOneOutDistances = points.map((point, i) => {
    const clusterIdx = pointAssignment[i]
    const count = clusterCounts[clusterIdx]
    // A singleton cluster has no "other members" to average — fall back
    // to the ordinary (self-inclusive) centroid rather than divide by 0.
    // Computed and compared directly in OKLab (never round-tripped
    // through RGB, unlike kMeansCluster's centroids): this value is only
    // ever used for a distance, so there's no reason to pay RGB's integer
    // quantization error for a value nothing else needs as an RGB.
    if (count > 1) {
      const centroidOklab: Oklab = {
        l: (clusterSums[clusterIdx].l - pointsOklab[i].l) / (count - 1),
        a: (clusterSums[clusterIdx].a - pointsOklab[i].a) / (count - 1),
        b: (clusterSums[clusterIdx].b - pointsOklab[i].b) / (count - 1),
      }
      return clusterOklabDistance(pointsOklab[i], centroidOklab)
    }
    return clusterDistance(point, shrunkCentroids[clusterIdx])
  })

  return { colors, clusterSizes, labelsBySampleIndex, leaveOneOutDistances }
}

function getDominantColor(imageData: Uint8ClampedArray, start: number, width: number, height: number): RGB {
  const pixels: RGB[] = []

  for (let i = 0; i < imageData.length; i += 4) {
    const idx = i / 4
    if (idx >= start && idx < start + width * height) {
      pixels.push({
        r: imageData[i],
        g: imageData[i + 1],
        b: imageData[i + 2],
      })
    }
  }

  if (pixels.length === 0) {
    return { r: 255, g: 255, b: 255 }
  }

  const avgR = Math.round(pixels.reduce((sum, p) => sum + p.r, 0) / pixels.length)
  const avgG = Math.round(pixels.reduce((sum, p) => sum + p.g, 0) / pixels.length)
  const avgB = Math.round(pixels.reduce((sum, p) => sum + p.b, 0) / pixels.length)

  return { r: avgR, g: avgG, b: avgB }
}

export interface FaceBounds {
  startX: number
  startY: number
  faceWidth: number
  faceHeight: number
  // Tilt (radians, canvas rotate() direction) about the square's center;
  // the square is read turned upright.
  angle?: number
  // Set by seam alignment. False means the returned guide is only a
  // placeholder; Detect face must not capture it as an automatic result.
  gridFound?: boolean
}

interface FaceRegion extends FaceBounds {
  imageData: ImageData
}

// Fraction of the frame (of min(width,height)) the sticker guide square
// covers - the ONLY thing extractColorsFromImageData ever samples for
// classification. Named so BACKGROUND_REGION_FRACTION below can be stated
// relative to it, unchanged from the plain 0.6 this was before.
const SAMPLE_FACE_FRACTION = 0.6

// Cube face is assumed centered in frame, matching the fixed guide square
// shown to the user during capture (see capture-grid-overlay in index.tsx).
// `fraction` defaults to the sticker guide square itself; callers pass a
// larger value (see BACKGROUND_REGION_FRACTION) to get a bigger, concentric
// square for sampling the area AROUND the stickers instead.
export function computeFaceBounds(canvas: HTMLCanvasElement, fraction = SAMPLE_FACE_FRACTION): FaceBounds {
  const width = canvas.width
  const height = canvas.height

  const centerX = width / 2
  const centerY = height / 2
  const faceSize = Math.min(width, height) * fraction

  const startX = Math.max(0, centerX - faceSize / 2)
  const startY = Math.max(0, centerY - faceSize / 2)
  const endX = Math.min(width, startX + faceSize)
  const endY = Math.min(height, startY + faceSize)

  // Rounded to integers - getImageData(sx, sy, sw, sh) takes doubles, but
  // the ImageData it returns is necessarily integer-pixel-sized, so a
  // caller that reuses these fractional bounds as BOTH the getImageData
  // argument AND its own manual (row * width + col) pixel-index math (as
  // extractBackgroundColor's background-area scan does, unlike the
  // sticker-cell scan in extractColorsFromImageData, which stays safely
  // inset from any edge) risks the two disagreeing on the actual row
  // stride - drifting further off with every row until it reads past the real buffer end
  // (silently `undefined`, poisoning every downstream sum to NaN). Round
  // once here so every consumer agrees on the same integer bounds.
  return {
    startX: Math.round(startX),
    startY: Math.round(startY),
    faceWidth: Math.round(endX - startX),
    faceHeight: Math.round(endY - startY),
  }
}

// The guide square moved onto the cube's actual sticker grid (see
// findGridAlignment), so a face held a little off-center or away from the
// camera is still sampled cell by cell. Falls back to the guide itself when
// no convincing grid shows. Exported so one live frame is aligned once for
// both extractCubeFaceColors and hasVisibleCubeFace.
export function alignedFaceBounds(canvas: HTMLCanvasElement, gridSize: number): FaceBounds {
  const guide = computeFaceBounds(canvas)
  const ctx = canvas.getContext('2d')
  if (!ctx || guide.faceWidth !== guide.faceHeight) return { ...guide, gridFound: false }
  // Room for the largest offset plus the largest face (1.12x the guide),
  // and for the corners of a tilted one.
  const margin = Math.ceil(guide.faceWidth * (ALIGNMENT_MAX_OFFSET + 0.06 + 0.2))
  const x0 = Math.max(0, guide.startX - margin)
  const y0 = Math.max(0, guide.startY - margin)
  const x1 = Math.min(canvas.width, guide.startX + guide.faceWidth + margin)
  const y1 = Math.min(canvas.height, guide.startY + guide.faceHeight + margin)
  const region = ctx.getImageData(x0, y0, x1 - x0, y1 - y0)
  const square = { x: guide.startX - x0, y: guide.startY - y0, size: guide.faceWidth }
  const found = alignFace(region.data, region.width, region.height, square, gridSize)
  const angle = found.angle
  if (!found.aligned && !angle) return { ...guide, gridFound: found.seams }
  const size = Math.round(found.size)
  // Keep the square's center on the canvas; a tilted square is read through
  // a rotation, which clamps nothing else.
  const centerX = Math.min(canvas.width - size / 2, Math.max(size / 2, x0 + found.center[0]))
  const centerY = Math.min(canvas.height - size / 2, Math.max(size / 2, y0 + found.center[1]))
  return {
    startX: Math.round(centerX - size / 2),
    startY: Math.round(centerY - size / 2),
    faceWidth: size,
    faceHeight: size,
    ...(angle && { angle }),
    gridFound: found.seams,
  }
}

export type FaceGeometryMode = 'aligned' | 'fixed'

// Shared by the live overlay and both capture sources. A manual guide always
// samples its drawn square; the default scanner searches nearby grid seams.
export function faceBoundsForMode(canvas: HTMLCanvasElement, gridSize: number, mode: FaceGeometryMode): FaceBounds {
  return mode === 'fixed' ? computeFaceBounds(canvas) : alignedFaceBounds(canvas, gridSize)
}

// Draws the square of `bounds` from `canvas` onto a new canvas of its size,
// turned upright when it is tilted.
function drawFaceSquare(canvas: HTMLCanvasElement, bounds: FaceBounds): HTMLCanvasElement {
  const out = document.createElement('canvas')
  out.width = bounds.faceWidth
  out.height = bounds.faceHeight
  const ctx = out.getContext('2d')
  if (!ctx) {
    throw new Error('Could not get canvas context')
  }
  if (bounds.angle) {
    ctx.translate(bounds.faceWidth / 2, bounds.faceHeight / 2)
    ctx.rotate(-bounds.angle)
    ctx.drawImage(canvas, -(bounds.startX + bounds.faceWidth / 2), -(bounds.startY + bounds.faceHeight / 2))
  } else {
    ctx.drawImage(
      canvas,
      bounds.startX, bounds.startY, bounds.faceWidth, bounds.faceHeight,
      0, 0, bounds.faceWidth, bounds.faceHeight
    )
  }
  return out
}

function readFaceRegion(canvas: HTMLCanvasElement, bounds: FaceBounds): FaceRegion {
  const source = bounds.angle ? drawFaceSquare(canvas, bounds) : canvas
  const ctx = source.getContext('2d')
  if (!ctx) {
    throw new Error('Could not get canvas context')
  }
  return {
    ...bounds,
    imageData: bounds.angle
      ? ctx.getImageData(0, 0, bounds.faceWidth, bounds.faceHeight)
      : ctx.getImageData(bounds.startX, bounds.startY, bounds.faceWidth, bounds.faceHeight),
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// Background-based cross-face correction
//
// The area around the cube (table, hand, backdrop) stays the SAME physical
// surface across all 6 face captures, unlike the cube's own stickers (whose
// colors are exactly what's being measured, and can't double as a
// reference). Sampling it doesn't require knowing what color it "should"
// be (unlike the gray-world estimate this replaced, which wrongly assumed
// the whole scene averages to neutral gray) - only that it's CONSTANT, so
// any difference between how face 2's patch reads vs. face 1's patch is,
// by construction, illumination/camera drift rather than scene content.
// See the 2026-09-23 real-fixture design discussion ("G1").
// ─────────────────────────────────────────────────────────────────────────────

// Outer edge of the area sampled for the background reference, as a
// fraction of min(width,height) - the whole frame (1.0) outside the
// sticker guide square, not just a band near it. A narrow band is MORE
// exposed to a single localized contamination (a shadow, a reflection, a
// stray object at that exact radius) skewing the entire reading; the full
// remaining area lets trimmedMeanColor average that out instead. (A
// smaller value was tried first, to dodge lens vignetting at the true
// edge - reconsidered after a live capture showed a background reading
// extreme enough to turn a correctly-classifiable White sticker into
// Blue, which pointed at contamination, not genuine illumination drift -
// see the 2026-09-23 real-fixture design discussion, "G1".)
const BACKGROUND_REGION_FRACTION = 1.0

// Samples the whole area between the sticker guide square and
// BACKGROUND_REGION_FRACTION on a LIVE captured frame - null if the frame
// is too small to have a meaningful background area, or if it came back
// too dark to be a reliable reading (mirrors estimateGrayWorldGains' old
// too-dark guard). Only meaningful on a live, uncropped canvas - a stored
// croppedImage (see cropFaceRegionToDataUrl) is already cropped down to
// just the sticker square and has no background left to sample, which is
// why this is captured once at capture time (captureAndProcessFace /
// captureAndProcessImage) rather than re-derivable later like
// redetectFaceColors' sticker re-extraction is.
export function extractBackgroundColor(canvas: HTMLCanvasElement, backgroundGap = 0, face?: FaceBounds): RGB | null {
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  // Skip the guide square plus `backgroundGap` of its side on each side.
  const gap = Math.min(MAX_BACKGROUND_GAP, Math.max(0, backgroundGap))
  const inner = computeFaceBounds(canvas, SAMPLE_FACE_FRACTION * (1 + 2 * gap))
  const outer = computeFaceBounds(canvas, BACKGROUND_REGION_FRACTION)
  if (outer.faceWidth < 40 || outer.faceHeight < 40) return null

  const imageData = ctx.getImageData(outer.startX, outer.startY, outer.faceWidth, outer.faceHeight)
  const data = imageData.data
  const innerLeft = inner.startX - outer.startX
  const innerTop = inner.startY - outer.startY
  const innerRight = innerLeft + inner.faceWidth
  const innerBottom = innerTop + inner.faceHeight
  // The face as captured (aligned off the guide, maybe larger or tilted) is
  // skipped too: its bounding box plus the same gap.
  let faceLeft = 0, faceTop = 0, faceRight = 0, faceBottom = 0
  if (face) {
    const turn = face.angle ?? 0
    const half = (face.faceWidth / 2) * (Math.abs(Math.cos(turn)) + Math.abs(Math.sin(turn))) + gap * face.faceWidth
    const cx = face.startX + face.faceWidth / 2 - outer.startX
    const cy = face.startY + face.faceHeight / 2 - outer.startY
    faceLeft = cx - half; faceRight = cx + half; faceTop = cy - half; faceBottom = cy + half
  }

  const pixels: RGB[] = []
  for (let y = 0; y < outer.faceHeight; y++) {
    const inRow = y >= innerTop && y < innerBottom
    const inFaceRow = y >= faceTop && y < faceBottom
    for (let x = 0; x < outer.faceWidth; x++) {
      if (inRow && x >= innerLeft && x < innerRight) continue // inside the sticker square - skip
      if (inFaceRow && x >= faceLeft && x < faceRight) continue // on the captured face - skip
      const idx = (y * outer.faceWidth + x) * 4
      pixels.push({ r: data[idx], g: data[idx + 1], b: data[idx + 2] })
    }
  }

  const mean = trimmedMeanColor(pixels)
  if (!mean || !Number.isFinite(mean.r) || !Number.isFinite(mean.g) || !Number.isFinite(mean.b)) return null
  const luminance = 0.2126 * mean.r + 0.7152 * mean.g + 0.0722 * mean.b
  if (luminance < 5) return null // too dark to be a reliable reference
  return mean
}

// Largest per-channel correction (and 1/this the smallest) a background
// gain may apply. The background patch is only a rough gray card - it
// picks up the cube's own colored reflections and exposure changes - so
// a strong gain overcorrects: the 7x7 fixture capture-2026-09-23T10-23-06
// had B's red gain at 1.56, which pushed its reds into orange territory
// (and clipped 42 sticker readings at 255), leaving a Red/Orange pair so
// close to the boundary that decoding the same JPEG with a different
// decoder flipped it. Sweeping every local fixture that recorded gains,
// 1.3 widened or kept the worst Red/Orange margin on all of them (the old
// 0.6-1.8 was the loosest), while no gain at all broke
// capture-2026-09-23T04-17-08 - so some correction is still needed.
const MAX_BACKGROUND_GAIN = 1.3

// Clamps a background-derived gain into [1/MAX_BACKGROUND_GAIN,
// MAX_BACKGROUND_GAIN]. Exported so gains recorded by older captures
// (clamped to the old, looser range) replay with today's limit too.
// Falls back to a neutral (1) gain for any channel that comes out
// non-finite, rather than propagating NaN/Infinity into applyGains -
// which would silently corrupt every pixel it touches (NaN * anything
// is NaN) rather than merely leaving that channel uncorrected. A real
// instance of this (a getImageData/manual-indexing stride mismatch,
// since fixed at the source in computeFaceBounds) reached exactly this
// failure mode on a live capture.
export function limitBackgroundGain(gains: RGB): RGB {
  const clampGain = (g: number) =>
    Number.isFinite(g) ? Math.max(1 / MAX_BACKGROUND_GAIN, Math.min(MAX_BACKGROUND_GAIN, g)) : 1
  return { r: clampGain(gains.r), g: clampGain(gains.g), b: clampGain(gains.b) }
}

// Per-channel gain that would rescale `current`'s background reading to
// match `reference`'s - the actual cross-face correction, applied to a
// face's raw sticker samples (via applyGains) before classification, same
// as any other gain in this file. Limited (see limitBackgroundGain) so a
// background patch that's unexpectedly extreme (e.g. partially shadowed
// on one face) can't produce a runaway correction.
export function computeBackgroundGain(reference: RGB, current: RGB): RGB {
  return limitBackgroundGain({
    r: reference.r / Math.max(1, current.r),
    g: reference.g / Math.max(1, current.g),
    b: reference.b / Math.max(1, current.b),
  })
}

// Crops just the analyzed face region out of a captured frame, for showing
// the user what was actually sampled (e.g. in a post-capture review step) —
// independent of extractCubeFaceColors, so it costs nothing on the
// high-frequency live-preview path that doesn't need an image, only text.
export const CROP_JPEG_QUALITY = 1

export function cropFaceRegionToDataUrl(canvas: HTMLCanvasElement, bounds: FaceBounds = computeFaceBounds(canvas)): string {
  const out = drawFaceSquare(canvas, bounds)
  // Quality 1 is the only setting at which Chrome keeps full-resolution
  // color (4:4:4); anything below stores chroma at half resolution (4:2:0),
  // and decoders then disagree on how to upsample it - jpeg-js vs Chrome
  // differed by up to 25 levels at sticker edges at 0.85, by at most 3 at
  // 1. This image is the source of truth that recalibration and saved
  // fixtures re-analyze, so it's worth the ~4x size (~200 KB for a 648px
  // crop from 1080p).
  return out.toDataURL('image/jpeg', CROP_JPEG_QUALITY)
}

// Fraction of a cell's sampled pixels discarded from each luminance
// extreme before averaging - rejects glare (a specular highlight off the
// sticker's glossy plastic, reading far brighter than the sticker's true
// color) and shadow/bleed (reading far darker) outliers a plain mean
// would blend straight in, pulling the reading toward whichever extreme
// happened to be present. 15% each end (a standard "trimmed mean"
// choice) is aggressive enough to reject a real highlight streak - which
// only ever covers a minority of a sticker's sampled area - without
// discarding so much that a genuinely uniform, glare-free sticker's
// estimate gets noisier for no reason.
const OUTLIER_TRIM_FRACTION = 0.15

// Averages pixel colors after discarding the brightest/darkest tails by
// luminance, instead of a plain mean over every sampled pixel - see
// OUTLIER_TRIM_FRACTION above. Exported for direct unit testing (pure,
// DOM-free), matching how this file's other small numeric helpers are
// tested rather than only indirectly through the canvas-touching
// functions that call them.
export function trimmedMeanColor(pixels: RGB[], trimFraction = OUTLIER_TRIM_FRACTION): RGB | null {
  if (pixels.length === 0) return null
  const byLuminance = [...pixels].sort(
    (a, b) => (0.2126 * a.r + 0.7152 * a.g + 0.0722 * a.b) - (0.2126 * b.r + 0.7152 * b.g + 0.0722 * b.b)
  )
  const trimCount = Math.floor(pixels.length * trimFraction)
  // Only trim when there's enough left afterward - never let trimming
  // itself produce an empty (or asymmetric/degenerate) result on a very
  // small sample.
  const kept = trimCount * 2 < pixels.length ? byLuminance.slice(trimCount, pixels.length - trimCount) : byLuminance
  let sumR = 0, sumG = 0, sumB = 0
  for (const p of kept) { sumR += p.r; sumG += p.g; sumB += p.b }
  return { r: sumR / kept.length, g: sumG / kept.length, b: sumB / kept.length }
}

// A sticker's color from its sampled pixels. Glossy stickers can mirror a
// lamp or window across half their area, and that reflection isn't just
// bright - on a real capture it turned red and orange stickers alike pale
// pink-purple (e.g. an orange read as rgb(209,134,198)), more than the
// trimmed mean's 15% tails can reject. The sticker's own color survives in
// its most colorful pixels, so a colored sticker is measured from the
// most colorful STICKER_CORE_SATURATED_FRACTION of them (ranked by RGB
// channel spread, which ranks like OKLab chroma here at a fraction of the
// cost - this runs on every live-preview frame). A near-white sticker
// (trimmed-mean chroma below STICKER_WHITE_CHROMA) keeps the trimmed mean:
// its "most colorful" pixels are only colored fringes. On the real
// fixtures this fixed a glare capture (6 misreads -> 0) and a 2x2 (2 -> 0)
// with every clean capture unchanged; 25-35% and 0.06-0.08 all scored the
// same, these are the middle.
const STICKER_CORE_SATURATED_FRACTION = 0.3
const STICKER_WHITE_CHROMA = 0.07

// Names how stickerColor measures, saved with fixtures next to their
// per-sticker readings: readings from an older measurement can't be
// compared with today's. (Fixtures without it used the plain trimmed mean.)
export const STICKER_MEASUREMENT = 'colorful-30/v1'

export function stickerColor(pixels: RGB[]): RGB | null {
  const plain = trimmedMeanColor(pixels)
  if (!plain || rgbToOKLCH(plain).c < STICKER_WHITE_CHROMA) return plain
  const spread = (c: RGB) => Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b)
  const colorful = [...pixels].sort((a, b) => spread(b) - spread(a)).slice(0, Math.ceil(pixels.length * STICKER_CORE_SATURATED_FRACTION))
  return {
    r: colorful.reduce((sum, c) => sum + c.r, 0) / colorful.length,
    g: colorful.reduce((sum, c) => sum + c.g, 0) / colorful.length,
    b: colorful.reduce((sum, c) => sum + c.b, 0) / colorful.length,
  }
}

// The actual per-sticker sampling and classification logic, operating on
// already-extracted raw pixel data rather than a browser HTMLCanvasElement
// - split out from extractCubeFaceColors so it can run against a real,
// decoded photo in a test environment with no DOM/Canvas API available
// (see test/fixtures.test.ts), not just against a live canvas. `data` is
// treated as already covering exactly the face region to sample (no
// further center-cropping is applied here - extractCubeFaceColors below
// does that cropping itself before calling in, and a saved fixture photo
// is already the cropped region, per cropFaceRegionToDataUrl).
export function extractColorsFromImageData(
  data: Uint8ClampedArray,
  faceWidth: number,
  faceHeight: number,
  gridSize = 3,
  gains: RGB = NEUTRAL_GAINS,
  sampling: SamplingGeometry = DEFAULT_SAMPLING,
  palette?: Record<string, RGB>
): ColorDetectionResult {
  // Big cubes' perimeter cubies are wider; sample the layout this face shows.
  const outerCellRatio = estimateOuterCellRatio(data, faceWidth, faceHeight, gridSize)
  const colors: string[][] = []
  const cellConfidences: number[][] = []
  const cellColors: RGB[][] = []
  let totalConfidence = 0

  for (let row = 0; row < gridSize; row++) {
    const rowColors: string[] = []
    const rowConfidences: number[] = []
    const rowRGB: RGB[] = []
    for (let col = 0; col < gridSize; col++) {
      // Sample only the cell's core, ignoring a dead zone around its
      // border: sticker edges are where gap-line bleed, glare off the
      // plastic bezel, and slight grid misalignment are most likely to
      // contaminate the average, so those pixels are excluded rather than
      // averaged in.
      const rect = stickerSampleRect(row, col, gridSize, faceWidth, faceHeight, sampling, outerCellRatio)
      const cellStartX = Math.round(rect.x)
      const cellStartY = Math.round(rect.y)
      const cellW = Math.round(rect.width)
      const cellH = Math.round(rect.height)

      const pixels: RGB[] = []

      for (let y = cellStartY; y < cellStartY + cellH; y++) {
        for (let x = cellStartX; x < cellStartX + cellW; x++) {
          if (x >= 0 && x < faceWidth && y >= 0 && y < faceHeight) {
            const idx = (y * faceWidth + x) * 4
            pixels.push({ r: data[idx], g: data[idx + 1], b: data[idx + 2] })
          }
        }
      }

      const measured = stickerColor(pixels)
      if (measured) {
        const avgColor: RGB = applyGains(measured, gains)
        rowRGB.push(avgColor)
        const { color: stickerColor, confidence: cellConfidence } = classifySticker(avgColor, palette)
        rowColors.push(stickerColor)
        rowConfidences.push(cellConfidence)
        totalConfidence += cellConfidence
      } else {
        rowRGB.push({ r: 255, g: 255, b: 255 })
        rowColors.push('W')
        rowConfidences.push(0)
      }
    }
    colors.push(rowColors)
    cellConfidences.push(rowConfidences)
    cellColors.push(rowRGB)
  }

  const confidence = Math.min(1, totalConfidence / (gridSize * gridSize))

  return { colors, confidence, cellConfidences, cellColors, ...(outerCellRatio !== 1 && { outerCellRatio }) }
}

// A cropped face can be one solid color, so seams are optional when the
// uncropped camera frame shows the cube's outer silhouette instead.
// `outerCellRatio` widens the outer rows and columns (see cellEdges).
export function hasCoherentStickerInteriors(data: Uint8ClampedArray, width: number, height: number, gridSize: number, outerCellRatio = 1): boolean {
  if (gridSize < 2 || width < gridSize * 8 || height < gridSize * 8) return false
  const edges = cellEdges(gridSize, outerCellRatio)
  let coherentCells = 0
  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      const samples: number[][] = []
      const cellW = (edges[col + 1] - edges[col]) * width, cellH = (edges[row + 1] - edges[row]) * height
      const centerX = (edges[col] + edges[col + 1]) / 2 * width, centerY = (edges[row] + edges[row + 1]) / 2 * height
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const x = Math.round(centerX + dx * 0.1 * cellW)
          const y = Math.round(centerY + dy * 0.1 * cellH)
          const index = (Math.min(height - 1, y) * width + Math.min(width - 1, x)) * 4
          samples.push([data[index], data[index + 1], data[index + 2]])
        }
      }
      const mean = [0, 1, 2].map((channel) => samples.reduce((sum, sample) => sum + sample[channel], 0) / samples.length)
      const deviation = samples.reduce((sum, sample) => sum + sample.reduce((diff, value, channel) => diff + Math.abs(value - mean[channel]), 0) / 3, 0) / samples.length
      if (deviation <= 35) coherentCells++
    }
  }
  return coherentCells >= Math.ceil(gridSize * gridSize * 0.6)
}

// The classifier assigns a color even to a wall. Look for repeated sticker
// seams, allowing for small perspective/framing offsets around each expected
// boundary. A plain wall can have coherent pixels but cannot supply seams.
// `outerCellRatio` widens the outer rows and columns (see cellEdges).
export function hasPlausibleStickerFace(data: Uint8ClampedArray, width: number, height: number, gridSize: number, outerCellRatio = 1): boolean {
  if (!hasCoherentStickerInteriors(data, width, height, gridSize, outerCellRatio)) return false
  const edges = cellEdges(gridSize, outerCellRatio)
  const xs = edges.map((edge) => edge * width), ys = edges.map((edge) => edge * height)
  // Size of the narrower cell on either side of grid line i.
  const narrower = (lines: number[], i: number) => Math.min(lines[i] - lines[i - 1], lines[i + 1] - lines[i])
  const luminance = (x: number, y: number) => {
    const index = (Math.min(height - 1, Math.max(0, Math.round(y))) * width + Math.min(width - 1, Math.max(0, Math.round(x)))) * 4
    return 0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2]
  }
  const segmentHasSeam = (vertical: boolean, boundary: number, segment: number) => {
    const acrossLines = vertical ? xs : ys, alongLines = vertical ? ys : xs
    const across = narrower(acrossLines, boundary)
    const along = alongLines[segment + 1] - alongLines[segment]
    const edge = acrossLines[boundary]
    const center = (alongLines[segment] + alongLines[segment + 1]) / 2
    let near = 0, far = 0
    for (let i = -2; i <= 2; i++) {
      const offset = i * along * 0.07
      const at = (distance: number) => vertical
        ? luminance(edge + distance, center + offset)
        : luminance(center + offset, edge + distance)
      near += at(-across * 0.38)
      far += at(across * 0.38)
    }
    let darkest = Infinity
    for (let shift = -4; shift <= 4; shift++) {
      let seam = 0
      for (let i = -2; i <= 2; i++) {
        const offset = i * along * 0.07
        seam += vertical
          ? luminance(edge + shift * across * 0.04, center + offset)
          : luminance(center + offset, edge + shift * across * 0.04)
      }
      darkest = Math.min(darkest, seam / 5)
    }
    return Math.min(near, far) / 5 - darkest >= 12
  }
  const hasRepeatedSeams = (vertical: boolean) => {
    let found = 0
    for (let boundary = 1; boundary < gridSize; boundary++) {
      for (let segment = 0; segment < gridSize; segment++) {
        if (segmentHasSeam(vertical, boundary, segment)) found++
      }
    }
    return found >= Math.ceil((gridSize - 1) * gridSize * 0.5)
  }
  if (hasRepeatedSeams(true) && hasRepeatedSeams(false)) return true

  // Rounded stickers expose the dark cube body mainly at four-sticker
  // intersections, even when their straight seams are too narrow or skewed
  // to align with the grid. Several real cropped captures have this shape.
  // Like a seam, the corner must also be darker than the stickers around it
  // (on average - dark blue or red stickers can be darker than a grey-lit
  // body), or light grout between wall tiles would pass as a cube body.
  let visibleIntersections = 0
  const colorAt = (x: number, y: number) => {
    const px = Math.min(width - 1, Math.max(0, Math.round(x)))
    const py = Math.min(height - 1, Math.max(0, Math.round(y)))
    const index = (py * width + px) * 4
    return [data[index], data[index + 1], data[index + 2]]
  }
  const colorDistance = (a: number[], b: number[]) =>
    (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2])) / 3
  for (let row = 1; row < gridSize; row++) {
    for (let col = 1; col < gridSize; col++) {
      const x = xs[col]
      const y = ys[row]
      const cellW = narrower(xs, col), cellH = narrower(ys, row)
      const neighbors = [
        colorAt(x - cellW * 0.45, y - cellH * 0.45),
        colorAt(x + cellW * 0.45, y - cellH * 0.45),
        colorAt(x - cellW * 0.45, y + cellH * 0.45),
        colorAt(x + cellW * 0.45, y + cellH * 0.45),
      ]
      const stickerLuminance = neighbors.reduce((sum, [r, g, b]) => sum + 0.2126 * r + 0.7152 * g + 0.0722 * b, 0) / 4
      let cornerContrast = 0
      let darkestCorner = Infinity
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const corner = colorAt(x + dx * cellW * 0.06, y + dy * cellH * 0.06)
          cornerContrast = Math.max(cornerContrast, Math.min(...neighbors.map((neighbor) => colorDistance(corner, neighbor))))
          darkestCorner = Math.min(darkestCorner, luminance(x + dx * cellW * 0.06, y + dy * cellH * 0.06))
        }
      }
      if (cornerContrast >= 25 && darkestCorner < stickerLuminance) visibleIntersections++
    }
  }
  return visibleIntersections >= Math.ceil((gridSize - 1) ** 2 * 0.5)
}

export function hasVisibleCubeFace(canvas: HTMLCanvasElement, gridSize: number, bounds: FaceBounds = alignedFaceBounds(canvas, gridSize)): boolean {
  const { imageData, faceWidth, faceHeight } = readFaceRegion(canvas, bounds)
  // Judge the face in the layout it is sampled in (see extractColorsFromImageData).
  const outer = estimateOuterCellRatio(imageData.data, faceWidth, faceHeight, gridSize)
  if (!hasCoherentStickerInteriors(imageData.data, faceWidth, faceHeight, gridSize, outer)) return false
  if (hasPlausibleStickerFace(imageData.data, faceWidth, faceHeight, gridSize, outer)) return true

  const ctx = canvas.getContext('2d')
  if (!ctx) return false
  const frame = ctx.getImageData(0, 0, canvas.width, canvas.height).data
  const colorAt = (x: number, y: number) => {
    const px = Math.min(canvas.width - 1, Math.max(0, Math.round(x)))
    const py = Math.min(canvas.height - 1, Math.max(0, Math.round(y)))
    const index = (py * canvas.width + px) * 4
    return [frame[index], frame[index + 1], frame[index + 2]]
  }
  const contrast = (a: number[], b: number[]) => (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2])) / 3
  const inset = Math.min(faceWidth, faceHeight) * 0.06
  // The outline of the square that was read - aligned, maybe tilted - in
  // its own frame: (u, v) from its center, turned with it.
  const cx = bounds.startX + faceWidth / 2, cy = bounds.startY + faceHeight / 2
  const cos = Math.cos(bounds.angle ?? 0), sin = Math.sin(bounds.angle ?? 0)
  const at = (u: number, v: number) => colorAt(cx + cos * u - sin * v, cy + sin * u + cos * v)
  const halfW = faceWidth / 2, halfH = faceHeight / 2
  let visibleSides = 0
  for (let side = 0; side < 4; side++) {
    let contrasted = 0
    for (let i = 1; i <= 9; i++) {
      const u = (i / 10 - 0.5) * faceWidth
      const v = (i / 10 - 0.5) * faceHeight
      const inside = side === 0 ? at(-halfW + inset, v)
        : side === 1 ? at(halfW - inset, v)
        : side === 2 ? at(u, -halfH + inset)
        : at(u, halfH - inset)
      const outside = side === 0 ? at(-halfW - inset, v)
        : side === 1 ? at(halfW + inset, v)
        : side === 2 ? at(u, -halfH - inset)
        : at(u, halfH + inset)
      if (contrast(inside, outside) >= 25) contrasted++
    }
    if (contrasted >= 6) visibleSides++
  }
  return visibleSides >= 3
}

export function extractCubeFaceColors(
  canvas: HTMLCanvasElement,
  gridSize = 3,
  gains: RGB = NEUTRAL_GAINS,
  sampling: SamplingGeometry = DEFAULT_SAMPLING,
  palette?: Record<string, RGB>,
  bounds: FaceBounds = alignedFaceBounds(canvas, gridSize)
): ColorDetectionResult {
  const { imageData, faceWidth, faceHeight } = readFaceRegion(canvas, bounds)
  const result = extractColorsFromImageData(imageData.data, faceWidth, faceHeight, gridSize, gains, sampling, palette)
  const guide = computeFaceBounds(canvas)
  if (bounds.startX === guide.startX && bounds.startY === guide.startY && bounds.faceWidth === guide.faceWidth && !bounds.angle) return result
  return {
    ...result,
    gridOffset: {
      x: (bounds.startX + bounds.faceWidth / 2 - guide.startX - guide.faceWidth / 2) / guide.faceWidth,
      y: (bounds.startY + bounds.faceHeight / 2 - guide.startY - guide.faceHeight / 2) / guide.faceHeight,
      scale: bounds.faceWidth / guide.faceWidth,
      angle: ((bounds.angle ?? 0) * 180) / Math.PI,
    },
  }
}

export interface FaceCaptureResult extends ColorDetectionResult {
  croppedImage: string
  // Sampled once, live, at capture time - see extractBackgroundColor. Null
  // when the frame was too small or the background area came back unreliably dark;
  // callers should then fall back to NEUTRAL_GAINS for this face's
  // cross-face correction rather than treating it as a hard error.
  backgroundColor: RGB | null
  // Where croppedImage came from, for saved fixtures: the full frame's size
  // and the crop rectangle within it (the rest of the frame is dropped for
  // privacy, so this is the only record of how it was framed).
  frame: { width: number; height: number }
  // `angle`: degrees the crop was turned upright by, about its center.
  crop: { x: number; y: number; width: number; height: number; angle?: number }
  // measureSharpness of the cropped face region.
  sharpness: number
}

// Focus measure for a photo: variance of the Laplacian of its luminance
// (a standard blur metric - edges produce large Laplacian values, so a
// sharp image has a wide spread and a blurred one a narrow spread). Only
// comparable between photos of similar content and size, e.g. the 6 faces
// of one capture or recaptures of the same cube; saved with fixtures so an
// out-of-focus face can be spotted.
export function measureSharpness(data: Uint8ClampedArray, width: number, height: number): number {
  if (width < 3 || height < 3) return 0
  const luma = new Float32Array(width * height)
  for (let i = 0; i < width * height; i++) {
    luma[i] = 0.2126 * data[i * 4] + 0.7152 * data[i * 4 + 1] + 0.0722 * data[i * 4 + 2]
  }
  let sum = 0
  let sumSq = 0
  let count = 0
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x
      const laplacian = luma[i - 1] + luma[i + 1] + luma[i - width] + luma[i + width] - 4 * luma[i]
      sum += laplacian
      sumSq += laplacian * laplacian
      count++
    }
  }
  const mean = sum / count
  return sumSq / count - mean * mean
}

function describeCrop(canvas: HTMLCanvasElement, bounds: FaceBounds): Pick<FaceCaptureResult, 'frame' | 'crop' | 'sharpness'> {
  const { imageData, startX, startY, faceWidth, faceHeight } = readFaceRegion(canvas, bounds)
  return {
    frame: { width: canvas.width, height: canvas.height },
    crop: { x: startX, y: startY, width: faceWidth, height: faceHeight, ...(bounds.angle && { angle: (bounds.angle * 180) / Math.PI }) },
    sharpness: measureSharpness(imageData.data, faceWidth, faceHeight),
  }
}

export function captureAndProcessFace(
  video: HTMLVideoElement,
  gridSize = 3,
  gains: RGB = NEUTRAL_GAINS,
  sampling: SamplingGeometry = DEFAULT_SAMPLING,
  palette?: Record<string, RGB>,
  geometry: FaceGeometryMode = 'aligned'
): FaceCaptureResult {
  const canvas = document.createElement('canvas')
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Could not get canvas context')
  }

  ctx.drawImage(video, 0, 0)
  // croppedImage is always the raw, un-gained frame — it's the source of
  // truth photo, re-analyzed independently by the post-capture global
  // recalibration pass (redetectFaceColors / runGlobalWhiteBalance),
  // which always starts over from NEUTRAL_GAINS regardless of what `gains`
  // was passed in here (see the "Gains" comment above) - unless a
  // background-derived correction is supplied for this face instead (see
  // runGlobalWhiteBalance's faceGains parameter).
  // One aligned square for the colors, the saved photo and its crop record,
  // so everything later re-analyzed from the photo sees the same face.
  const bounds = faceBoundsForMode(canvas, gridSize, geometry)
  if (geometry === 'aligned' && !bounds.gridFound) throw new Error('No aligned face found. Show a face in the camera view or choose Guide grid.')
  return {
    ...extractCubeFaceColors(canvas, gridSize, gains, sampling, palette, bounds),
    croppedImage: cropFaceRegionToDataUrl(canvas, bounds),
    backgroundColor: extractBackgroundColor(canvas, sampling.backgroundGap, bounds),
    ...describeCrop(canvas, bounds),
  }
}

export function captureAndProcessImage(
  img: HTMLImageElement,
  gridSize = 3,
  gains: RGB = NEUTRAL_GAINS,
  sampling: SamplingGeometry = DEFAULT_SAMPLING,
  palette?: Record<string, RGB>,
  geometry: FaceGeometryMode = 'aligned'
): FaceCaptureResult {
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Could not get canvas context')
  }

  ctx.drawImage(img, 0, 0)
  // One aligned square for the colors, the saved photo and its crop record,
  // so everything later re-analyzed from the photo sees the same face.
  const bounds = faceBoundsForMode(canvas, gridSize, geometry)
  if (geometry === 'aligned' && !bounds.gridFound) throw new Error('No aligned face found in the image. Choose another image or Guide grid.')
  return {
    ...extractCubeFaceColors(canvas, gridSize, gains, sampling, palette, bounds),
    croppedImage: cropFaceRegionToDataUrl(canvas, bounds),
    backgroundColor: extractBackgroundColor(canvas, sampling.backgroundGap, bounds),
    ...describeCrop(canvas, bounds),
  }
}

function loadImageFromDataUrl(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not load stored face image'))
    img.src = dataUrl
  })
}

// Re-runs color classification on an already-captured face snapshot (the
// croppedImage stored at capture time) with a new set of gains — used by
// the post-capture global white-balance step to redetect every face's
// colors after computing a correction from all 6 faces' stickers together.
// Since croppedImage is already cropped to just the sample region, this
// draws it directly (no re-cropping) rather than reusing
// captureAndProcessImage, which would crop an already-cropped image.
export async function redetectFaceColors(
  croppedImageDataUrl: string,
  gridSize: number,
  gains: RGB,
  sampling: SamplingGeometry = DEFAULT_SAMPLING
): Promise<ColorDetectionResult> {
  const img = await loadImageFromDataUrl(croppedImageDataUrl)
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Could not get canvas context')
  }
  ctx.drawImage(img, 0, 0)

  // extractCubeFaceColors expects to crop its own centered 60% guide-square
  // region out of a full frame, but croppedImageDataUrl IS already that
  // region — so temporarily present it as a frame where the "guide square"
  // covers the whole canvas by padding it out to ~1/0.6 of its size first.
  const pad = 1 / 0.6
  const padded = document.createElement('canvas')
  padded.width = Math.round(canvas.width * pad)
  padded.height = Math.round(canvas.height * pad)
  const pctx = padded.getContext('2d')
  if (!pctx) {
    throw new Error('Could not get canvas context')
  }
  const offsetX = (padded.width - canvas.width) / 2
  const offsetY = (padded.height - canvas.height) / 2
  pctx.drawImage(canvas, offsetX, offsetY)

  // The stored photo was cropped to the aligned square at capture time -
  // sample exactly the guide here instead of aligning it a second time.
  return extractCubeFaceColors(padded, gridSize, gains, sampling, undefined, computeFaceBounds(padded))
}

export interface LearnedColorClassificationResult {
  learned: LearnedColors | null
  applied: boolean
  faces: Record<string, ColorDetectionResult>
}

/**
 * Runs the full post-capture recalibration pass: redetects every face's
 * stored snapshot from scratch (ignoring whatever WB preset/auto-estimate
 * was live-applied during capture — that was only ever a capture-time aid
 * for the user, not something this pass should inherit), learns each
 * color's actual RGB from all 6 faces' stickers together
 * (learnStickerColors), then reclassifies every sticker against those
 * learned colors instead of the hardcoded canonical palette — relabeling
 * only, no re-extraction, since the raw per-cell RGB doesn't change.
 * Falls back to the neutral-gain/hardcoded-palette baseline
 * (`applied: false`) if there aren't enough stickers to cluster reliably.
 *
 * `faceGains`, when given, redetects each face with that face's own gain
 * instead of NEUTRAL_GAINS for all of them - the background-based
 * cross-face correction (see computeBackgroundGain): face 1 is the
 * reference (gain 1,1,1), later faces get whatever gain would make their
 * OWN background patch read the same as face 1's did. A face missing from
 * `faceGains` (background unavailable that shot) falls back to neutral.
 */
// How well `rgb` matches each of the 6 colors, 0-1 on the same scale as
// cellConfidences - for showing a human how plausible each alternative is
// when fixing a sticker. `palette` is the learned colors when the
// cross-face recalibration ran, the canonical ones otherwise.
export function colorConfidences(rgb: RGB, palette: Record<string, RGB> = STICKER_COLORS): Record<string, number> {
  return Object.fromEntries(
    Object.entries(palette).map(([color, centroid]) => [
      color,
      Math.max(0, 1 - clusterDistance(rgb, centroid) / CONFIDENCE_DISTANCE_SCALE),
    ])
  )
}

// How different two 6-color palettes are: the mean distance between their
// same-named colors, in the clustering metric. Used to tell which saved
// cube profile a capture's learned colors most resemble.
export function paletteDistance(a: Record<string, RGB>, b: Record<string, RGB>): number {
  const keys = Object.keys(a).filter((k) => b[k])
  if (keys.length === 0) return Infinity
  return keys.reduce((sum, k) => sum + clusterDistance(a[k], b[k]), 0) / keys.length
}

// How far along the way from its own learned color to the nearest other
// one a sticker may sit before it's worth a second look: distance to its
// own color divided by distance to the nearest other. 0 is dead center,
// 1 is exactly on the boundary.
export const LOOKALIKE_RATIO = 0.6

// The nearest learned color other than `label`, and how close `rgb` is to
// the boundary with it (see LOOKALIKE_RATIO).
export function nearestOtherColor(rgb: RGB, label: string, colors: Record<string, RGB>): { color: string; ratio: number } | null {
  const own = colors[label]
  if (!own) return null
  const ownDistance = clusterDistance(rgb, own)
  let best: { color: string; distance: number } | null = null
  for (const [color, centroid] of Object.entries(colors)) {
    if (color === label) continue
    const distance = clusterDistance(rgb, centroid)
    if (!best || distance < best.distance) best = { color, distance }
  }
  return best ? { color: best.color, ratio: ownDistance / Math.max(best.distance, 1e-9) } : null
}

export async function runGlobalWhiteBalance(
  faceCroppedImages: Record<string, string>,
  gridSize: number,
  faceGains?: Record<string, RGB>,
  sampling: SamplingGeometry = DEFAULT_SAMPLING
): Promise<LearnedColorClassificationResult> {
  const baselineFaces: Record<string, ColorDetectionResult> = {}
  for (const [face, dataUrl] of Object.entries(faceCroppedImages)) {
    const gains = faceGains?.[face] ? limitBackgroundGain(faceGains[face]) : NEUTRAL_GAINS
    baselineFaces[face] = await redetectFaceColors(dataUrl, gridSize, gains, sampling)
  }

  const samples: StickerSample[] = []
  const sampleLocations: Array<{ face: string; row: number; col: number }> = []
  for (const [face, det] of Object.entries(baselineFaces)) {
    for (let r = 0; r < det.colors.length; r++) {
      for (let c = 0; c < det.colors[r].length; c++) {
        samples.push({ rgb: det.cellColors[r][c], colorGuess: det.colors[r][c] })
        sampleLocations.push({ face, row: r, col: c })
      }
    }
  }

  const learned = learnStickerColors(samples)
  if (!learned) return { learned: null, applied: false, faces: baselineFaces }

  // Every sticker's final color/confidence comes directly from
  // learnStickerColors()'s own balanced assignment (labelsBySampleIndex),
  // not an independent per-cell nearest-centroid lookup — that would
  // reopen the "one cluster steals another's points" problem the whole
  // balanced-assignment approach exists to close.
  const reclassifiedFaces: Record<string, ColorDetectionResult> = {}
  for (const [face, det] of Object.entries(baselineFaces)) {
    reclassifiedFaces[face] = {
      colors: det.colors.map((row) => [...row]),
      cellConfidences: det.cellConfidences.map((row) => [...row]),
      cellColors: det.cellColors,
      cellLookalikes: det.colors.map((row) => row.map(() => null)),
      confidence: 0,
    }
  }

  const faceTotals: Record<string, { sum: number; count: number }> = {}
  for (const face of Object.keys(baselineFaces)) faceTotals[face] = { sum: 0, count: 0 }

  samples.forEach((_, i) => {
    const { face, row, col } = sampleLocations[i]
    const label = learned.labelsBySampleIndex[i]
    const cellConfidence = Math.max(0, 1 - learned.leaveOneOutDistances[i] / CONFIDENCE_DISTANCE_SCALE)

    reclassifiedFaces[face].colors[row][col] = label
    reclassifiedFaces[face].cellConfidences[row][col] = cellConfidence
    const nearest = nearestOtherColor(samples[i].rgb, label, learned.colors)
    reclassifiedFaces[face].cellLookalikes![row][col] = nearest && nearest.ratio >= LOOKALIKE_RATIO ? nearest.color : null
    faceTotals[face].sum += cellConfidence
    faceTotals[face].count++
  })

  for (const [face, { sum, count }] of Object.entries(faceTotals)) {
    reclassifiedFaces[face].confidence = count > 0 ? sum / count : 0
  }

  return { learned, applied: true, faces: reclassifiedFaces }
}

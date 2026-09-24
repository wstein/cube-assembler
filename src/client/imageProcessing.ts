// Image processing utilities for cube face detection and color extraction

export interface ColorDetectionResult {
  colors: string[][]
  confidence: number
  cellConfidences: number[][]
  cellColors: RGB[][]
  // Per sticker, the other color it sits close to the boundary with (see
  // nearestOtherColor), or null when it's clearly its own color. Only set
  // after the cross-face recalibration, since it needs the learned colors.
  cellLookalikes?: (string | null)[][]
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

// Where inside the guide square the stickers are sampled - adjustable in
// the capture dialog's sampling setup, since cubes differ in how thick
// their outer plastic border and the gaps between stickers are.
export interface SamplingGeometry {
  // Border between the guide square's edge and the sticker grid, as a
  // fraction of the square's side, on each side (0 = grid fills the square).
  faceMargin: number
  // Fraction of each sticker cell that's sampled, centered (the rest is
  // the gap/dead zone around it).
  stickerCore: number
}

export const DEFAULT_SAMPLING: SamplingGeometry = { faceMargin: 0, stickerCore: SAMPLE_CORE_FRACTION }

// A sticker cell's sampled rectangle within a face of the given size -
// shared by the detector and the UI overlay so both draw the same zones.
export function stickerSampleRect(
  row: number,
  col: number,
  gridSize: number,
  faceWidth: number,
  faceHeight: number,
  sampling: SamplingGeometry = DEFAULT_SAMPLING
): { x: number; y: number; width: number; height: number } {
  const gridX = faceWidth * sampling.faceMargin
  const gridY = faceHeight * sampling.faceMargin
  const cellWidth = (faceWidth - 2 * gridX) / gridSize
  const cellHeight = (faceHeight - 2 * gridY) / gridSize
  const inset = (1 - sampling.stickerCore) / 2
  return {
    x: gridX + (col + inset) * cellWidth,
    y: gridY + (row + inset) * cellHeight,
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

function oklabDistance(o1: Oklab, o2: Oklab): number {
  const dl = o1.l - o2.l
  const da = o1.a - o2.a
  const db = o1.b - o2.b
  return Math.sqrt(dl * dl + da * da + db * db)
}

function colorDistance(c1: RGB, c2: RGB): number {
  return oklabDistance(rgbToOklab(c1), rgbToOklab(c2))
}

// How much less the L (lightness) axis counts than a/b (hue+chroma) in the
// learnStickerColors clustering pipeline specifically - NOT the plain
// colorDistance above, which closestSticker and CONFIDENCE_DISTANCE_SCALE
// are calibrated against and which stays unweighted. Counterintuitive
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

function closestSticker(color: RGB): string {
  let closest = 'W'
  let minDist = Infinity

  for (const [stickerColor, stickerRGB] of Object.entries(STICKER_COLORS)) {
    const dist = colorDistance(color, stickerRGB)
    if (dist < minDist) {
      minDist = dist
      closest = stickerColor
    }
  }

  return closest
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

interface FaceBounds {
  startX: number
  startY: number
  faceWidth: number
  faceHeight: number
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
function computeFaceBounds(canvas: HTMLCanvasElement, fraction = SAMPLE_FACE_FRACTION): FaceBounds {
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

function getFaceRegion(canvas: HTMLCanvasElement): FaceRegion {
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Could not get canvas context')
  }

  const bounds = computeFaceBounds(canvas)
  return {
    ...bounds,
    imageData: ctx.getImageData(bounds.startX, bounds.startY, bounds.faceWidth, bounds.faceHeight),
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
export function extractBackgroundColor(canvas: HTMLCanvasElement): RGB | null {
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  const inner = computeFaceBounds(canvas, SAMPLE_FACE_FRACTION)
  const outer = computeFaceBounds(canvas, BACKGROUND_REGION_FRACTION)
  if (outer.faceWidth < 40 || outer.faceHeight < 40) return null

  const imageData = ctx.getImageData(outer.startX, outer.startY, outer.faceWidth, outer.faceHeight)
  const data = imageData.data
  const innerLeft = inner.startX - outer.startX
  const innerTop = inner.startY - outer.startY
  const innerRight = innerLeft + inner.faceWidth
  const innerBottom = innerTop + inner.faceHeight

  const pixels: RGB[] = []
  for (let y = 0; y < outer.faceHeight; y++) {
    const inRow = y >= innerTop && y < innerBottom
    for (let x = 0; x < outer.faceWidth; x++) {
      if (inRow && x >= innerLeft && x < innerRight) continue // inside the sticker square - skip
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

export function cropFaceRegionToDataUrl(canvas: HTMLCanvasElement): string {
  const bounds = computeFaceBounds(canvas)
  const out = document.createElement('canvas')
  out.width = bounds.faceWidth
  out.height = bounds.faceHeight

  const ctx = out.getContext('2d')
  if (!ctx) {
    throw new Error('Could not get canvas context')
  }

  ctx.drawImage(
    canvas,
    bounds.startX, bounds.startY, bounds.faceWidth, bounds.faceHeight,
    0, 0, bounds.faceWidth, bounds.faceHeight
  )
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
  sampling: SamplingGeometry = DEFAULT_SAMPLING
): ColorDetectionResult {
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
      const rect = stickerSampleRect(row, col, gridSize, faceWidth, faceHeight, sampling)
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

      const trimmedMean = trimmedMeanColor(pixels)
      if (trimmedMean) {
        const avgColor: RGB = applyGains(trimmedMean, gains)
        rowRGB.push(avgColor)
        const stickerColor = closestSticker(avgColor)
        rowColors.push(stickerColor)

        // Confidence based on OKLab color distance (0-1, higher = better match)
        const dist = colorDistance(avgColor, STICKER_COLORS[stickerColor])
        const cellConfidence = Math.max(0, 1 - dist / CONFIDENCE_DISTANCE_SCALE)
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

  return { colors, confidence, cellConfidences, cellColors }
}

export function extractCubeFaceColors(
  canvas: HTMLCanvasElement,
  gridSize = 3,
  gains: RGB = NEUTRAL_GAINS,
  sampling: SamplingGeometry = DEFAULT_SAMPLING
): ColorDetectionResult {
  const { imageData, faceWidth, faceHeight } = getFaceRegion(canvas)
  return extractColorsFromImageData(imageData.data, faceWidth, faceHeight, gridSize, gains, sampling)
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
  crop: { x: number; y: number; width: number; height: number }
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

function describeCrop(canvas: HTMLCanvasElement): Pick<FaceCaptureResult, 'frame' | 'crop' | 'sharpness'> {
  const { imageData, startX, startY, faceWidth, faceHeight } = getFaceRegion(canvas)
  return {
    frame: { width: canvas.width, height: canvas.height },
    crop: { x: startX, y: startY, width: faceWidth, height: faceHeight },
    sharpness: measureSharpness(imageData.data, faceWidth, faceHeight),
  }
}

export function captureAndProcessFace(
  video: HTMLVideoElement,
  gridSize = 3,
  gains: RGB = NEUTRAL_GAINS,
  sampling: SamplingGeometry = DEFAULT_SAMPLING
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
  return {
    ...extractCubeFaceColors(canvas, gridSize, gains, sampling),
    croppedImage: cropFaceRegionToDataUrl(canvas),
    backgroundColor: extractBackgroundColor(canvas),
    ...describeCrop(canvas),
  }
}

export function captureAndProcessImage(
  img: HTMLImageElement,
  gridSize = 3,
  gains: RGB = NEUTRAL_GAINS,
  sampling: SamplingGeometry = DEFAULT_SAMPLING
): FaceCaptureResult {
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Could not get canvas context')
  }

  ctx.drawImage(img, 0, 0)
  return {
    ...extractCubeFaceColors(canvas, gridSize, gains, sampling),
    croppedImage: cropFaceRegionToDataUrl(canvas),
    backgroundColor: extractBackgroundColor(canvas),
    ...describeCrop(canvas),
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

  return extractCubeFaceColors(padded, gridSize, gains, sampling)
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

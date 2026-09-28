import { STICKER_COLORS, type RGB } from './stickerColorGeometry'
import {
  clusterDistance,
  clusterOklabDistance,
  rgbToOklab,
  oklabToRgb,
  type Oklab,
} from './colorMath'

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
          if (cur < minv[j]) {
            minv[j] = cur
            way[j] = j0
          }
          if (minv[j] < delta) {
            delta = minv[j]
            j1 = j
          }
        }
      }
      for (let j = 0; j <= n; j++) {
        if (used[j]) {
          u[p[j]] += delta
          v[j] -= delta
        } else {
          minv[j] -= delta
        }
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
// `pinned[i]`, when set, is the cluster point i must take regardless of
// cost (see clearStickerColors); the rest share the slots left over.
export function balancedAssign(
  points: RGB[],
  centroids: RGB[],
  pinned: Array<number | null> = [],
): number[] {
  const k = centroids.length
  const n = points.length
  const capacity = Math.ceil(n / k)
  const result: number[] = new Array(n)
  const free: number[] = []
  const slots = new Array(k).fill(capacity)
  for (let pi = 0; pi < n; pi++) {
    const pin = pinned[pi]
    if (pin != null && slots[pin] > 0) {
      result[pi] = pin
      slots[pin]--
    } else free.push(pi)
  }
  const slotCluster = slots.flatMap((count, ci) => new Array(count).fill(ci))
  const totalSlots = slotCluster.length

  const cost: number[][] = free.map((pi) => {
    const distances = centroids.map((centroid) =>
      clusterDistance(points[pi], centroid),
    )
    return slotCluster.map((ci) => distances[ci])
  })
  // Dummy rows (real points don't reach this far into `cost`) cost
  // nothing to place anywhere, so the solver always "spends" them on
  // whichever leftover slots are cheapest to leave empty rather than
  // distorting a real point's assignment.
  for (let pi = free.length; pi < totalSlots; pi++)
    cost.push(new Array(totalSlots).fill(0))

  const slotAssignment = hungarianAssignment(cost)
  free.forEach((pi, j) => {
    result[pi] = slotCluster[slotAssignment[j]]
  })
  return result
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
      for (const c of centroids)
        minDist = Math.min(minDist, clusterDistance(p, c))
      if (minDist > farthestMinDist) {
        farthestMinDist = minDist
        farthest = p
      }
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
    const sums = Array.from({ length: k }, () => ({
      l: 0,
      a: 0,
      b: 0,
      count: 0,
    }))
    points.forEach((p, pi) => {
      const c = assignment[pi]
      const lab = rgbToOklab(p)
      sums[c].l += lab.l
      sums[c].a += lab.a
      sums[c].b += lab.b
      sums[c].count++
    })
    centroids = centroids.map(
      (c, i) =>
        sums[i].count > 0
          ? oklabToRgb({
              l: sums[i].l / sums[i].count,
              a: sums[i].a / sums[i].count,
              b: sums[i].b / sums[i].count,
            })
          : c, // keep empty clusters where they were rather than collapsing to NaN
    )
  }

  return splitMixedPairs(points, centroids, iterations)
}

function oklabMean(points: RGB[]): RGB {
  const labs = points.map(rgbToOklab)
  return oklabToRgb({
    l: labs.reduce((sum, lab) => sum + lab.l, 0) / labs.length,
    a: labs.reduce((sum, lab) => sum + lab.a, 0) / labs.length,
    b: labs.reduce((sum, lab) => sum + lab.b, 0) / labs.length,
  })
}

// The cheapest way to put exactly `size` of `points` with the first centroid
// and the rest with the second: those that gain most from the first go
// there. Exact, and far cheaper than balancedAssign for two clusters.
function splitInTwo(points: RGB[], centroids: RGB[], size: number): number[] {
  const gain = points.map(
    (p) =>
      clusterDistance(p, centroids[1]) ** 2 -
      clusterDistance(p, centroids[0]) ** 2,
  )
  const order = points.map((_, i) => i).sort((i, j) => gain[j] - gain[i])
  const split = new Array(points.length).fill(1)
  for (const i of order.slice(0, size)) split[i] = 0
  return split
}

// Lloyd's iterations can settle with two colors shared between two
// clusters. On a real capture whose blues ranged from shadowed edges
// (L 0.31) to a bright center (L 0.59), the reds and blues split by
// lightness into two purple clusters - dark reds with dark blues, light
// with light - at 3.7x the error of the true grouping, and every start
// (each sticker, or the six centers) ended there. So each pair of
// clusters is split again from its two most different members, and the
// split is kept when it lowers the total error.
function splitMixedPairs(
  points: RGB[],
  centroids: RGB[],
  iterations: number,
): RGB[] {
  const best = [...centroids]
  let assignment = balancedAssign(points, best)
  for (let x = 0; x < best.length; x++) {
    for (let y = x + 1; y < best.length; y++) {
      const members = points.filter(
        (_, pi) => assignment[pi] === x || assignment[pi] === y,
      )
      if (members.length < 2) continue
      const before = points.reduce(
        (sum, p, pi) =>
          assignment[pi] === x || assignment[pi] === y
            ? sum + clusterDistance(p, best[assignment[pi]]) ** 2
            : sum,
        0,
      )
      let seeds: RGB[] = [members[0], members[1]]
      let farthest = -1
      for (const p of members) {
        for (const q of members) {
          const d = clusterDistance(p, q)
          if (d > farthest) {
            farthest = d
            seeds = [p, q]
          }
        }
      }
      const size = assignment.filter((ci) => ci === x).length
      let split = splitInTwo(members, seeds, size)
      for (let iter = 0; iter < iterations; iter++) {
        seeds = [0, 1].map((side) => {
          const group = members.filter((_, mi) => split[mi] === side)
          return group.length > 0 ? oklabMean(group) : seeds[side]
        })
        split = splitInTwo(members, seeds, size)
      }
      // Only these members move, so comparing their error decides it.
      const after = members.reduce(
        (sum, p, mi) => sum + clusterDistance(p, seeds[split[mi]]) ** 2,
        0,
      )
      if (after < before - 1e-9) {
        best[x] = seeds[0]
        best[y] = seeds[1]
        assignment = balancedAssign(points, best)
      }
    }
  }
  return best
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
      for (let i = 0; i < k; i++)
        cost += clusterDistance(centroids[i], canonical[arr[i]]) ** 2
      if (cost < bestCost) {
        bestCost = cost
        bestAssignment = [...arr]
      }
      return
    }
    for (let i = l; i < arr.length; i++) {
      ;[arr[l], arr[i]] = [arr[i], arr[l]]
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
  // Each sample's pinned color (see clearStickerColors), or null.
  clearLabels: Array<string | null>
  // Colors whose cluster likely mixed two colors (see mixedUpClusters).
  mixedUpColors: string[]
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
function shrinkTowardCanonical(
  learned: RGB,
  canonical: RGB,
  sampleCount: number,
): RGB {
  const weight = sampleCount / (sampleCount + CENTROID_SHRINKAGE_PRIOR)
  const learnedLab = rgbToOklab(learned)
  const canonicalLab = rgbToOklab(canonical)
  return oklabToRgb({
    l: learnedLab.l * weight + canonicalLab.l * (1 - weight),
    a: learnedLab.a * weight + canonicalLab.a * (1 - weight),
    b: learnedLab.b * weight + canonicalLab.b * (1 - weight),
  })
}

// A sticker needs at least this much color (OKLab chroma) before it can
// be pinned to its color (see clearStickerColors). Glare washes stickers
// toward white; the paled ones stay below this and are left to the
// balance.
const CLEAR_STICKER_MIN_CHROMA = 0.08
// ...and its distance to the nearest reference color may be at most this
// fraction of its distance to the second nearest.
const CLEAR_STICKER_RATIO = 0.5

// The reference color each sticker unmistakably shows, or null. The
// nine-per-color balance otherwise moves any sticker, however plain: on a
// capture where glare paled four yellows, the learned yellow drifted pale
// and the balance kept those four in Y while pushing three plainly yellow
// stickers (hue 101-104, next to the reference yellow's 111) out to green.
// Hue alone can't decide it - whites carry blue's hue at chroma 0.1 and a
// pinkish orange sits on red's hue - so the whole OKLab color must be
// clearly nearest one reference color.
export function clearStickerColors(
  points: RGB[],
  referencePalette: Record<string, RGB>,
): Array<string | null> {
  const references = Object.entries(referencePalette)
  return points.map((point) => {
    const lab = rgbToOklab(point)
    if (Math.hypot(lab.a, lab.b) < CLEAR_STICKER_MIN_CHROMA) return null
    const ranked = references
      .map(([color, rgb]) => ({ color, distance: clusterDistance(point, rgb) }))
      .sort((x, y) => x.distance - y.distance)
    return ranked[0].distance <= CLEAR_STICKER_RATIO * ranked[1].distance
      ? ranked[0].color
      : null
  })
}

// A sticker reads as washed out by glare when it is at least this much
// lighter (OKLab L) than the clear stickers of its color...
const GLARE_MIN_LIGHTER = 0.04
// ...and has at most this fraction of their chroma, or a hue this many
// degrees off theirs (glare turned greens turquoise, hue 180 vs. 145).
const GLARE_MAX_CHROMA_FRACTION = 0.6
const GLARE_MIN_HUE_SHIFT = 25
// Glare on this many stickers is worth a warning. On the saved captures,
// evenly lit ones show at most 3 such stickers; the glare capture 7.
export const GLARE_WARNING_STICKERS = 4

// The stickers glare washed out: lighter than, and paler or hue-shifted
// from, the stickers that clearly show their color (see
// clearStickerColors). Compared within the capture, not against the
// palette, so a palette a little off doesn't count as glare; shadows are
// darker and don't count either. White can't be washed out.
export function glareStickers(
  points: RGB[],
  labels: string[],
  palette: Record<string, RGB>,
): number[] {
  const clear = clearStickerColors(points, palette)
  const labs = points.map(rgbToOklab)
  const glare: number[] = []
  for (const color of Object.keys(palette)) {
    if (color === 'W') continue
    const members = labels.flatMap((label, i) => (label === color ? [i] : []))
    const anchors = members.filter((i) => clear[i] === color)
    if (anchors.length < 2) continue
    const l = anchors.reduce((sum, i) => sum + labs[i].l, 0) / anchors.length
    const a = anchors.reduce((sum, i) => sum + labs[i].a, 0) / anchors.length
    const b = anchors.reduce((sum, i) => sum + labs[i].b, 0) / anchors.length
    for (const i of members) {
      if (clear[i] === color || labs[i].l < l + GLARE_MIN_LIGHTER) continue
      const chroma = Math.hypot(labs[i].a, labs[i].b)
      const shift =
        (Math.abs(Math.atan2(labs[i].b, labs[i].a) - Math.atan2(b, a)) * 180) /
        Math.PI
      if (
        chroma <= GLARE_MAX_CHROMA_FRACTION * Math.hypot(a, b) ||
        Math.min(shift, 360 - shift) >= GLARE_MIN_HUE_SHIFT
      )
        glare.push(i)
    }
  }
  return glare
}

// How far a cluster's center may sit from the stickers finally given its
// color before the cluster is taken to have mixed two colors. On the saved
// captures the red/blue mixes sat 0.09-0.12 away; every other cluster,
// glare included, at most 0.044.
const MIXED_CLUSTER_DRIFT = 0.07

// The clusters whose center is far from the mean of the points assigned to
// them. A cluster that took in two colors has its center between them -
// the red/blue mix was purple - while the final assignment, pulled toward
// the reference colors, hands it only one; its learned color can't be
// trusted even when every sticker came out right.
export function mixedUpClusters(
  points: RGB[],
  centroids: RGB[],
  assignment: number[],
): number[] {
  return centroids.flatMap((centroid, ci) => {
    const members = points.filter((_, pi) => assignment[pi] === ci)
    return members.length > 0 &&
      clusterDistance(centroid, oklabMean(members)) > MIXED_CLUSTER_DRIFT
      ? [ci]
      : []
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
export function learnStickerColors(
  samples: StickerSample[],
  referencePalette: Record<string, RGB> = STICKER_COLORS,
  clearLabels: Array<string | null> = [],
): LearnedColors | null {
  const points = samples.map((s) => s.rgb)
  const K = 6
  if (points.length < K) return null

  const centroids = kMeansCluster(points, K)
  const canonicalKeys = Object.keys(STICKER_COLORS)
  const canonicalList = canonicalKeys.map((k) => referencePalette[k])
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
  const shrunkCentroids = centroids.map((c, i) =>
    shrinkTowardCanonical(c, canonicalList[permutation[i]], clusterCounts[i]),
  )

  // DEFINITIVE balanced-assignment pass, against the shrunk centroids -
  // this is what actually gets used as each sticker's color, not an
  // independent nearest-centroid lookup per sticker (which would reopen
  // the same "one cluster steals another's points" failure the whole
  // balanced-assignment approach exists to close) and not the
  // provisional pre-shrink assignment above (which is only there to size
  // the shrinkage weight).
  // Stickers that clearly show one color keep it; only the rest are
  // balanced (see clearStickerColors).
  const clusterOf = (name: string | null) =>
    name == null
      ? null
      : permutation.findIndex(
          (canonicalIdx) => canonicalKeys[canonicalIdx] === name,
        )
  const pointAssignment = balancedAssign(
    points,
    shrunkCentroids,
    points.map((_, i) => clusterOf(clearLabels[i] ?? null)),
  )

  const colors: Record<string, RGB> = {}
  const clusterSizes: Record<string, number> = {}
  for (let i = 0; i < K; i++) {
    const name = canonicalKeys[permutation[i]]
    colors[name] = shrunkCentroids[i]
    clusterSizes[name] = clusterCounts[i]
  }

  const labelsBySampleIndex = pointAssignment.map(
    (clusterIdx) => canonicalKeys[permutation[clusterIdx]],
  )

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

  const mixedUpColors = mixedUpClusters(points, centroids, pointAssignment).map(
    (ci) => canonicalKeys[permutation[ci]],
  )

  return {
    colors,
    clusterSizes,
    labelsBySampleIndex,
    leaveOneOutDistances,
    clearLabels: points.map((_, i) => clearLabels[i] ?? null),
    mixedUpColors,
  }
}

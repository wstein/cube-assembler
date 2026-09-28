open StickerGeometry
open! ColorMath

type stickerSample = {rgb: rgb, colorGuess: string}

let squared = x => x *. x

// Minimum-cost perfect bipartite matching on a square cost matrix
// (Kuhn-Munkres / Hungarian algorithm, O(n^3) via successive shortest
// augmenting paths with potentials, as in
// https://cp-algorithms.com/graph/hungarian-algorithm.html). Returns
// assignment[row] = column minimizing total cost[row][assignment[row]].
// Verified against brute force on random small cases.
let hungarianAssignment = (cost: array<array<float>>) => {
  let n = Array.length(cost)
  let infinity = Float.Constants.positiveInfinity
  // 1-indexed throughout (index 0 is a sentinel "no row/column yet").
  let u = Array.make(~length=n + 1, 0.0)
  let v = Array.make(~length=n + 1, 0.0)
  // p[j] = row currently matched to column j.
  let p = Array.make(~length=n + 1, 0)
  let way = Array.make(~length=n + 1, 0)
  let get = Array.getUnsafe
  let set = Array.setUnsafe
  for i in 1 to n {
    p->set(0, i)
    let j0 = ref(0)
    let minv = Array.make(~length=n + 1, infinity)
    let used = Array.make(~length=n + 1, false)
    let continue = ref(true)
    while continue.contents {
      used->set(j0.contents, true)
      let i0 = p->get(j0.contents)
      let delta = ref(infinity)
      let j1 = ref(-1)
      for j in 1 to n {
        if !(used->get(j)) {
          let current = cost->get(i0 - 1)->get(j - 1) -. u->get(i0) -. v->get(j)
          if current < minv->get(j) {
            minv->set(j, current)
            way->set(j, j0.contents)
          }
          if minv->get(j) < delta.contents {
            delta := minv->get(j)
            j1 := j
          }
        }
      }
      for j in 0 to n {
        if used->get(j) {
          u->set(p->get(j), u->get(p->get(j)) +. delta.contents)
          v->set(j, v->get(j) -. delta.contents)
        } else {
          minv->set(j, minv->get(j) -. delta.contents)
        }
      }
      j0 := j1.contents
      continue := p->get(j0.contents) != 0
    }
    let continue = ref(true)
    while continue.contents {
      let j1 = way->get(j0.contents)
      p->set(j0.contents, p->get(j1))
      j0 := j1
      continue := j0.contents != 0
    }
  }
  let result = Array.make(~length=n, 0)
  for j in 1 to n {
    if p->get(j) > 0 {
      result->set(p->get(j) - 1, j - 1)
    }
  }
  result
}

// Assigns each point to one of `centroids`, each centroid taking as close
// as possible to points / centroids of them - a valid NxN capture always
// has exactly N^2 stickers of each color. Solved as a genuine minimum-cost
// assignment: each centroid becomes `capacity` equal-cost slots, padded
// with zero-cost dummy points when they don't divide evenly, so the
// globally cheapest assignment wins. A greedy version once stranded a
// point 0.49 from its assigned color while its own color, 0.04 away, had
// filled up. `pinned[i]`, when set, is the cluster point i must take (see
// clearStickerColors); the rest share the slots left over.
let balancedAssign = (
  points: array<rgb>,
  centroids: array<rgb>,
  pinned: array<Nullable.t<int>>,
) => {
  let k = Array.length(centroids)
  let n = Array.length(points)
  let capacity = Math.ceil(Int.toFloat(n) /. Int.toFloat(k))->Float.toInt
  let result = Array.make(~length=n, 0)
  let free = []
  let slots = Array.make(~length=k, capacity)
  points->Array.forEachWithIndex((_, pi) =>
    switch pinned[pi]->Option.flatMap(Nullable.toOption) {
    | Some(pin) if pin >= 0 && pin < k && slots->Array.getUnsafe(pin) > 0 =>
      result->Array.setUnsafe(pi, pin)
      slots->Array.setUnsafe(pin, slots->Array.getUnsafe(pin) - 1)
    | _ => free->Array.push(pi)
    }
  )
  let slotCluster = slots->Array.flatMapWithIndex((count, ci) => Array.make(~length=count, ci))
  let totalSlots = Array.length(slotCluster)
  let cost = free->Array.map(pi => {
    let point = points->Array.getUnsafe(pi)
    let distances = centroids->Array.map(centroid => clusterDistance(point, centroid))
    slotCluster->Array.map(ci => distances->Array.getUnsafe(ci))
  })
  // Dummy rows cost nothing anywhere, so they take whichever leftover slots
  // are cheapest to leave empty.
  for _ in Array.length(free) to totalSlots - 1 {
    cost->Array.push(Array.make(~length=totalSlots, 0.0))
  }
  let slotAssignment = hungarianAssignment(cost)
  free->Array.forEachWithIndex((pi, j) =>
    result->Array.setUnsafe(pi, slotCluster->Array.getUnsafe(slotAssignment->Array.getUnsafe(j)))
  )
  result
}

let unpinned = []

let oklabMean = (points: array<rgb>) => {
  let labs = points->Array.map(rgbToOklab)
  let count = Int.toFloat(Array.length(labs))
  oklabToRgb({
    l: labs->Array.reduce(0.0, (sum, lab) => sum +. lab.l) /. count,
    a: labs->Array.reduce(0.0, (sum, lab) => sum +. lab.a) /. count,
    b: labs->Array.reduce(0.0, (sum, lab) => sum +. lab.b) /. count,
  })
}

// The cheapest way to put exactly `size` of `points` with the first centroid
// and the rest with the second: those that gain most from the first go
// there. Exact, and far cheaper than balancedAssign for two clusters.
let splitInTwo = (points: array<rgb>, centroids: array<rgb>, size) => {
  let gain =
    points->Array.map(p =>
      squared(clusterDistance(p, centroids->Array.getUnsafe(1))) -.
      squared(clusterDistance(p, centroids->Array.getUnsafe(0)))
    )
  let order =
    points
    ->Array.mapWithIndex((_, i) => i)
    ->Array.toSorted((i, j) => gain->Array.getUnsafe(j) -. gain->Array.getUnsafe(i))
  let split = Array.make(~length=Array.length(points), 1)
  order->Array.slice(~start=0, ~end=size)->Array.forEach(i => split->Array.setUnsafe(i, 0))
  split
}

// Lloyd's iterations can settle with two colors shared between two
// clusters: on a real capture whose blues ranged from shadowed (L 0.31) to
// bright (L 0.59), reds and blues split by lightness into two purple
// clusters at 3.7x the error of the true grouping. So each pair of clusters
// is split again from its two most different members, and the split is
// kept when it lowers the total error.
let splitMixedPairs = (points: array<rgb>, centroids: array<rgb>, iterations) => {
  let best = Array.copy(centroids)
  let assignment = ref(balancedAssign(points, best, unpinned))
  let k = Array.length(best)
  for x in 0 to k - 1 {
    for y in x + 1 to k - 1 {
      let inPair = pi => {
        let ci = assignment.contents->Array.getUnsafe(pi)
        ci == x || ci == y
      }
      let members = points->Array.filterWithIndex((_, pi) => inPair(pi))
      if Array.length(members) >= 2 {
        let before =
          points->Array.reduceWithIndex(0.0, (sum, p, pi) =>
            inPair(pi)
              ? sum +.
                squared(
                  clusterDistance(
                    p,
                    best->Array.getUnsafe(assignment.contents->Array.getUnsafe(pi)),
                  ),
                )
              : sum
          )
        let seeds = ref([members->Array.getUnsafe(0), members->Array.getUnsafe(1)])
        let farthest = ref(-1.0)
        members->Array.forEach(p =>
          members->Array.forEach(q => {
            let d = clusterDistance(p, q)
            if d > farthest.contents {
              farthest := d
              seeds := [p, q]
            }
          })
        )
        let size = assignment.contents->Array.filter(ci => ci == x)->Array.length
        let split = ref(splitInTwo(members, seeds.contents, size))
        for _ in 1 to iterations {
          seeds :=
            [0, 1]->Array.map(side => {
              let group =
                members->Array.filterWithIndex((_, mi) =>
                  split.contents->Array.getUnsafe(mi) == side
                )
              Array.length(group) > 0 ? oklabMean(group) : seeds.contents->Array.getUnsafe(side)
            })
          split := splitInTwo(members, seeds.contents, size)
        }
        // Only these members move, so comparing their error decides it.
        let after =
          members->Array.reduceWithIndex(0.0, (sum, p, mi) =>
            sum +.
            squared(
              clusterDistance(
                p,
                seeds.contents->Array.getUnsafe(split.contents->Array.getUnsafe(mi)),
              ),
            )
          )
        if after < before -. 1e-9 {
          best->Array.setUnsafe(x, seeds.contents->Array.getUnsafe(0))
          best->Array.setUnsafe(y, seeds.contents->Array.getUnsafe(1))
          assignment := balancedAssign(points, best, unpinned)
        }
      }
    }
  }
  best
}

// k-means (Lloyd's algorithm) with balanced assignment and deterministic
// farthest-point seeding: start from the first point, then keep adding the
// point farthest from its nearest chosen centroid. (Seeding along the
// widest channel failed when two colors tie on it - green and blue both
// have r=0.) Centroids are averaged in Oklab, the space distances use.
let kMeansCluster = (points: array<rgb>, k, iterations) => {
  let centroids = ref(points->Array.slice(~start=0, ~end=1))
  while (
    Array.length(centroids.contents) < k && Array.length(centroids.contents) < Array.length(points)
  ) {
    let farthest = ref(points->Array.getUnsafe(0))
    let farthestMinDist = ref(-1.0)
    points->Array.forEach(p => {
      let minDist =
        centroids.contents->Array.reduce(Float.Constants.positiveInfinity, (m, c) =>
          Math.min(m, clusterDistance(p, c))
        )
      if minDist > farthestMinDist.contents {
        farthestMinDist := minDist
        farthest := p
      }
    })
    centroids := [...centroids.contents, farthest.contents]
  }
  for _ in 1 to iterations {
    let assignment = balancedAssign(points, centroids.contents, unpinned)
    let sums = Array.fromInitializer(~length=k, _ => (ref(0.0), ref(0.0), ref(0.0), ref(0)))
    points->Array.forEachWithIndex((p, pi) => {
      let (l, a, b, count) = sums->Array.getUnsafe(assignment->Array.getUnsafe(pi))
      let lab = rgbToOklab(p)
      l := l.contents +. lab.l
      a := a.contents +. lab.a
      b := b.contents +. lab.b
      count := count.contents + 1
    })
    centroids :=
      centroids.contents->Array.mapWithIndex((c, i) => {
        let (l, a, b, count) = sums->Array.getUnsafe(i)
        let n = Int.toFloat(count.contents)
        // An empty cluster stays where it was rather than becoming NaN.
        count.contents > 0
          ? oklabToRgb({l: l.contents /. n, a: a.contents /. n, b: b.contents /. n})
          : c
      })
  }
  splitMixedPairs(points, centroids.contents, iterations)
}

// Brute force over all k! pairings (720 for 6) of centroids to canonical
// colors, minimizing total squared distance; ties go to the first found.
let bestPermutationMatch = (centroids: array<rgb>, canonical: array<rgb>) => {
  let k = Array.length(centroids)
  let bestAssignment = ref(Array.fromInitializer(~length=k, i => i))
  let bestCost = ref(Float.Constants.positiveInfinity)
  let arrangement = Array.fromInitializer(~length=k, i => i)
  let swap = (a, b) => {
    let held = arrangement->Array.getUnsafe(a)
    arrangement->Array.setUnsafe(a, arrangement->Array.getUnsafe(b))
    arrangement->Array.setUnsafe(b, held)
  }
  let rec permute = l =>
    if l == k {
      let cost = ref(0.0)
      for i in 0 to k - 1 {
        cost :=
          cost.contents +.
          squared(
            clusterDistance(
              centroids->Array.getUnsafe(i),
              canonical->Array.getUnsafe(arrangement->Array.getUnsafe(i)),
            ),
          )
      }
      if cost.contents < bestCost.contents {
        bestCost := cost.contents
        bestAssignment := Array.copy(arrangement)
      }
    } else {
      for i in l to k - 1 {
        swap(l, i)
        permute(l + 1)
        swap(l, i)
      }
    }
  permute(0)
  bestAssignment.contents
}

type learnedColors = {
  colors: Dict.t<rgb>,
  clusterSizes: Dict.t<int>,
  labelsBySampleIndex: array<string>,
  // Each sample's distance to its cluster's centroid computed WITHOUT that
  // sample (leave-one-out), so it can't be flattered by its own membership.
  leaveOneOutDistances: array<float>,
  // Each sample's pinned color (see clearStickerColors), or null.
  clearLabels: array<Null.t<string>>,
  // Colors whose cluster likely mixed two colors (see mixedUpClusters).
  mixedUpColors: array<string>,
}

// "Virtual sample count" a learned centroid is shrunk toward its matched
// canonical anchor by: it keeps weight count/(count+3) of its own position.
// That fixes 2x2 captures, whose 4 samples per color swing wildly, without
// touching 3x3/4x4 clusters (9-16 samples), which canonical anchors would
// only bias - real red/orange and green/yellow sit closer than the WCA
// swatches. 3 is the middle of a 1.9-3.8 plateau on the real fixtures.
let centroidShrinkagePrior = 3.0

// Blends a learned centroid toward its canonical anchor in Oklab, never
// fully either at any finite sample count.
let shrinkTowardCanonical = (learned, canonical, sampleCount) => {
  let count = Int.toFloat(sampleCount)
  let weight = count /. (count +. centroidShrinkagePrior)
  let learnedLab = rgbToOklab(learned)
  let canonicalLab = rgbToOklab(canonical)
  oklabToRgb({
    l: learnedLab.l *. weight +. canonicalLab.l *. (1.0 -. weight),
    a: learnedLab.a *. weight +. canonicalLab.a *. (1.0 -. weight),
    b: learnedLab.b *. weight +. canonicalLab.b *. (1.0 -. weight),
  })
}

// A sticker needs at least this much chroma before it can be pinned to its
// color - glare pales stickers toward white - and its distance to the
// nearest reference color may be at most half its distance to the second.
let clearStickerMinChroma = 0.08
let clearStickerRatio = 0.5

// The reference color each sticker unmistakably shows, or null. The
// per-color balance otherwise moves any sticker, however plain: with four
// glare-paled yellows the balance once pushed three plainly yellow stickers
// out to green. Hue alone can't decide it (whites carry blue's hue at
// chroma 0.1), so the whole Oklab color must be clearly nearest one color.
let clearStickers = (points: array<rgb>, referencePalette: Dict.t<rgb>) => {
  let references = referencePalette->Dict.toArray
  points->Array.map(point => {
    let lab = rgbToOklab(point)
    if Math.hypot(lab.a, lab.b) < clearStickerMinChroma {
      None
    } else {
      let ranked =
        references
        ->Array.map(((color, rgb)) => (color, clusterDistance(point, rgb)))
        ->Array.toSorted(((_, x), (_, y)) => x -. y)
      let (color, nearest) = ranked->Array.getUnsafe(0)
      let (_, second) = ranked->Array.getUnsafe(1)
      nearest <= clearStickerRatio *. second ? Some(color) : None
    }
  })
}

let clearStickerColors = (points, referencePalette) =>
  clearStickers(points, referencePalette)->Array.map(Null.fromOption)

// A sticker reads as washed out by glare when it is at least 0.04 lighter
// than the clear stickers of its color, and has at most 60% of their chroma
// or a hue 25 degrees off theirs (glare turned greens turquoise).
let glareMinLighter = 0.04
let glareMaxChromaFraction = 0.6
let glareMinHueShift = 25.0
// Glare on this many stickers is worth a warning: evenly lit saved captures
// show at most 3 such stickers, the glare capture 7.
let glareWarningStickers = 4

// The stickers glare washed out, compared within the capture rather than
// against the palette. Shadows are darker and don't count; White can't be
// washed out.
let glareStickers = (points: array<rgb>, labels: array<string>, palette: Dict.t<rgb>) => {
  let clear = clearStickers(points, palette)
  let labs = points->Array.map(rgbToOklab)
  let lab = i => labs->Array.getUnsafe(i)
  palette
  ->Dict.keysToArray
  ->Array.flatMap(color =>
    if color == "W" {
      []
    } else {
      let members =
        labels
        ->Array.mapWithIndex((label, i) => label == color ? Some(i) : None)
        ->Array.filterMap(x => x)
      let anchors = members->Array.filter(i => clear->Array.getUnsafe(i) == Some(color))
      let count = Int.toFloat(Array.length(anchors))
      if Array.length(anchors) < 2 {
        []
      } else {
        let mean = f => anchors->Array.reduce(0.0, (sum, i) => sum +. f(lab(i))) /. count
        let l = mean(lab => lab.l)
        let a = mean(lab => lab.a)
        let b = mean(lab => lab.b)
        members->Array.filter(i => {
          let point = lab(i)
          if clear->Array.getUnsafe(i) == Some(color) || point.l < l +. glareMinLighter {
            false
          } else {
            let chroma = Math.hypot(point.a, point.b)
            let shift =
              Math.abs(Math.atan2(~y=point.b, ~x=point.a) -. Math.atan2(~y=b, ~x=a)) *.
              180.0 /.
              Math.Constants.pi
            chroma <= glareMaxChromaFraction *. Math.hypot(a, b) ||
              Math.min(shift, 360.0 -. shift) >= glareMinHueShift
          }
        })
      }
    }
  )
}

// How far a cluster's center may sit from the stickers finally given its
// color before it counts as having mixed two colors: the saved red/blue
// mixes sat 0.09-0.12 away, every other cluster (glare included) at most
// 0.044.
let mixedClusterDrift = 0.07

// The clusters whose center is far from the mean of the points assigned to
// them - a cluster that took in two colors has its center between them.
let mixedUpClusters = (points: array<rgb>, centroids: array<rgb>, assignment: array<int>) =>
  centroids->Array.flatMapWithIndex((centroid, ci) => {
    let members = points->Array.filterWithIndex((_, pi) => assignment->Array.getUnsafe(pi) == ci)
    Array.length(members) > 0 && clusterDistance(centroid, oklabMean(members)) > mixedClusterDrift
      ? [ci]
      : []
  })

// Learns each of the 6 sticker colors from the capture itself, using all
// captured stickers, and classifies every sticker by balanced assignment
// against those learned colors; the reference palette only names which
// cluster is which color. (A global per-channel gain fitted to fixed
// swatches failed twice: guesses under a strong cast poisoned the fit, and
// sparse colors produced runaway gains.)
let learnStickerColors = (
  samples: array<stickerSample>,
  referencePalette: Dict.t<rgb>,
  clearLabels: array<Nullable.t<string>>,
) => {
  let points = samples->Array.map(sample => sample.rgb)
  let k = 6
  if Array.length(points) < k {
    Null.null
  } else {
    let centroids = kMeansCluster(points, k, 20)
    let canonicalKeys = stickerColors->Dict.keysToArray
    let canonicalList = canonicalKeys->Array.map(key => referencePalette->Dict.getUnsafe(key))
    let permutation = bestPermutationMatch(centroids, canonicalList)
    let nameOf = ci => canonicalKeys->Array.getUnsafe(permutation->Array.getUnsafe(ci))

    // Provisional assignment against the raw centroids, only to count the
    // samples backing each cluster for the shrinkage below.
    let provisional = balancedAssign(points, centroids, unpinned)
    let clusterCounts = Array.make(~length=k, 0)
    provisional->Array.forEach(ci =>
      clusterCounts->Array.setUnsafe(ci, clusterCounts->Array.getUnsafe(ci) + 1)
    )
    let shrunk =
      centroids->Array.mapWithIndex((c, i) =>
        shrinkTowardCanonical(
          c,
          canonicalList->Array.getUnsafe(permutation->Array.getUnsafe(i)),
          clusterCounts->Array.getUnsafe(i),
        )
      )

    // The definitive balanced assignment, against the shrunk centroids.
    // Stickers that clearly show one color keep it; only the rest are
    // balanced.
    let clearLabel = i => clearLabels[i]->Option.flatMap(Nullable.toOption)
    let clusterOf = name => {
      let index = permutation->Array.findIndex(ci => canonicalKeys->Array.getUnsafe(ci) == name)
      index < 0 ? None : Some(index)
    }
    let assignment = balancedAssign(
      points,
      shrunk,
      points->Array.mapWithIndex((_, i) =>
        clearLabel(i)->Option.flatMap(clusterOf)->Nullable.fromOption
      ),
    )

    let colors = Dict.make()
    let clusterSizes = Dict.make()
    for i in 0 to k - 1 {
      colors->Dict.set(nameOf(i), shrunk->Array.getUnsafe(i))
      clusterSizes->Dict.set(nameOf(i), clusterCounts->Array.getUnsafe(i))
    }

    // Leave-one-out distances: a sample's own membership pulls its
    // centroid toward it, so a cluster holding misassigned points would
    // look confident about exactly those. Computed in Oklab.
    let pointsOklab = points->Array.map(rgbToOklab)
    let sums = Array.fromInitializer(~length=k, _ => (ref(0.0), ref(0.0), ref(0.0)))
    assignment->Array.forEachWithIndex((ci, i) => {
      let (l, a, b) = sums->Array.getUnsafe(ci)
      let lab = pointsOklab->Array.getUnsafe(i)
      l := l.contents +. lab.l
      a := a.contents +. lab.a
      b := b.contents +. lab.b
    })
    let leaveOneOutDistances = points->Array.mapWithIndex((point, i) => {
      let ci = assignment->Array.getUnsafe(i)
      let count = clusterCounts->Array.getUnsafe(ci)
      let lab = pointsOklab->Array.getUnsafe(i)
      if count > 1 {
        let (l, a, b) = sums->Array.getUnsafe(ci)
        let others = Int.toFloat(count - 1)
        clusterOklabDistance(
          lab,
          {
            l: (l.contents -. lab.l) /. others,
            a: (a.contents -. lab.a) /. others,
            b: (b.contents -. lab.b) /. others,
          },
        )
      } else {
        // A singleton has no other members: use the ordinary centroid.
        clusterDistance(point, shrunk->Array.getUnsafe(ci))
      }
    })

    Null.make({
      colors,
      clusterSizes,
      labelsBySampleIndex: assignment->Array.map(nameOf),
      leaveOneOutDistances,
      clearLabels: points->Array.mapWithIndex((_, i) => Null.fromOption(clearLabel(i))),
      mixedUpColors: mixedUpClusters(points, centroids, assignment)->Array.map(nameOf),
    })
  }
}

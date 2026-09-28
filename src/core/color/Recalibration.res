// The cross-face color pass after all six faces are measured: learning the
// colors from every sticker and relabeling each sticker against them.
open StickerGeometry
open! ColorMath

type gridOffset = {x: float, y: float, scale: float, angle: float}

type colorDetection = {
  colors: array<array<string>>,
  confidence: float,
  cellConfidences: array<array<float>>,
  cellColors: array<array<rgb>>,
  // Per sticker, the other color it sits close to the boundary with, or
  // null when it's clearly its own color. Only set after this pass.
  cellLookalikes?: array<array<Null.t<string>>>,
  // Where the sampled square sat relative to the capture guide, when it
  // was aligned onto the sticker grid.
  gridOffset?: gridOffset,
  // Width of the outer rows/columns relative to the inner ones.
  outerCellRatio?: float,
  // Odd cubes: the center cell measured past its logo, which its color is
  // classified from; cellColors keeps the plain reading.
  centerColor?: rgb,
}

type location = {face: string, row: int, col: int}

type classified = {
  learned: Null.t<StickerLearning.learnedColors>,
  applied: bool,
  faces: Dict.t<colorDetection>,
  // Stickers glare washed out (see glareStickers).
  glare: array<location>,
}

let confidenceOf = distance => Math.max(0.0, 1.0 -. distance /. confidenceDistanceScale)

// How well `rgb` matches each color, 0-1 on the scale of cellConfidences -
// how plausible each alternative is when fixing a sticker by hand.
let colorConfidences = (rgb, palette: Dict.t<rgb>) =>
  Dict.fromArray(
    palette
    ->Dict.toArray
    ->Array.map(((color, centroid)) => (color, confidenceOf(clusterDistance(rgb, centroid)))),
  )

// How different two palettes are: the mean distance between their
// same-named colors, in the clustering metric.
let paletteDistance = (a: Dict.t<rgb>, b: Dict.t<rgb>) => {
  let keys = a->Dict.keysToArray->Array.filter(key => b->Dict.get(key)->Option.isSome)
  Array.length(keys) == 0
    ? Float.Constants.positiveInfinity
    : keys->Array.reduce(0.0, (sum, key) =>
        sum +. clusterDistance(a->Dict.getUnsafe(key), b->Dict.getUnsafe(key))
      ) /. Int.toFloat(Array.length(keys))
}

// How far from its own learned color toward the nearest other one a
// sticker may sit before it's worth a second look: distance to its own
// color divided by distance to the nearest other (1 is on the boundary).
let lookalikeRatio = 0.6

type nearest = {color: string, ratio: float}

// The nearest learned color other than `label`, and how close `rgb` is to
// the boundary with it.
let nearestOther = (rgb, label, colors: Dict.t<rgb>) =>
  colors
  ->Dict.get(label)
  ->Option.flatMap(own => {
    let ownDistance = clusterDistance(rgb, own)
    colors
    ->Dict.toArray
    ->Array.reduce(None, (best, (color, centroid)) =>
      if color == label {
        best
      } else {
        let distance = clusterDistance(rgb, centroid)
        switch best {
        | Some((_, bestDistance)) if bestDistance <= distance => best
        | _ => Some((color, distance))
        }
      }
    )
    ->Option.map(((color, distance)) => {color, ratio: ownDistance /. Math.max(distance, 1e-9)})
  })

let nearestOtherColor = (rgb, label, colors) => Null.fromOption(nearestOther(rgb, label, colors))

let lookalike = (rgb, label, colors) =>
  switch nearestOther(rgb, label, colors) {
  | Some({color, ratio}) if ratio >= lookalikeRatio => Null.make(color)
  | _ => Null.null
  }

let copyGrid = grid => grid->Array.map(row => Array.copy(row))

// The balanced cross-face assignment on already-measured faces. On 3x3,
// 5x5 and 7x7 the six centers are the six colors, one each, whatever the
// scheme or orientation: the colors are still learned from every sticker,
// but the centers are then assigned as a permutation - each to the learned
// color nearest its centerColor - and only the other stickers are
// balanced, N*N-1 per color. A center misread past its logo was otherwise
// one sticker too many for its color (a blue read 19% "white").
let classifyAcrossFaces = (
  baselineFaces: Dict.t<colorDetection>,
  referencePalette: option<Dict.t<rgb>>,
) => {
  let entries = baselineFaces->Dict.toArray
  let gridSize = entries[0]->Option.mapOr(0, ((_, detection)) => Array.length(detection.colors))
  let middle = Int.toFloat(gridSize - 1) /. 2.0
  let fixedCenters = gridSize >= 3 && mod(gridSize, 2) == 1 && Array.length(entries) == 6
  let samples: array<StickerLearning.stickerSample> = []
  let locations = []
  entries->Array.forEach(((face, detection)) =>
    detection.colors->Array.forEachWithIndex((row, r) =>
      row->Array.forEachWithIndex(
        (colorGuess, c) => {
          samples->Array.push({
            rgb: detection.cellColors->Array.getUnsafe(r)->Array.getUnsafe(c),
            colorGuess,
          })
          locations->Array.push({face, row: r, col: c})
        },
      )
    )
  )
  let points = samples->Array.map(sample => sample.rgb)
  // Pinned only against a real cube's colors (the idealized swatches put
  // real yellows nearer orange), and never where a logo can sit - a blue
  // logo on a 4x4's white center read as a clear blue.
  let logoBand = index => Math.abs(Int.toFloat(index) -. middle) < 1.0
  let clear = switch referencePalette {
  | Some(palette) => StickerLearning.clearStickerColors(points, palette)
  | None => []
  }
  let clearLabels =
    locations->Array.mapWithIndex((location, i) =>
      logoBand(location.row) && logoBand(location.col)
        ? Nullable.null
        : clear[i]->Option.flatMap(Null.toOption)->Nullable.fromOption
    )
  let learned = StickerLearning.learnStickerColors(
    samples,
    referencePalette->Option.getOr(stickerColors),
    clearLabels,
  )
  switch Null.toOption(learned) {
  | None => {learned: Null.null, applied: false, faces: baselineFaces, glare: []}
  | Some(learned) =>
    // Every sticker's color comes from the balanced assignment itself, not
    // a per-cell nearest-centroid lookup that would reopen "one cluster
    // steals another's points".
    let reclassified = Dict.fromArray(
      entries->Array.map(((face, detection)) => {
        let copy = {
          colors: copyGrid(detection.colors),
          cellConfidences: copyGrid(detection.cellConfidences),
          cellColors: detection.cellColors,
          cellLookalikes: detection.colors->Array.map(row => row->Array.map(_ => Null.null)),
          confidence: 0.0,
        }
        let copy = switch detection.centerColor {
        | Some(centerColor) => {...copy, centerColor}
        | None => copy
        }
        let copy = switch detection.outerCellRatio {
        | Some(outerCellRatio) => {...copy, outerCellRatio}
        | None => copy
        }
        (face, copy)
      }),
    )
    let totals = Dict.fromArray(entries->Array.map(((face, _)) => (face, (ref(0.0), ref(0)))))
    let set = (location, color, confidence, lookalikeColor) => {
      let detection = reclassified->Dict.getUnsafe(location.face)
      detection.colors->Array.getUnsafe(location.row)->Array.setUnsafe(location.col, color)
      detection.cellConfidences
      ->Array.getUnsafe(location.row)
      ->Array.setUnsafe(location.col, confidence)
      switch detection.cellLookalikes {
      | Some(lookalikes) =>
        lookalikes->Array.getUnsafe(location.row)->Array.setUnsafe(location.col, lookalikeColor)
      | None => ()
      }
    }
    samples->Array.forEachWithIndex((sample, i) => {
      let location = locations->Array.getUnsafe(i)
      let label = learned.labelsBySampleIndex->Array.getUnsafe(i)
      let confidence = confidenceOf(learned.leaveOneOutDistances->Array.getUnsafe(i))
      set(location, label, confidence, lookalike(sample.rgb, label, learned.colors))
      let (sum, count) = totals->Dict.getUnsafe(location.face)
      sum := sum.contents +. confidence
      count := count.contents + 1
    })

    if fixedCenters {
      let middle = (gridSize - 1) / 2
      let names = learned.colors->Dict.keysToArray
      let centroids = names->Array.map(name => learned.colors->Dict.getUnsafe(name))
      let relabel = (location, color, rgb, distance) => {
        let detection = reclassified->Dict.getUnsafe(location.face)
        let before =
          detection.cellConfidences->Array.getUnsafe(location.row)->Array.getUnsafe(location.col)
        let confidence = confidenceOf(distance)
        set(location, color, confidence, lookalike(rgb, color, learned.colors))
        let (sum, _) = totals->Dict.getUnsafe(location.face)
        sum := sum.contents +. confidence -. before
      }
      // Centers: each color exactly once.
      let evidence =
        entries->Array.map(((_, detection)) =>
          detection.centerColor->Option.getOr(
            detection.cellColors->Array.getUnsafe(middle)->Array.getUnsafe(middle),
          )
        )
      let cost =
        evidence->Array.map(rgb => centroids->Array.map(centroid => clusterDistance(rgb, centroid)))
      let assignment = StickerLearning.hungarianAssignment(cost)
      entries->Array.forEachWithIndex(((face, _), i) => {
        let chosen = assignment->Array.getUnsafe(i)
        relabel(
          {face, row: middle, col: middle},
          names->Array.getUnsafe(chosen),
          evidence->Array.getUnsafe(i),
          cost->Array.getUnsafe(i)->Array.getUnsafe(chosen),
        )
      })
      // Everything else: balanced without the centers. Unchanged labels
      // keep their leave-one-out confidence.
      let others =
        locations
        ->Array.mapWithIndex((location, i) =>
          location.row == middle && location.col == middle ? None : Some(i)
        )
        ->Array.filterMap(x => x)
      let rebalanced = StickerLearning.balancedAssign(
        others->Array.map(i => points->Array.getUnsafe(i)),
        centroids,
        others->Array.map(i =>
          learned.clearLabels
          ->Array.getUnsafe(i)
          ->Null.toOption
          ->Option.map(clear => names->Array.indexOf(clear))
          ->Nullable.fromOption
        ),
      )
      others->Array.forEachWithIndex((i, j) => {
        let chosen = rebalanced->Array.getUnsafe(j)
        let color = names->Array.getUnsafe(chosen)
        if color != learned.labelsBySampleIndex->Array.getUnsafe(i) {
          let rgb = points->Array.getUnsafe(i)
          relabel(
            locations->Array.getUnsafe(i),
            color,
            rgb,
            clusterDistance(rgb, centroids->Array.getUnsafe(chosen)),
          )
        }
      })
    }

    let faces = Dict.fromArray(
      reclassified
      ->Dict.toArray
      ->Array.map(((face, detection)) => {
        let (sum, count) = totals->Dict.getUnsafe(face)
        (
          face,
          {
            ...detection,
            confidence: count.contents > 0 ? sum.contents /. Int.toFloat(count.contents) : 0.0,
          },
        )
      }),
    )
    let labels = locations->Array.map(location =>
      (faces->Dict.getUnsafe(location.face)).colors
      ->Array.getUnsafe(location.row)
      ->Array.getUnsafe(location.col)
    )
    let glare =
      StickerLearning.glareStickers(
        points,
        labels,
        referencePalette->Option.getOr(learned.colors),
      )->Array.map(i => locations->Array.getUnsafe(i))
    {learned: Null.make(learned), applied: true, faces, glare}
  }
}

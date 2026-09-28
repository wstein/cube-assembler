// Reading the colors out of a saved fixture's meta.json, in either format:
//   current - colorsURFDLB / detectedURFDLB, one WRG facelets string each;
//   earlier - per face, faces.u.colors / faces.u.detected as row arrays
//             (fixtures saved before 97efa6d, e.g. by an older checkout).
// Both are keyed by capture slot U..B (the photos' capture order).
let slots = ["u", "r", "f", "d", "l", "b"]
let validColors = ["W", "Y", "O", "R", "G", "B"]

type grids = Dict.t<array<array<string>>>

type fixtureColors = {
  // The human-verified colors per slot, keyed U..B.
  colors: grids,
  // What detection produced before hand corrections, if recorded.
  detected: Null.t<grids>,
}

let gridOf = (value: Untrusted.t, n: float): option<array<array<string>>> =>
  value
  ->Untrusted.array
  ->Option.filter(rows => Int.toFloat(Array.length(rows)) == n)
  ->Option.flatMap(rows => {
    let parsed = rows->Array.map(row =>
      row
      ->Untrusted.array
      ->Option.filter(cells => Int.toFloat(Array.length(cells)) == n)
      ->Option.flatMap(
        cells => {
          let colors = cells->Array.map(Untrusted.string)
          colors->Array.every(
            color => color->Option.mapOr(false, c => validColors->Array.includes(c)),
          )
            ? Some(colors->Array.filterMap(c => c))
            : None
        },
      )
    )
    parsed->Array.every(Option.isSome) ? Some(parsed->Array.filterMap(row => row)) : None
  })

// Per-face grids from the earlier format, or None unless all 6 are there.
let perFace = (faces: option<Untrusted.t>, key, n) => {
  let found = slots->Array.map(slot =>
    faces
    ->Option.flatMap(faces => faces->Untrusted.field(slot))
    ->Option.flatMap(face => face->Untrusted.field(key))
    ->Option.flatMap(grid => gridOf(grid, n))
  )
  found->Array.every(Option.isSome)
    ? Some(
        Dict.fromArray(
          slots->Array.mapWithIndex((slot, i) => (
            slot->String.toUpperCase,
            found->Array.getUnsafe(i)->Option.getOrThrow,
          )),
        ),
      )
    : None
}

let fromString = (value: option<Untrusted.t>, n) =>
  value
  ->Option.flatMap(Untrusted.string)
  ->Option.flatMap(text => NotationOutput.wrgFaceletsToGrids(text)->Null.toOption)
  ->Option.filter(grids =>
    grids->Dict.get("U")->Option.mapOr(false, grid => Int.toFloat(Array.length(grid)) == n)
  )

// Null when the meta has neither format (or colors of the wrong size).
let readFixtureColors = meta => {
  let meta = Untrusted.fromAny(meta)
  switch meta->Untrusted.field("gridSize")->Option.flatMap(Untrusted.number) {
  | None => Null.null
  | Some(n) =>
    let faces = meta->Untrusted.field("faces")
    let orPerFace = (found, key) =>
      switch found {
      | Some(grids) => Some(grids)
      | None => perFace(faces, key, n)
      }
    switch orPerFace(fromString(meta->Untrusted.field("colorsURFDLB"), n), "colors") {
    | None => Null.null
    | Some(colors) =>
      Null.make({
        colors,
        detected: orPerFace(
          fromString(meta->Untrusted.field("detectedURFDLB"), n),
          "detected",
        )->Null.fromOption,
      })
    }
  }
}

open CubeTypes

// Photo positions in a guided capture: 0-3 the sides, 4-5 top/bottom.
@tag("kind")
type guidedCenterIssue =
  | @as("same-center") SameCenter({photos: (int, int)})
  | @as("turned-twice") TurnedTwice({photo: int})
  | @as("not-opposite") NotOpposite({photos: (int, int)})

let photoAt = (photos: array<option<grid>>, i) => photos[i]->Option.flatMap(photo => photo)
let centerOf = (photo: grid, mid) => photo[mid]->Option.flatMap(row => row[mid])

// Odd sizes only: the centers alone show several capture mistakes before
// any search - two photos of the same face, a side turned 180° instead of
// 90° (it shows the face opposite the one before it), or two photos that
// should face away from each other but don't. Empty when all is well, and
// always empty on even sizes (no fixed centers) or for missing photos.
let checkGuidedCenters = (photos: array<option<grid>>) => {
  switch photos->Array.findMap(photo => photo)->Option.map(Array.length) {
  | Some(n) if mod(n, 2) == 1 =>
    let mid = n / 2
    let center = photos->Array.map(photo => photo->Option.flatMap(p => centerOf(p, mid)))
    let at = i => center[i]->Option.flatMap(c => c)
    let same = []
    center->Array.forEachWithIndex((ci, i) =>
      for j in 0 to i - 1 {
        if ci->Option.isSome && ci == at(j) {
          same->Array.push(SameCenter({photos: (j, i)}))
        }
      }
    )
    if Array.length(same) > 0 {
      same
    } else {
      let opposite = (a, b) =>
        switch (a, b) {
        | (Some(a), Some(b)) => GuidedCaptureSetup.opposite(a) == Some(b)
        | _ => false
        }
      let turnedTwice =
        [1, 2, 3]
        ->Array.filter(i => opposite(at(i - 1), at(i)))
        ->Array.map(photo => TurnedTwice({photo: photo}))
      let notOpposite =
        [(0, 2), (1, 3), (4, 5)]
        ->Array.filter(((a, b)) =>
          at(a)->Option.isSome && at(b)->Option.isSome && !opposite(at(a), at(b))
        )
        ->Array.map(pair => NotOpposite({photos: pair}))
      [...turnedTwice, ...notOpposite]
    }
  | _ => []
  }
}

// The same face, allowing misreads: at least 75% of stickers identical at
// some turn. A 2x2 must match exactly - with 4 stickers, 3 alike happens
// between different scrambled faces too often. Two genuinely different
// faces of a well-scrambled cube never come close (the most alike seen in
// simulation: 6/9 on 3x3, 9/16 on 4x4, 18/49 on 7x7).
let sameFaceFraction = 0.75

let matchingStickers = (a: grid, b: grid) =>
  a->Array.reduceWithIndex(0, (count, row, r) =>
    row->Array.reduceWithIndex(count, (count, color, c) =>
      color == b->Array.getUnsafe(r)->Array.getUnsafe(c) ? count + 1 : count
    )
  )

let sameFaceAtSomeRotation = (a: grid, b: grid) => {
  let n = Array.length(a)
  Array.length(b) == n && {
      let needed = n == 2 ? 4 : Math.ceil(Int.toFloat(n * n) *. sameFaceFraction)->Float.toInt
      [0, 1, 2, 3]->Array.some(turns =>
        matchingStickers(a, CubeGeometry.rotateGrid(b, turns)) >= needed
      )
    }
}

type faceMatchSample = {colors: grid}

// Identify a face already saved in a different slot by its stickers (see
// sameFaceAtSomeRotation). A matching center alone is not enough: centers
// get misread, and a false match would keep a new face from being taken.
let findCapturedFaceMatch = (
  captures: array<option<faceMatchSample>>,
  candidate: faceMatchSample,
  excludeIndex,
) => {
  let n = Array.length(candidate.colors)
  captures
  ->Array.findIndexWithIndex((saved, i) =>
    switch saved {
    | Some(saved) =>
      i != excludeIndex &&
      Array.length(saved.colors) == n &&
      sameFaceAtSomeRotation(saved.colors, candidate.colors)
    | None => false
    }
  )
  ->(index => index < 0 ? Null.null : Null.make(index))
}

// An approval net is in cube orientation, whereas Check colors is in photo
// order. Find the photo behind a net face even when it was rotated in
// assembly: the fewest differing stickers at any turn, earliest first.
let findCaptureSlotForOrientedFace = (captures: array<option<grid>>, face: grid) => {
  let n = Array.length(face)
  let best = ref(None)
  let bestDistance = ref(Int.Constants.maxValue)
  captures->Array.forEachWithIndex((saved, i) =>
    switch saved {
    | Some(saved) if Array.length(saved) == n =>
      for turn in 0 to 3 {
        let distance = n * n - matchingStickers(CubeGeometry.rotateGrid(saved, turn), face)
        if distance < bestDistance.contents {
          bestDistance := distance
          best := Some(i)
        }
      }
    | _ => ()
    }
  )
  Null.fromOption(best.contents)
}

let findRepeatedFaces = (photos: array<option<grid>>) => {
  let repeats = []
  photos->Array.forEachWithIndex((a, i) =>
    switch a {
    | Some(a) =>
      for j in 0 to i - 1 {
        switch photoAt(photos, j) {
        | Some(b) if sameFaceAtSomeRotation(a, b) => repeats->Array.push((j, i))
        | _ => ()
        }
      }
    | None => ()
    }
  )
  repeats
}

let validColors = ["W", "Y", "O", "R", "G", "B"]

let validateFaceColors = (colors: grid, size) =>
  Array.length(colors) == size &&
    colors->Array.every(row =>
      Array.length(row) == size && row->Array.every(color => validColors->Array.includes(color))
    )

let createSolvedCube = (size): CubeState.cubeState => {
  let face = color => Array.make(~length=size * size, color)
  {u: face("W"), r: face("R"), f: face("G"), d: face("Y"), l: face("O"), b: face("B")}
}

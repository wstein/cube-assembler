// Guided capture: the 4 side faces are photographed in order while the cube
// is turned a quarter turn at a time around its vertical axis (either way,
// top row kept on top), then the top and bottom faces in either order and
// at any rotation. That leaves 2 turning directions x 2 top/bottom orders x
// 4 x 4 top/bottom rotations = 64 arrangements to check, instead of
// solveFaceOrientations' 4,096 (odd) or 122,880 (even) - and no assumption
// about which colors are on the sides or on top.
open CubeTypes

let oppositeColor = Dict.fromArray([
  ("W", "Y"),
  ("Y", "W"),
  ("R", "O"),
  ("O", "R"),
  ("G", "B"),
  ("B", "G"),
])
let opposite = color => oppositeColor->Dict.get(color)

type vector = (int, int, int)

let colorNormals: array<(string, vector)> = [
  ("W", (0, 1, 0)),
  ("Y", (0, -1, 0)),
  ("R", (1, 0, 0)),
  ("O", (-1, 0, 0)),
  ("G", (0, 0, 1)),
  ("B", (0, 0, -1)),
]
let normalOf = color =>
  colorNormals->Array.find(((c, _)) => c == color)->Option.map(((_, normal)) => normal)
let colorOf = normal =>
  colorNormals->Array.find(((_, n)) => n == normal)->Option.map(((color, _)) => color)

let cross = ((a0, a1, a2): vector, (b0, b1, b2): vector): vector => (
  a1 * b2 - a2 * b1,
  a2 * b0 - a0 * b2,
  a0 * b1 - a1 * b0,
)

let isOddSize = n => n == 3 || n == 5 || n == 7

// The sticker in the middle of a photo, if it has one there.
let centerOf = (photo: grid, mid) => photo[mid]->Option.flatMap(row => row[mid])

let photoAt = (photos: array<option<grid>>, i) => photos[i]->Option.flatMap(photo => photo)

let pairs = [(0, 2), (1, 3), (4, 5)]

// Capture slots 1/3, 2/4 and 5/6 are suggested opposite pairs. One
// measured center predicts its opposite. Two centers on different axes
// determine the remaining colors for the preferred clockwise path; the
// actual captures and final orientation solver may follow another path.
// Even cubes have no fixed center sticker, so their slots stay unfilled.
let predict = (photos: array<option<grid>>) => {
  let predictions = Array.make(~length=6, None)
  let n = photos->Array.findMap(photo => photo)->Option.map(Array.length)
  switch n {
  | Some(n) if isOddSize(n) =>
    let mid = n / 2
    let centers = Array.fromInitializer(~length=6, i =>
      photoAt(photos, i)->Option.flatMap(photo =>
        Array.length(photo) == n ? centerOf(photo, mid) : None
      )
    )
    let center = i => centers->Array.getUnsafe(i)
    let consistent = ref(true)
    pairs->Array.forEach(((front, back)) =>
      if consistent.contents {
        switch (center(front), center(back)) {
        | (Some(a), None) =>
          opposite(a)->Option.forEach(color => predictions->Array.setUnsafe(back, Some(color)))
        | (None, Some(b)) =>
          opposite(b)->Option.forEach(color => predictions->Array.setUnsafe(front, Some(color)))
        | (Some(a), Some(b)) if opposite(a) != Some(b) => consistent := false
        | _ => ()
        }
      }
    )
    // Positive normals correspond to Side 1 (front), Side 2 (right), Top.
    let axes = pairs->Array.map(((positive, negative)) => {
      let color = switch center(positive) {
      | Some(color) => Some(color)
      | None => center(negative)->Option.flatMap(opposite)
      }
      color->Option.flatMap(normalOf)
    })
    let known = axes->Array.filter(Option.isSome)->Array.length
    if consistent.contents && known >= 2 {
      let (front, right, top) = (
        axes->Array.getUnsafe(0),
        axes->Array.getUnsafe(1),
        axes->Array.getUnsafe(2),
      )
      let completeWith = (axis, a, b) =>
        switch (axis, a, b) {
        | (Some(axis), _, _) => Some(axis)
        | (None, Some(a), Some(b)) => Some(cross(a, b))
        | _ => None
        }
      let colors =
        [
          completeWith(front, right, top),
          completeWith(right, top, front),
          completeWith(top, front, right),
        ]->Array.map(normal => normal->Option.flatMap(colorOf))
      if colors->Array.every(Option.isSome) {
        // Axis by axis, stopping at the first measured center that
        // disagrees; the axes before it keep their predictions.
        let agrees = ref(true)
        pairs->Array.forEachWithIndex(((positive, negative), axis) =>
          if agrees.contents {
            let color = colors->Array.getUnsafe(axis)->Option.getOrThrow
            let positiveOk = center(positive)->Option.mapOr(true, c => c == color)
            let negativeOk = center(negative)->Option.mapOr(true, c => Some(c) == opposite(color))
            if !positiveOk || !negativeOk {
              agrees := false
            } else {
              if center(positive)->Option.isNone {
                predictions->Array.setUnsafe(positive, Some(color))
              }
              if center(negative)->Option.isNone {
                predictions->Array.setUnsafe(negative, opposite(color))
              }
            }
          }
        )
      }
    }
    predictions
  | _ => predictions
  }
}

let toNull = predictions => predictions->Array.map(Null.fromOption)

let predictGuidedCenters = photos => toNull(predict(photos))

// The first and adjacent second photos define capture slots. If the second
// photo is opposite the first, it occupies slot 3 and slot 2 stays open.
// Once the first two adjacent centers are known, reserve a stable slot
// for each remaining center so later photos can arrive in any order.
let centerSlots = (photos: array<option<grid>>) => {
  let none = Array.make(~length=6, None)
  switch (photoAt(photos, 0), photoAt(photos, 1)) {
  | (Some(first), Some(second)) =>
    let n = Array.length(first)
    if !isOddSize(n) || Array.length(second) != n {
      none
    } else {
      let mid = n / 2
      switch (centerOf(first, mid), centerOf(second, mid)) {
      | (Some(a), Some(b)) if opposite(a)->Option.isSome && opposite(b)->Option.isSome && a != b =>
        if opposite(a) == Some(b) {
          let remaining =
            oppositeColor->Dict.keysToArray->Array.filter(color => color != a && color != b)
          [Some(a), Some(b), ...remaining->Array.map(color => Some(color))]
        } else {
          let suggested = predict([Some(first), Some(second)])
          [Some(a), Some(b), ...suggested->Array.slice(~start=2)]
        }
      | _ => none
      }
    }
  | _ => predict(photos)
  }
}

let captureCenterSlots = photos => toNull(centerSlots(photos))

// An occupied slot is an explicit retake. Otherwise, an opposite second
// odd-size face goes to slot 3; the next adjacent face fills slot 2.
// Later odd-size faces follow their center color.
// A center already present in another slot is a duplicate, not a new face.
let slotForCenter = (photos: array<option<grid>>, requestedIndex, candidate: grid) => {
  let n = Array.length(candidate)
  let mid = n / 2
  switch (photoAt(photos, requestedIndex), photoAt(photos, 0), photoAt(photos, 1)) {
  | (Some(_), _, _) => Some(requestedIndex)
  | (None, None, _) => Some(0)
  | (None, Some(first), None) =>
    if isOddSize(n) && Array.length(first) == n {
      switch (centerOf(first, mid), centerOf(candidate, mid)) {
      | (Some(a), Some(c)) if a == c => None
      | (Some(a), Some(c)) if opposite(a) == Some(c) =>
        photoAt(photos, 2)->Option.isSome ? None : Some(2)
      | _ => Some(1)
      }
    } else {
      Some(1)
    }
  | (None, Some(_), Some(_)) =>
    if !isOddSize(n) {
      Some(requestedIndex)
    } else {
      let center = centerOf(candidate, mid)
      let index =
        centerSlots(photos)->Array.findIndex(slot => slot == center && center->Option.isSome)
      index < 0 || photoAt(photos, index)->Option.isSome ? None : Some(index)
    }
  }
}

let captureSlotForCenter = (photos, requestedIndex, candidate) =>
  Null.fromOption(slotForCenter(photos, requestedIndex, candidate))

type placement = {index: int, unexpectedCenter: bool}

// The center color only suggests a slot, it never rejects a face: one that
// fits no free slot (a misread center, or a face shown twice) stays in the
// slot being captured, flagged so assembly searches any order.
let placeCapturedFace = (photos, requestedIndex, candidate) =>
  switch slotForCenter(photos, requestedIndex, candidate) {
  | Some(index) => {index, unexpectedCenter: false}
  | None => {index: requestedIndex, unexpectedCenter: true}
  }

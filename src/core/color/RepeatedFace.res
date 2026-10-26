// A face photographed twice. The raw sticker colors of two shots of one face
// agree within noise, while two different faces never come close; only odd
// cubes can tell them apart this way, because an even cube has no centers
// and its faces may look alike on purpose (a 2x2 pattern cube does).
open StickerGeometry

// Measured on saved captures: a repeated shot sat at 21, the closest pair
// of different faces on an odd cube at 69.
let repeatLimit = 40.0

let distance = (a: rgb, b: rgb) =>
  Math.sqrt((a.r -. b.r) ** 2.0 +. (a.g -. b.g) ** 2.0 +. (a.b -. b.b) ** 2.0)

// Where cell (r, c) of `face` lands once it is turned a quarter `turns` times.
let turnedCell = (face: array<array<rgb>>, turns, r, c) => {
  let last = Array.length(face) - 1
  let (row, col) = switch mod(turns, 4) {
  | 0 => (r, c)
  | 1 => (last - c, r)
  | 2 => (last - r, last - c)
  | _ => (c, last - r)
  }
  face->Array.getUnsafe(row)->Array.getUnsafe(col)
}

// Mean color distance between the stickers of two faces, the smallest of
// the four ways one can be turned onto the other.
let faceDistance = (a: array<array<rgb>>, b: array<array<rgb>>) => {
  let n = Array.length(a)
  let cells = Int.toFloat(n * n)
  [0, 1, 2, 3]->Array.reduce(Float.Constants.positiveInfinity, (best, turns) => {
    let total = ref(0.0)
    a->Array.forEachWithIndex((row, r) =>
      row->Array.forEachWithIndex(
        (color, c) => total := total.contents +. distance(color, turnedCell(b, turns, r, c)),
      )
    )
    Math.min(best, total.contents /. cells)
  })
}

// The pairs of slots whose faces are the same shot twice; empty unless the
// cube is odd (see above).
let findRepeatShots = (faces: array<option<array<array<rgb>>>>) => {
  let repeats = []
  faces->Array.forEachWithIndex((face, i) =>
    switch face {
    | Some(face) if mod(Array.length(face), 2) == 1 && Array.length(face) >= 3 =>
      for j in 0 to i - 1 {
        switch faces->Array.getUnsafe(j) {
        | Some(other) if Array.length(other) == Array.length(face) =>
          if faceDistance(face, other) < repeatLimit {
            repeats->Array.push((j, i))
          }
        | _ => ()
        }
      }
    | _ => ()
    }
  )
  repeats
}

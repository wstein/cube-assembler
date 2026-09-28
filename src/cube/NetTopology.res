// What the cube net needs beyond the colors: which stickers belong to one
// physical piece, and which captured photo (and sticker in it) each net
// face shows. Faces use the URFDLB facelet layout parity.ts reads: U seen
// from above with B at the top, D from below with F at the top, B from
// behind; every face row-major.

// Sticker `index` of `face` as cubie coordinates: x from L to R, y from D
// to U, z from B to F, each 0..n-1.
let faceletPosition = (n, face, index) => {
  let r = index / n
  let c = mod(index, n)
  let last = n - 1
  switch face {
  | "u" => (c, last, r)
  | "d" => (c, 0, last - r)
  | "f" => (c, last - r, last)
  | "b" => (last - c, last - r, 0)
  | "r" => (last, last - r, last - c)
  | "l" => (0, last - r, c)
  | _ => JsError.throwWithMessage(`Unknown face ${face}`)
  }
}

// The same key for every sticker of one physical piece: a corner's three,
// an edge's or wing's two, a center's one.
let pieceKey = (n, face, index) => {
  let (x, y, z) = faceletPosition(n, face, index)
  `${Int.toString(x)},${Int.toString(y)},${Int.toString(z)}`
}

// Turns `grid` clockwise: new[r][c] = old[n-1-c][r].
let turned = (grid: array<array<'a>>, turns) => {
  let out = ref(grid)
  for _ in 1 to mod(mod(turns, 4) + 4, 4) {
    let source = out.contents
    let n = Array.length(source)
    out :=
      source->Array.mapWithIndex((row, r) =>
        row->Array.mapWithIndex((_, c) => source->Array.getUnsafe(n - 1 - c)->Array.getUnsafe(r))
      )
  }
  out.contents
}

// The photo sticker shown at `index` of a net face that is its photo turned
// `turns` quarter turns clockwise.
let sourceIndex = (n, turns, index) => {
  let indices = Array.fromInitializer(~length=n, r =>
    Array.fromInitializer(~length=n, c => r * n + c)
  )
  turned(indices, turns)->Array.getUnsafe(index / n)->Array.getUnsafe(mod(index, n))
}

type faceSource = {slot: string, turns: int}

// For each net face, the captured photo (slot) and clockwise turns whose
// colors it shows exactly - each photo used once. Null for a face no unused
// photo matches (typed or edited colors, say).
let faceSources = (
  netFaces: Dict.t<array<array<string>>>,
  captured: Dict.t<array<array<string>>>,
) => {
  let used = Set.make()
  let key = grid => grid->Array.map(row => row->Array.join(""))->Array.join("/")
  let result = Dict.make()
  netFaces->Dict.forEachWithKey((grid, face) => {
    let target = key(grid)
    let found =
      captured
      ->Dict.toArray
      ->Array.findMap(((slot, photo)) =>
        if used->Set.has(slot) || Array.length(photo) != Array.length(grid) {
          None
        } else {
          [0, 1, 2, 3]
          ->Array.find(turns => key(turned(photo, turns)) == target)
          ->Option.map(turns => {slot, turns})
        }
      )
    switch found {
    | Some(source) =>
      used->Set.add(source.slot)
      result->Dict.set(face, Null.make(source))
    | None => result->Dict.set(face, Null.null)
    }
  })
  result
}

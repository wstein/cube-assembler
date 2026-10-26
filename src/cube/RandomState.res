// A random cube state built from its pieces, the way speed cubers' random
// state scrambles are: every corner, edge, wing and center goes to a random
// place, with only the orientations and parities a real cube can have, so
// the result is always a valid cube. The seed makes it repeatable.
//
// - Corners: any permutation, twists summing to 0 mod 3.
// - Odd cubes: the middle edges (a 3x3's edges) take any permutation of the
//   parity of the corners' and flips summing to 0 mod 2; the centers stay.
// - Even cubes: the down-back-left corner stays, which fixes the cube's
//   orientation as nothing else does; the other corners move freely.
// - Wings (4x4 and up): each orbit of 24 wings takes any permutation; a wing
//   has no orientation of its own, its mirror twin is another wing.
// - Centers (4x4 and up): each orbit of 24 takes any arrangement of its
//   colors, four of each.
open CubeState

type rng = {mutable state: int}

let nextUnsigned = rng => {
  let x = rng.state
  let x = Int.bitwiseXor(x, Int.shiftLeft(x, 13))
  let x = Int.bitwiseXor(x, Int.shiftRightUnsigned(x, 17))
  let x = Int.bitwiseXor(x, Int.shiftLeft(x, 5))
  rng.state = x
  // The 32 bits as an unsigned number.
  let signed = Int.toFloat(x)
  signed < 0.0 ? signed +. 4294967296.0 : signed
}

let makeRng = seed => {
  let rng = {state: Int.bitwiseOr(Int.bitwiseXor(seed, 0x2545F491), 1)}
  // Small seeds start xorshift in a rut; run it out.
  for _ in 1 to 16 {
    nextUnsigned(rng)->ignore
  }
  rng
}

// An integer from 0 to k - 1.
let below = (rng, k) => Float.toInt(Math.floor(nextUnsigned(rng) /. 4294967296.0 *. Int.toFloat(k)))

let shuffle = (rng, items) => {
  let out = items->Array.slice(~start=0, ~end=Array.length(items))
  for i in Array.length(out) - 1 downto 1 {
    let j = below(rng, i + 1)
    let held = out->Array.getUnsafe(i)
    out->Array.setUnsafe(i, out->Array.getUnsafe(j))
    out->Array.setUnsafe(j, held)
  }
  out
}

let range = count => Array.fromInitializer(~length=count, i => i)

let faceArray = (cube: cubeState, face: faceKey) =>
  switch face {
  | U => cube.u
  | R => cube.r
  | F => cube.f
  | D => cube.d
  | L => cube.l
  | B => cube.b
  }

let setSticker = (cube, face, index, color) => faceArray(cube, face)->Array.setUnsafe(index, color)

// Twists for `count` corners summing to 0 mod 3: all random but the last.
let twists = (rng, count) => {
  let values = Array.fromInitializer(~length=count, _ => below(rng, 3))
  let others = values->Array.slice(~start=0, ~end=count - 1)
  values->Array.setUnsafe(count - 1, mod(3 - mod(CubePieces.sum(others), 3), 3))
  values
}

// Writes the corner `piece` in `slot` with the given twist: its colors in
// the reading order CubePieces.identifyCorner takes back.
let placeCorner = (cube, n, slot, piece, twist) => {
  let (s0, s1, s2) = CubePieces.solvedCorners->Array.getUnsafe(piece)
  let (a, b, c) = switch twist {
  | 0 => (s0, s1, s2)
  | 1 => (s2, s0, s1)
  | _ => (s1, s2, s0)
  }
  let colors = [a, b, c]
  CubePieces.cornerSlots
  ->Array.getUnsafe(slot)
  ->Array.forEachWithIndex(((face, corner), i) =>
    setSticker(cube, face, CubePieces.cornerFaceletIndex(n, corner), colors->Array.getUnsafe(i))
  )
}

let placeCorners = (cube, n, rng, ~keepLast) => {
  // Even cubes keep the down-back-left corner (6) in place and untwisted.
  let fixed = keepLast ? [6] : []
  let free = range(8)->Array.filter(i => !(fixed->Array.includes(i)))
  let pieces = shuffle(rng, free)
  let freeTwists = twists(rng, Array.length(free))
  free->Array.forEachWithIndex((slot, i) =>
    placeCorner(cube, n, slot, pieces->Array.getUnsafe(i), freeTwists->Array.getUnsafe(i))
  )
  fixed->Array.forEach(slot => placeCorner(cube, n, slot, slot, 0))
  // The pieces by slot, for the edges' parity.
  range(8)->Array.map(slot =>
    switch free->Array.findIndexOpt(s => s == slot) {
    | Some(i) => pieces->Array.getUnsafe(i)
    | None => slot
    }
  )
}

// Writes colors (a on the edge's first face, b on its second) at depth
// `depth` of edge `edge`.
let placeEdgeColors = (cube, n, edge, depth, (a, b)) => {
  let ((faceA, lineA, reverseA), (faceB, lineB, reverseB)) =
    CubePieces.edgeLines->Array.getUnsafe(edge)
  setSticker(cube, faceA, CubePieces.edgeLineFaceletIndex(n, lineA, reverseA, depth), a)
  setSticker(cube, faceB, CubePieces.edgeLineFaceletIndex(n, lineB, reverseB, depth), b)
}

// The middle edges of an odd cube.
let placeMiddleEdges = (cube, n, rng, cornerPieces, wing) => {
  let pieces = shuffle(rng, range(12))

  // Same parity as the corners: swap two pieces when it differs.
  if CubePieces.permParity(pieces) != CubePieces.permParity(cornerPieces) {
    let held = pieces->Array.getUnsafe(0)
    pieces->Array.setUnsafe(0, pieces->Array.getUnsafe(1))
    pieces->Array.setUnsafe(1, held)
  }
  let flips = Array.fromInitializer(~length=12, _ => below(rng, 2))
  let others = flips->Array.slice(~start=0, ~end=11)
  flips->Array.setUnsafe(11, mod(CubePieces.sum(others), 2))
  pieces->Array.forEachWithIndex((piece, slot) => {
    let (s0, s1) = CubePieces.solvedEdges->Array.getUnsafe(piece)
    let colors = flips->Array.getUnsafe(slot) == 0 ? (s0, s1) : (s1, s0)
    placeEdgeColors(cube, n, slot, wing, colors)
  })
}

// One orbit of wings at depths w and n-1-w: slot (edge * 2 + far) takes a
// random one of the 24 wings. The wing's reading is the one
// CubePieces.identifyWing turns back into it.
let placeWings = (cube, n, rng, w) => {
  let wings = shuffle(rng, range(24))
  wings->Array.forEachWithIndex((id, slot) => {
    let edge = slot / 2
    let far = mod(slot, 2) == 1
    let (s0, s1) = CubePieces.solvedEdges->Array.getUnsafe(id / 2)
    let straight = (s0, s1)
    let colors = switch CubePieces.identifyWing(straight, ~edge, ~far) {
    | Some(found) if found == id => straight
    | _ => (s1, s0)
    }
    placeEdgeColors(cube, n, edge, far ? n - 1 - w : w, colors)
  })
}

// The orbits of the center cells under the cube's 24 rotations, found by
// following a labeled cube through two quarter turns.
let centerOrbits = n => {
  let key = (face, index) => `${face}${Int.toString(index)}`
  let labeled = Dict.make()
  ["U", "R", "F", "D", "L", "B"]->Array.forEach(face =>
    labeled->Dict.set(
      face,
      Array.fromInitializer(~length=n, r =>
        Array.fromInitializer(~length=n, c => key(face, r * n + c))
      ),
    )
  )
  let parent = Dict.make()
  let rec find = x =>
    switch parent->Dict.get(x) {
    | Some(p) if p != x => {
        let root = find(p)
        parent->Dict.set(x, root)
        root
      }
    | _ => x
    }
  let union = (a, b) => parent->Dict.set(find(a), find(b))
  [CubeGeometry.X, CubeGeometry.Y]->Array.forEach(axis => {
    let turned = CubeGeometry.rotateCube(labeled, axis, 1)
    ["U", "R", "F", "D", "L", "B"]->Array.forEach(face => {
      let grid = CubeGeometry.faceGrid(turned, face)
      grid->Array.forEachWithIndex(
        (row, r) => row->Array.forEachWithIndex((label, c) => union(label, key(face, r * n + c))),
      )
    })
  })
  let middle = mod(n, 2) == 1 ? Some(n / 2) : None
  let orbits = Dict.make()
  ["U", "R", "F", "D", "L", "B"]->Array.forEach(face =>
    for r in 1 to n - 2 {
      for c in 1 to n - 2 {
        if middle != Some(r) || middle != Some(c) {
          let root = find(key(face, r * n + c))
          let known = orbits->Dict.get(root)->Option.getOr([])
          orbits->Dict.set(root, Array.concat(known, [(face, r * n + c)]))
        }
      }
    }
  )
  orbits->Dict.valuesToArray
}

let faceOfName = name =>
  switch name {
  | "U" => U
  | "R" => R
  | "F" => F
  | "D" => D
  | "L" => L
  | _ => B
  }

let placeCenters = (cube, n, rng) =>
  centerOrbits(n)->Array.forEach(orbit => {
    // Every face's color as often as the orbit has cells on that face.
    let colors = orbit->Array.map(((face, _)) => CubePieces.solvedColor(faceOfName(face)))
    let mixed = shuffle(rng, colors)
    orbit->Array.forEachWithIndex(((face, index), i) =>
      setSticker(cube, faceOfName(face), index, mixed->Array.getUnsafe(i))
    )
  })

let solvedState = n => {
  let face = f => Array.make(~length=n * n, CubePieces.solvedColor(f))
  {u: face(U), r: face(R), f: face(F), d: face(D), l: face(L), b: face(B)}
}

let randomCube = (size, seed) => {
  if size < 2 {
    JsError.throwWithMessage(`A cube has at least 2 layers, not ${Int.toString(size)}`)
  }
  let rng = makeRng(seed)
  let cube = solvedState(size)
  let odd = mod(size, 2) == 1
  let cornerPieces = placeCorners(cube, size, rng, ~keepLast=!odd)
  if size >= 3 {
    if odd {
      placeMiddleEdges(cube, size, rng, cornerPieces, size / 2)
    }
    for w in 1 to (size - 2) / 2 {
      if size >= 4 {
        placeWings(cube, size, rng, w)
      }
    }
  }
  if size >= 4 {
    placeCenters(cube, size, rng)
  }
  cube
}

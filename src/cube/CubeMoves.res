open CubeState

type faces = CubeGeometry.faces

// Face grids from a cube state's six row-major facelet arrays, and back.
let cubeStateToFaces = (cube: cubeState, n) => {
  let grid = facelets =>
    Array.fromInitializer(~length=n, row =>
      facelets->Array.slice(~start=row * n, ~end=(row + 1) * n)
    )
  Dict.fromArray([
    ("U", grid(cube.u)),
    ("R", grid(cube.r)),
    ("F", grid(cube.f)),
    ("D", grid(cube.d)),
    ("L", grid(cube.l)),
    ("B", grid(cube.b)),
  ])
}

let facesToCubeState = (faces: faces): cubeState => {
  let flat = key => CubeGeometry.faceGrid(faces, key)->Array.flat
  {u: flat("U"), r: flat("R"), f: flat("F"), d: flat("D"), l: flat("L"), b: flat("B")}
}

let turnAxis = (face: faceKey): CubeGeometry.axis =>
  switch face {
  | R | L => X
  | U | D => Y
  | F | B => Z
  }

let positive = (face: faceKey) =>
  switch face {
  | R | U | F => true
  | L | D | B => false
  }

let applyCubeMove = (cube, n, face, quarterTurns) =>
  cube->cubeStateToFaces(n)->CubeGeometry.turnFace(face, quarterTurns, 1)->facesToCubeState

// Turns `width` layers ending `depth` layers in from `face`. Turning through
// to the far side takes the whole cube, since turnFace leaves the opposite
// face's stickers in place.
let applyCubeLayerMove = (cube, n, face, depth, quarterTurns, width) => {
  let outer = depth - width + 1
  if outer < 1 || depth > n {
    cube
  } else if depth == 1 {
    applyCubeMove(cube, n, face, quarterTurns)
  } else {
    let faces = cubeStateToFaces(cube, n)
    let through =
      depth == n
        ? CubeGeometry.rotateCube(
            faces,
            turnAxis(face),
            positive(face) ? quarterTurns : -quarterTurns,
          )
        : CubeGeometry.turnFace(faces, face, quarterTurns, depth)
    facesToCubeState(
      outer > 1 ? CubeGeometry.turnFace(through, face, -quarterTurns, outer - 1) : through,
    )
  }
}

type cubeTurn = {
  face: faceKey,
  // The innermost layer turned, counted from `face`.
  depth: int,
  // How many layers turn together, ending at `depth`; 1 when omitted.
  width?: int,
  turns: int,
}

// What a turn moves, which decides how it is written.
type layers =
  | Slice(int)
  | Block({outer: int, inner: int})
  | WholeCube

let layersOf = (turn: cubeTurn, size) => {
  let width = turn.width->Option.getOr(1)
  if width >= size {
    WholeCube
  } else if width == 1 {
    Slice(turn.depth)
  } else {
    Block({outer: turn.depth - width + 1, inner: turn.depth})
  }
}

let faceLetter = (face: faceKey) =>
  switch face {
  | U => "U"
  | R => "R"
  | F => "F"
  | D => "D"
  | L => "L"
  | B => "B"
  }

let axisLetter = (axis: CubeGeometry.axis) =>
  switch axis {
  | X => "x"
  | Y => "y"
  | Z => "z"
  }

// Standard notation: 2R for one inner slice, Rw or 3Rw for a block from the
// face, 2-3Rw for an inner block, and x, y, z for the whole cube.
let formatCubeTurn = (turn: cubeTurn, size) => {
  let half = Math.Int.abs(turn.turns) == 2
  let amount = half ? "2" : turn.turns < 0 ? "'" : ""
  let letter = faceLetter(turn.face)
  switch layersOf(turn, size) {
  | WholeCube =>
    let reversed = !positive(turn.face) && !half
    axisLetter(turnAxis(turn.face)) ++ (reversed ? turn.turns < 0 ? "" : "'" : amount)
  | Slice(depth) => (depth > 1 ? Int.toString(depth) : "") ++ letter ++ amount
  | Block({outer, inner}) =>
    let range =
      outer > 1
        ? `${Int.toString(outer)}-${Int.toString(inner)}`
        : inner > 2
        ? Int.toString(inner)
        : ""
    range ++ letter ++ "w" ++ amount
  }
}

let quarterOf = turns => mod(mod(turns, 4) + 4, 4)

// Adds a finished turn to the history as its shortest form, accumulating
// consecutive turns on the same layers (R R -> R2, R2 R -> R', R R' -> none).
let recordTurn = (moves: array<cubeTurn>, turn: cubeTurn) => {
  let quarter = quarterOf(turn.turns)
  if quarter == 0 {
    moves
  } else {
    let turns = quarter == 3 ? -1 : quarter
    let width = turn.width->Option.getOr(1)
    let move = turns =>
      width > 1
        ? {face: turn.face, depth: turn.depth, width, turns}
        : {face: turn.face, depth: turn.depth, turns}
    let count = Array.length(moves)
    switch moves[count - 1] {
    | Some(last)
      if last.face == turn.face &&
      last.depth == turn.depth &&
      last.width->Option.getOr(1) == width =>
      let net = quarterOf(last.turns + turns)
      let earlier = moves->Array.slice(~start=0, ~end=count - 1)
      net == 0 ? earlier : [...earlier, move(net == 3 ? -1 : net)]
    | _ => [...moves, move(turns)]
    }
  }
}

type scrambleLength = | @as("short") Short | @as("normal") Normal | @as("long") Long

type scrambleOptions = {length?: scrambleLength, innerLayers?: bool}

let scrambleFaces: array<faceKey> = [U, D, L, R, F, B]
let scrambleLengths = [11, 20, 40, 60, 80, 100]

let scrambleScale = length =>
  switch length {
  | Short => 0.5
  | Normal => 1.0
  | Long => 1.5
  }

// A random scramble for the cube size: no two turns in a row about the same
// axis, inner layers up to the middle (odd cubes keep the exact middle
// slice fixed), and a first inner turn on 4x4 and larger. `random` returns
// numbers in [0, 1).
let generateScrambleMoves = (size, options: scrambleOptions, random: unit => float) => {
  let base = scrambleLengths[size - 2]->Option.getOr(20)
  let scale = scrambleScale(options.length->Option.getOr(Normal))
  let length = Math.round(Int.toFloat(base) *. scale)->Float.toInt
  let maxDepth = options.innerLayers->Option.getOr(true) ? size / 2 : 1
  let pick = count => Math.floor(random() *. Int.toFloat(count))->Float.toInt
  let lastAxis = ref(None)
  Array.fromInitializer(~length, i => {
    let allowed = scrambleFaces->Array.filter(face => Some(turnAxis(face)) != lastAxis.contents)
    let face = allowed->Array.getUnsafe(pick(Array.length(allowed)))
    lastAxis := Some(turnAxis(face))
    let turns = [1, -1, 2]->Array.getUnsafe(pick(3))
    let depth = i == 0 && maxDepth >= 2 ? 2 : 1 + pick(maxDepth)
    {face, depth, turns}
  })
}

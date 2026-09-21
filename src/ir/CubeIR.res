/* CubeIR.res
 * Core Intermediate Representation for NxNxN Rubik's Cubes (2x2 to 7x7).
 *
 * Design: Self-contained, fully typed, no JS dependencies.
 * Bridges to cubing.js via IRBridge.res at the boundary.
 */

/* ─── Puzzle Size ─────────────────────────────────────────────────────────── */

type puzzleSize =
  | TwoByTwo
  | ThreeByThree
  | FourByFour
  | FiveByFive
  | SixBySix
  | SevenBySeven

let puzzleSizeN = (size: puzzleSize): int =>
  switch size {
  | TwoByTwo => 2
  | ThreeByThree => 3
  | FourByFour => 4
  | FiveByFive => 5
  | SixBySix => 6
  | SevenBySeven => 7
  }

let puzzleSizeName = (size: puzzleSize): string =>
  switch size {
  | TwoByTwo => "2x2x2"
  | ThreeByThree => "3x3x3"
  | FourByFour => "4x4x4"
  | FiveByFive => "5x5x5"
  | SixBySix => "6x6x6"
  | SevenBySeven => "7x7x7"
  }

let puzzleSizeFromN = (n: int): option<puzzleSize> =>
  switch n {
  | 2 => Some(TwoByTwo)
  | 3 => Some(ThreeByThree)
  | 4 => Some(FourByFour)
  | 5 => Some(FiveByFive)
  | 6 => Some(SixBySix)
  | 7 => Some(SevenBySeven)
  | _ => None
  }

/* ─── Facelet Color ───────────────────────────────────────────────────────── */

/** Standard WCA face colors: White Up, Orange Left, Green Front,
    Red Right, Blue Back, Yellow Down. */
type faceletColor = W | O | G | R | B | Y

let colorToChar = (c: faceletColor): string =>
  switch c {
  | W => "W"
  | O => "O"
  | G => "G"
  | R => "R"
  | B => "B"
  | Y => "Y"
  }

let colorFromChar = (s: string): option<faceletColor> =>
  switch s {
  | "W" => Some(W)
  | "O" => Some(O)
  | "G" => Some(G)
  | "R" => Some(R)
  | "B" => Some(B)
  | "Y" => Some(Y)
  | _ => None
  }

let allColors: array<faceletColor> = [W, O, G, R, B, Y]

/* ─── Face Grid ───────────────────────────────────────────────────────────── */

/** An NxN face grid stored in row-major order (top-left = index 0).
    Invariant: Array.length(data) == size * size */
type faceGrid = {
  n: int, // side length (2..7)
  data: array<faceletColor>,
}

let makeSolidFace = (~n: int, color: faceletColor): faceGrid => {
  { n, data: Array.make(n * n, color) }
}

let faceGet = (face: faceGrid, row: int, col: int): faceletColor =>
  face.data[row * face.n + col]

let faceSet = (face: faceGrid, row: int, col: int, color: faceletColor): unit =>
  face.data[row * face.n + col] = color

/** Rotate a face grid 90° clockwise, k times (k mod 4).
    Corrected formula: dst[c][N-1-r] = src[r][c]  →  dstIdx = c*N + (N-1-r) */
let rotateFace = (grid: faceGrid, rotations: int): faceGrid => {
  let k = mod(rotations, 4)
  if k == 0 {
    // Return a copy to avoid aliasing
    { n: grid.n, data: Array.copy(grid.data) }
  } else {
    let n = grid.n
    let current = ref(grid.data)
    for _ in 1 to k {
      let next = Array.make(n * n, W)
      for r in 0 to n - 1 {
        for c in 0 to n - 1 {
          // 90° CW: new[c][N-1-r] = old[r][c]
          let srcIdx = r * n + c
          let dstIdx = c * n + (n - 1 - r)
          next[dstIdx] = current.contents[srcIdx]
        }
      }
      current := next
    }
    { n: grid.n, data: current.contents }
  }
}

/* ─── Cube Face Positions ─────────────────────────────────────────────────── */

/** Standard WCA face position identifiers (URFDLB order). */
type facePos = U | R | F | D | L | B

let facePosName = (fp: facePos): string =>
  switch fp {
  | U => "U"
  | R => "R"
  | F => "F"
  | D => "D"
  | L => "L"
  | B => "B"
  }

let allFacePositions: array<facePos> = [U, R, F, D, L, B]

/* ─── Cube IR ─────────────────────────────────────────────────────────────── */

/** The canonical cube state: 6 face grids in URFDLB order. */
type cubeIR = {
  size: puzzleSize,
  u: faceGrid,
  r: faceGrid,
  f: faceGrid,
  d: faceGrid,
  l: faceGrid,
  b: faceGrid,
}

/** Standard WCA color assignment for solved state:
    U=White, R=Red, F=Green, D=Yellow, L=Orange, B=Blue */
let makeIdentity = (size: puzzleSize): cubeIR => {
  let n = puzzleSizeN(size)
  {
    size,
    u: makeSolidFace(~n, W),
    r: makeSolidFace(~n, R),
    f: makeSolidFace(~n, G),
    d: makeSolidFace(~n, Y),
    l: makeSolidFace(~n, O),
    b: makeSolidFace(~n, B),
  }
}

/** Get a face grid by its position identifier. */
let getFace = (cube: cubeIR, pos: facePos): faceGrid =>
  switch pos {
  | U => cube.u
  | R => cube.r
  | F => cube.f
  | D => cube.d
  | L => cube.l
  | B => cube.b
  }

/** Reconstruct a cube with one face replaced. */
let setFace = (cube: cubeIR, pos: facePos, face: faceGrid): cubeIR =>
  switch pos {
  | U => { ...cube, u: face }
  | R => { ...cube, r: face }
  | F => { ...cube, f: face }
  | D => { ...cube, d: face }
  | L => { ...cube, l: face }
  | B => { ...cube, b: face }
  }

/** Build a cubeIR from an array of 6 face grids in URFDLB order. */
let fromFaceArray = (size: puzzleSize, faces: array<faceGrid>): option<cubeIR> => {
  if Array.length(faces) != 6 {
    None
  } else {
    Some({
      size,
      u: faces[0],
      r: faces[1],
      f: faces[2],
      d: faces[3],
      l: faces[4],
      b: faces[5],
    })
  }
}

/** Export all 6 faces as an array in URFDLB order. */
let toFaceArray = (cube: cubeIR): array<faceGrid> =>
  [cube.u, cube.r, cube.f, cube.d, cube.l, cube.b]

/** Apply an in-place face rotation to a cube (returns a new cubeIR). */
let rotateCubeFace = (cube: cubeIR, pos: facePos, rotations: int): cubeIR => {
  let face = getFace(cube, pos)
  let rotated = rotateFace(face, rotations)
  setFace(cube, pos, rotated)
}

/* ─── Equality ────────────────────────────────────────────────────────────── */

let faceGridEq = (a: faceGrid, b: faceGrid): bool => {
  a.n == b.n && {
    let eq = ref(true)
    let len = a.n * a.n
    for i in 0 to len - 1 {
      if a.data[i] != b.data[i] {
        eq := false
      }
    }
    eq.contents
  }
}

let cubeIREq = (a: cubeIR, b: cubeIR): bool =>
  a.size == b.size &&
  faceGridEq(a.u, b.u) &&
  faceGridEq(a.r, b.r) &&
  faceGridEq(a.f, b.f) &&
  faceGridEq(a.d, b.d) &&
  faceGridEq(a.l, b.l) &&
  faceGridEq(a.b, b.b)

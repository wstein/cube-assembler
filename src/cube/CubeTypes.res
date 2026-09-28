// Types shared by the orientation solvers, guided capture and the wizard.
type grid = array<array<string>>

// One value per face, as plain objects keyed U, R, F, D, L, B.
type faceSet<'a> = {
  @as("U") u: 'a,
  @as("R") r: 'a,
  @as("F") f: 'a,
  @as("D") d: 'a,
  @as("L") l: 'a,
  @as("B") b: 'a,
}

let faceValue = (set: faceSet<'a>, face: CubeState.faceKey) =>
  switch face {
  | U => set.u
  | R => set.r
  | F => set.f
  | D => set.d
  | L => set.l
  | B => set.b
  }

let faceKeys: array<CubeState.faceKey> = [U, R, F, D, L, B]

// Whole-cube geometry works on dictionaries of the same six faces; every
// one it returns has all six keys.
let fromGeometry = (faces: CubeGeometry.faces): faceSet<grid> => Obj.magic(faces)
let toGeometry = (faces: faceSet<grid>): CubeGeometry.faces => Obj.magic(faces)

type orientedCandidate = {
  faces: faceSet<grid>,
  rotations: faceSet<int>,
}

type orientationSolution = {
  faces: faceSet<grid>,
  rotations: faceSet<int>,
  // Out of 8.
  cornerScore: int,
  // Out of 12; NaN on a 2x2, which has no edge pieces.
  edgeScore: float,
  // Distinct pieces, orientation sums and matching permutation parity.
  fullyValid: bool,
  // Every distinct candidate tied for the best score, the first one being
  // `faces`/`rotations`; capped, with `truncated` set when more existed.
  alternatives: array<orientedCandidate>,
  truncated: bool,
}

// The 4 side photos in capture order, each upright, then the top and
// bottom photos in either order and at any rotation.
type guidedCapture = {
  sides: array<Nullable.t<grid>>,
  caps: array<Nullable.t<grid>>,
}

type turnDirection = | @as("left") Left | @as("right") Right

// How the photos were put together for one arrangement: which way the cube
// was turned between side photos ('left' brings the right-hand face to the
// front), whether the second cap photo is the top, and the quarter turns
// clockwise applied to cap photos 1 and 2.
type guidedArrangement = {
  turn: turnDirection,
  capsSwapped: bool,
  capRotations: (int, int),
}

type guidedSolution = {
  ...orientationSolution,
  // Parallel to `alternatives`.
  arrangements: array<guidedArrangement>,
}

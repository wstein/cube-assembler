@genType type grid = array<array<string>>

@genType
type faceSet<'a> = {
  @as("U") u: 'a,
  @as("R") r: 'a,
  @as("F") f: 'a,
  @as("D") d: 'a,
  @as("L") l: 'a,
  @as("B") b: 'a,
}

let faceValue: (faceSet<'a>, CubeState.faceKey) => 'a
let faceKeys: array<CubeState.faceKey>
let fromGeometry: CubeGeometry.faces => faceSet<grid>
let toGeometry: faceSet<grid> => CubeGeometry.faces

@genType
type orientedCandidate = {
  faces: faceSet<grid>,
  rotations: faceSet<int>,
}

@genType
type orientationSolution = {
  faces: faceSet<grid>,
  rotations: faceSet<int>,
  cornerScore: int,
  edgeScore: float,
  fullyValid: bool,
  alternatives: array<orientedCandidate>,
  truncated: bool,
}

@genType
type guidedCapture = {
  sides: array<Nullable.t<grid>>,
  caps: array<Nullable.t<grid>>,
}

@genType
type turnDirection = | @as("left") Left | @as("right") Right

@genType
type guidedArrangement = {
  turn: turnDirection,
  capsSwapped: bool,
  capRotations: (int, int),
}

@genType
type guidedSolution = {
  ...orientationSolution,
  arrangements: array<guidedArrangement>,
}

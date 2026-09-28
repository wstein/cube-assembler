@genType
type cubeState = {
  u: array<string>,
  r: array<string>,
  f: array<string>,
  d: array<string>,
  l: array<string>,
  b: array<string>,
}

type faceGrid = {n: int, data: array<string>}

@genType
type cubeIR = {
  size: int,
  u: faceGrid,
  r: faceGrid,
  f: faceGrid,
  d: faceGrid,
  l: faceGrid,
  b: faceGrid,
}

@genType
type faceKey =
  | @as("U") U
  | @as("R") R
  | @as("F") F
  | @as("D") D
  | @as("L") L
  | @as("B") B

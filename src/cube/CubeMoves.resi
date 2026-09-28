type faces = CubeGeometry.faces

@genType let cubeStateToFaces: (CubeState.cubeState, int) => faces
@genType let facesToCubeState: faces => CubeState.cubeState
@genType
let applyCubeMove: (CubeState.cubeState, int, CubeState.faceKey, int) => CubeState.cubeState
@genType
let applyCubeLayerMove: (
  CubeState.cubeState,
  int,
  CubeState.faceKey,
  int,
  int,
  int,
) => CubeState.cubeState

@genType
type cubeTurn = {
  face: CubeState.faceKey,
  depth: int,
  width?: int,
  turns: int,
}

@genType let formatCubeTurn: (cubeTurn, int) => string
@genType let recordTurn: (array<cubeTurn>, cubeTurn) => array<cubeTurn>

@genType
type scrambleLength = | @as("short") Short | @as("normal") Normal | @as("long") Long

@genType
type scrambleOptions = {length?: scrambleLength, innerLayers?: bool}

@genType
let generateScrambleMoves: (int, scrambleOptions, unit => float) => array<cubeTurn>

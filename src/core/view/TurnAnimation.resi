@genType
type queuedTurn = {
  face: CubeState.faceKey,
  depth?: int,
  width?: int,
  turns: int,
  from?: float,
  speed?: float,
  duration?: float,
  undo?: bool,
}

@genType
type activeTurn = {
  face: CubeState.faceKey,
  depth?: int,
  width?: int,
  turns: int,
  from?: float,
  speed?: float,
  startTime: float,
  duration: float,
  overshoot: bool,
  undo?: bool,
}

@genType let startTurn: (queuedTurn, float, bool, float) => activeTurn

@genType type frame = {angle: float, finished: bool}
@genType let turnFrame: (activeTurn, float) => frame

@genType type turned = {cube: CubeState.cubeState, moves: array<CubeMoves.cubeTurn>}
@genType
let finishTurn: (CubeState.cubeState, int, array<CubeMoves.cubeTurn>, activeTurn) => Null.t<turned>
@genType let settleTurn: (CubeGesture.swipeLayer, float, int, float, float) => queuedTurn
@genType let scrambleQueue: (array<CubeMoves.cubeTurn>, float) => array<queuedTurn>
@genType let dragMeshKey: (CubeGesture.swipeLayer, float, bool) => string

@genType let clampPitch: float => float
@genType type viewTurn = {yaw: float, pitch: float, yawVelocity: float, pitchVelocity: float}
@genType let viewTurn: (float, float, float) => viewTurn
@genType let isInitialCube: (CubeState.cubeState, CubeState.cubeState) => bool

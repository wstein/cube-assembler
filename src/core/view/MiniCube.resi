@genType let miniZoom: float
@genType let miniTurnScale: float
@genType let miniCamera: (float, float, float, float) => CubeGesture.camera

@genType type miniFace = {face: CubeState.faceKey, points: array<(float, float)>}
@genType let miniCubeFaces: CubeGesture.camera => array<miniFace>

@genType type axisName = | @as("x") X | @as("y") Y | @as("z") Z

@genType
type miniAxis = {
  name: axisName,
  face: CubeState.faceKey,
  center: (float, float),
  tip: (float, float),
  label: (float, float),
  front: bool,
}

@genType let miniCubeAxes: CubeGesture.camera => array<miniAxis>
@genType let miniCubeFaceColors: (CubeState.cubeState, int) => Dict.t<string>

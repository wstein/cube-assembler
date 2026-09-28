@genType let gizmoCamera: (float, float, float, float) => CubeGesture.camera

@genType type axisName = | @as("x") X | @as("y") Y | @as("z") Z

@genType
type gizmoAxis = {
  name: axisName,
  face: CubeState.faceKey,
  center: (float, float),
  tip: (float, float),
  label: (float, float),
  front: bool,
}

@genType let gizmoAxes: CubeGesture.camera => array<gizmoAxis>
@genType let gizmoFaceColors: (CubeState.cubeState, int) => Dict.t<string>

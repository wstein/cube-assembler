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
@genType type colorFrame = {u: string, r: string, f: string, d: string, l: string, b: string}
@genType let initialColorFrame: (CubeState.cubeState, int) => colorFrame
@genType let advanceColorFrame: (colorFrame, int, CubeState.faceKey, int, int, int) => colorFrame

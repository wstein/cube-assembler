@genType
type outline = {
  normal: (float, float, float),
  edgeStart: float,
  neighbors: array<CubeState.faceKey>,
}
@genType let faceHighlight: (Null.t<CubeState.faceKey>, int) => outline

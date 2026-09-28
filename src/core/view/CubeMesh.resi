@genType
type turningLayer = {
  face: CubeState.faceKey,
  depth?: int,
  width?: int,
  angle: float,
  highlight?: bool,
}

type indices

type meshData = {
  positions: Float32Array.t,
  normals: Float32Array.t,
  colors: Float32Array.t,
  occlusion: Float32Array.t,
  indices: indices,
  vertexCount: int,
  indexCount: int,
}

@genType
let buildCubeMesh: (
  CubeState.cubeState,
  int,
  Dict.t<string>,
  bool,
  option<turningLayer>,
) => meshData

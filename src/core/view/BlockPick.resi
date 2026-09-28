@genType type point = (float, float)

@genType type block = {axis: int, from: int, to: int, anchor: point}

@genType @tag("kind")
type step =
  | @as("none") NoStep
  | @as("turn") Turn({layer: CubeGesture.swipeLayer, from: point, hit: CubeGesture.surfaceHit})
  | @as("pick") Pick({block: block, layer: CubeGesture.swipeLayer})

@genType
let pickBlockStep: (
  Nullable.t<block>,
  CubeGesture.surfaceHit,
  point,
  point,
  point,
  CubeGesture.camera,
  float,
  int,
) => step

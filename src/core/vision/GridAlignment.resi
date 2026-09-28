@genType type faceSquare = {x: float, y: float, size: float}

@genType
type gridAlignment = {
  x: float,
  y: float,
  size: float,
  score: float,
  aligned: bool,
  seams: bool,
  needsRecentering?: bool,
  outer: float,
  angle: float,
  center: (float, float),
}

@genType type corner = (float, float)

@genType let estimateTilt: (Uint8ClampedArray.t, int, int, faceSquare) => float
@genType let cellEdges: (int, float) => array<float>
@genType let alignmentMaxOffset: float
@genType let defaultScaleRange: (float, float)
@genType
let findGridAlignment: (
  Uint8ClampedArray.t,
  int,
  int,
  faceSquare,
  int,
  float,
  (float, float),
) => gridAlignment
@genType let alignFace: (Uint8ClampedArray.t, int, int, faceSquare, int) => gridAlignment
@genType let estimateOuterCellRatio: (Uint8ClampedArray.t, int, int, int) => float
@genType
let estimateFaceCorners: (
  Uint8ClampedArray.t,
  int,
  int,
  gridAlignment,
  int,
) => Null.t<array<corner>>
@genType let cornersConsistent: (array<corner>, float) => bool
@genType
let acceptFaceCorners: (Uint8ClampedArray.t, int, int, gridAlignment, array<corner>, int) => bool
@genType
let faceCornersIfBetter: (
  Uint8ClampedArray.t,
  int,
  int,
  gridAlignment,
  int,
) => Null.t<array<corner>>

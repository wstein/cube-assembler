@genType type vec = (float, float, float)

@genType
type camera = {
  width: float,
  height: float,
  zoom: float,
  pitch: float,
  yaw: float,
  size: float,
}

@genType type surfaceHit = {face: CubeState.faceKey, point: vec, normalAxis: int}

@genType let pickCubeSurface: (float, float, camera) => Null.t<surfaceHit>
@genType let viewPoint: (vec, camera) => vec
@genType let screenPoint: (vec, camera) => (float, float)

@genType
type swipeLayer = {
  face: CubeState.faceKey,
  depth: int,
  width?: int,
  axis: int,
  sign: int,
}

@genType let swipeStartPx: float
@genType let pickSwipeLayer: (surfaceHit, float, float, camera, float) => Null.t<swipeLayer>
@genType let swipeLayerAngle: (surfaceHit, swipeLayer, float, float, camera) => float

@genType
type pressLevel =
  | @as("layer") Layer
  | @as("wide") Wide

@genType type pressKeys = {shiftKey: bool}
@genType let pressLevel: pressKeys => pressLevel

@genType let blockLayer: (int, int, int, int) => swipeLayer
@genType let wholeCubeLayer: (int, int) => swipeLayer
@genType let standardWideLayer: (swipeLayer, int) => swipeLayer
@genType let onSeam: (surfaceHit, swipeLayer, camera) => bool
@genType let seamWideLayer: (surfaceHit, swipeLayer, float, float, camera) => Null.t<swipeLayer>
@genType let seamChoice: (surfaceHit, swipeLayer, float, float, camera) => swipeLayer

@genType let turnCommitFraction: float
@genType let flickMs: float
@genType type swipeTuning = {startPx: float, commitFraction: float, flickMs: float}
@genType let defaultSwipeTuning: swipeTuning
@genType let releasedQuarterTurns: (float, float, float, float) => float
@genType type release = {turns: float, speed: float}
@genType
let releaseDrag: (float, float, float, float, bool, swipeTuning) => release
@genType type dragMotion = {angle: float, velocity: float, time: float}
@genType let followDrag: (dragMotion, float, float) => dragMotion
@genType
type startKind = | @as("wait") Wait | @as("nothing") StartsNothing | @as("turn") StartsTurn
@genType
type swipeStart = {kind: startKind, layer: Null.t<swipeLayer>, seam: bool, wide: bool}
@genType
let swipeStart: (surfaceHit, float, float, camera, float, pressLevel) => swipeStart

@genType
type cubeGesture =
  | @as("pending") Pending
  | @as("turn") Turn
  | @as("camera") Camera
  | @as("two-finger") TwoFinger
  | @as("none") NoGesture

@genType
let gestureForPointerDown: (
  string,
  int,
  Nullable.t<surfaceHit>,
  Nullable.t<cubeGesture>,
) => cubeGesture
@genType let gestureWhenSwipeTurnsNothing: string => cubeGesture
@genType let gestureAfterPointerUp: (int, Nullable.t<cubeGesture>) => Null.t<cubeGesture>

@genType type screenPoint = (float, float)
@genType type motion = {dx: float, dy: float, scale: float}
@genType
let twoFingerMotion: ((screenPoint, screenPoint), (screenPoint, screenPoint)) => motion

@genType
type twoFingerLock =
  | @as("undecided") Undecided
  | @as("tilt") TiltLock
  | @as("pinch") Pinch

@genType let twoFingerLock: (float, float, float, twoFingerLock) => twoFingerLock
@genType let clampZoom: (float, float) => float

@genType type wheel = {deltaX: float, deltaY: float, deltaMode: int, ctrlKey: bool}

@genType
type wheelGesture =
  | @as("zoom") Zoom
  | @as("tilt") WheelTilt

@genType let wheelGesture: wheel => wheelGesture

@genType let wheelSwipeGapMs: float
@genType
type wheelSwipe = {
  startTime: float,
  lastTime: float,
  dx: float,
  dy: float,
  lastMagnitude: float,
  shrinking: int,
  coasting: bool,
}
@genType let nextWheelSwipe: (Null.t<wheelSwipe>, float, float, float) => wheelSwipe

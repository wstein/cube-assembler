@genType let autoCaptureStableFrames: int
@genType let autoCaptureMinConfidence: float
@genType let turnCueClearFrames: int

@genType
type turnCuePose = {centerX: float, centerY: float, size: float, angle: float}

@genType let turnPoseChanged: (turnCuePose, turnCuePose) => bool
@genType let turnCueAbsentFrames: int

@genType
type turnCueState = {departed: int, missing: int}

@genType let turnCueStart: turnCueState
@genType
let nextTurnCue: (
  turnCueState,
  Nullable.t<array<array<string>>>,
  array<array<string>>,
  bool,
) => turnCueState
@genType let turnCueCleared: turnCueState => bool

@genType
type autoCaptureSample = {
  colors: array<array<string>>,
  confidence: float,
  centerX: float,
  centerY: float,
  size: float,
  angle: float,
}

@genType
type autoCaptureProgress = {first: autoCaptureSample, frames: int}

@genType
let nextAutoCaptureProgress: (
  Nullable.t<autoCaptureProgress>,
  Nullable.t<autoCaptureSample>,
) => Null.t<autoCaptureProgress>

@genType let autoCaptureStableFrames: int
@genType let autoCaptureMinConfidence: float
@genType let turnCueCooldownMs: float
@genType let autoCaptureHeld: (Nullable.t<float>, float) => bool

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

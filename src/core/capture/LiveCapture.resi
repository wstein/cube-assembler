@genType
type frameState = {
  progress: Null.t<AutoCapture.autoCaptureProgress>,
  hold: LiveHold.liveHold<Recalibration.colorDetection>,
}

@genType let startState: unit => frameState

@genType
type frame = {
  bounds: FaceSampling.faceBounds,
  detection: Recalibration.colorDetection,
  visible: bool,
  backgroundFound: bool,
  colorProfileId: Nullable.t<string>,
}

@genType
type context = {
  detectFace: bool,
  autoCapture: bool,
  captureBusy: bool,
  stableFrames: int,
  turnCueShowing: bool,
  autoCaptureHeld: bool,
  provisionalProfileId: Nullable.t<string>,
}

@genType
type view = {
  detection: Recalibration.colorDetection,
  visible: bool,
}

@genType type autoCaptureView = {frames: int, paused: bool}

@genType
type step = {
  state: frameState,
  needsRecentering: bool,
  medianWhiteBalance: bool,
  autoColorProfileId: Null.t<string>,
  view: Null.t<view>,
  autoCaptureView: Null.t<autoCaptureView>,
  capture: bool,
}

@genType let liveFrameStep: (frameState, frame, context) => step

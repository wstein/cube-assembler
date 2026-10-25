// One analyzed live frame's effect on the capture dialog: holding a
// confirmed face through a weak frame and counting stable frames for auto
// capture. Colors are never compared with earlier captures.
// The hook keeps the worker, timers, canvas and callbacks and applies each
// step.
type detection = Recalibration.colorDetection

// What carries over from frame to frame while the dialog stays open.
type frameState = {
  progress: Null.t<AutoCapture.autoCaptureProgress>,
  hold: LiveHold.liveHold<detection>,
}

let startState = () => {
  progress: Null.null,
  hold: LiveHold.noHold(),
}

// The frame's analysis, with its bounds in the camera frame's pixels.
type frame = {
  bounds: FaceSampling.faceBounds,
  detection: detection,
  visible: bool,
  backgroundFound: bool,
  colorProfileId: Nullable.t<string>,
}

type context = {
  // Detect face; false for Guide grid, which shows every frame as is.
  detectFace: bool,
  autoCapture: bool,
  // A capture from an earlier frame is still being processed.
  captureBusy: bool,
  stableFrames: int,
  turnCueShowing: bool,
  // Just captured: auto capture waits for the cube to be turned.
  autoCaptureHeld: bool,
  provisionalProfileId: Nullable.t<string>,
}

// What to show for the frame.
type view = {
  detection: detection,
  visible: bool,
}

type autoCaptureView = {frames: int, paused: bool}

type step = {
  state: frameState,
  needsRecentering: bool,
  medianWhiteBalance: bool,
  autoColorProfileId: Null.t<string>,
  view: Null.t<view>,
  autoCaptureView: Null.t<autoCaptureView>,
  // Take the photo from this frame.
  capture: bool,
}

type pose = {centerX: float, centerY: float, size: float, angle: float}

let poseOf = (bounds: FaceSampling.faceBounds): pose => {
  centerX: bounds.startX +. bounds.faceWidth /. 2.0,
  centerY: bounds.startY +. bounds.faceHeight /. 2.0,
  size: bounds.faceWidth,
  angle: bounds.angle->Option.getOr(0.0),
}

let liveFrameStep = (state: frameState, frame: frame, context: context) => {
  let {bounds, detection, visible} = frame
  let gridFound = bounds.gridFound == Some(true)
  let base = {
    state,
    needsRecentering: bounds.needsRecentering == Some(true),
    medianWhiteBalance: frame.backgroundFound,
    autoColorProfileId: switch Nullable.toOption(frame.colorProfileId) {
    | Some(id) => Null.make(id)
    | None => context.provisionalProfileId->Nullable.toOption->Null.fromOption
    },
    view: Null.null,
    autoCaptureView: Null.null,
    capture: false,
  }
  if context.turnCueShowing {
    base
  } else {
    let shown = context.detectFace
      ? LiveHold.holdConfirmedFace(state.hold, detection, visible)
      : {hold: state.hold, show: detection, visible}
    let step = {
      ...base,
      state: {...state, hold: shown.hold},
      view: Null.make({detection: shown.show, visible: shown.visible}),
    }
    if (
      context.detectFace && context.autoCapture && !context.captureBusy && !context.autoCaptureHeld
    ) {
      let counted =
        visible && gridFound && detection.confidence >= AutoCapture.autoCaptureMinConfidence
      let pose = poseOf(bounds)
      let progress = AutoCapture.nextAutoCaptureProgress(
        state.progress->Null.toOption->Nullable.fromOption,
        counted
          ? Nullable.make({
              AutoCapture.colors: detection.colors,
              confidence: detection.confidence,
              centerX: pose.centerX,
              centerY: pose.centerY,
              size: pose.size,
              angle: pose.angle,
            })
          : Nullable.null,
      )
      let frames = progress->Null.toOption->Option.mapOr(0, progress => progress.frames)
      let hasProgress = progress->Null.toOption->Option.isSome
      let capture = counted && hasProgress && frames >= context.stableFrames
      {
        ...step,
        state: {...step.state, progress: capture ? Null.null : progress},
        autoCaptureView: Null.make({frames, paused: !counted && hasProgress}),
        capture,
      }
    } else {
      step
    }
  }
}

// One analyzed live frame's effect on the capture dialog: the turn cue
// after a capture, holding a confirmed face through a weak frame, matching
// an already captured face, and counting stable frames for auto capture.
// The hook keeps the worker, timers, canvas and callbacks and applies each
// step.
type detection = Recalibration.colorDetection
type grid = array<array<string>>

// What carries over from frame to frame while the dialog stays open.
type frameState = {
  progress: Null.t<AutoCapture.autoCaptureProgress>,
  hold: LiveHold.liveHold<detection>,
  turnCue: AutoCapture.turnCueState,
}

let startState = () => {
  progress: Null.null,
  hold: LiveHold.noHold(),
  turnCue: AutoCapture.turnCueStart,
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
  provisionalProfileId: Nullable.t<string>,
  // The last camera capture, which the cube must turn away from first.
  lastCapturedColors: Nullable.t<grid>,
  lastCapturedPose: Nullable.t<AutoCapture.turnCuePose>,
  // Each capture slot's colors, in capture order, and the slot asked for.
  capturedColors: array<Nullable.t<grid>>,
  faceIndex: int,
}

// What to show for the frame.
type view = {
  detection: detection,
  visible: bool,
  // The capture slot the face already sits in, if any.
  matchedSlot: Null.t<int>,
}

type autoCaptureView = {frames: int, paused: bool}

type step = {
  state: frameState,
  needsRecentering: bool,
  medianWhiteBalance: bool,
  autoColorProfileId: Null.t<string>,
  // The cube turned away from the last capture: forget it.
  turnCueCleared: bool,
  view: Null.t<view>,
  autoCaptureView: Null.t<autoCaptureView>,
  // Take the photo from this frame.
  capture: bool,
}

let confident = 0.8

let poseOf = (bounds: FaceSampling.faceBounds): AutoCapture.turnCuePose => {
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
    turnCueCleared: false,
    view: Null.null,
    autoCaptureView: Null.null,
    capture: false,
  }
  switch Nullable.toOption(context.lastCapturedColors) {
  | Some(lastColors) =>
    let turnCue = AutoCapture.nextTurnCue(
      state.turnCue,
      visible && gridFound && detection.confidence >= confident
        ? Nullable.make(detection.colors)
        : Nullable.null,
      lastColors,
      switch Nullable.toOption(context.lastCapturedPose) {
      | Some(pose) if visible && gridFound => AutoCapture.turnPoseChanged(pose, poseOf(bounds))
      | _ => false
      },
    )
    {
      ...base,
      state: {...state, turnCue},
      turnCueCleared: AutoCapture.turnCueCleared(turnCue),
    }
  | None if context.turnCueShowing => base
  | None =>
    let shown = context.detectFace
      ? LiveHold.holdConfirmedFace(state.hold, detection, visible)
      : {hold: state.hold, show: detection, visible}
    let matchedSlot =
      context.detectFace && visible && detection.confidence >= confident
        ? CapturedFaceMatching.findCapturedFaceMatch(
            context.capturedColors->Array.map(colors =>
              colors->Nullable.toOption->Option.map(colors => {CapturedFaceMatching.colors: colors})
            ),
            {colors: detection.colors},
            context.faceIndex,
          )
        : Null.null
    let step = {
      ...base,
      state: {...state, hold: shown.hold},
      view: Null.make({detection: shown.show, visible: shown.visible, matchedSlot}),
    }
    if context.detectFace && context.autoCapture && !context.captureBusy {
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

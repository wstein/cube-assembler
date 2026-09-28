// Matching good live detections must agree before the camera captures a
// face, and the turn cue must see the old face leave before the next one.
let autoCaptureStableFrames = 5
let autoCaptureMinConfidence = 0.6
let turnCueClearFrames = 3

type turnCuePose = {centerX: float, centerY: float, size: float, angle: float}

// A same-colored side can still be a new side. Only a substantial change
// counts; small framing jitter while holding the old face does not.
let turnPoseChanged = (anchor: turnCuePose, current: turnCuePose) => {
  let angle = Math.abs(
    Math.atan2(
      ~y=Math.sin(current.angle -. anchor.angle),
      ~x=Math.cos(current.angle -. anchor.angle),
    ),
  )
  Math.hypot(current.centerX -. anchor.centerX, current.centerY -. anchor.centerY) >
  anchor.size *. 0.12 ||
  Math.abs(current.size -. anchor.size) > anchor.size *. 0.15 ||
  angle > Math.Constants.pi /. 9.0
}

// The turn cue stays up while the captured pattern is still in view. It
// clears on evidence that the face left: turnCueClearFrames frames showing
// a confidently detected different face (or the same letters after a real
// turn, see turnPoseChanged), or turnCueAbsentFrames frames in a row
// without any usable face, as while the cube is being turned. Detector
// flicker never clears it, or the same face could be captured again.
let turnCueAbsentFrames = 5

type turnCueState = {
  // Frames showing a different face since the old one was last seen.
  departed: int,
  // Consecutive frames without a usable face.
  missing: int,
}

let turnCueStart = {departed: 0, missing: 0}

let nextTurnCue = (
  state,
  visibleColors: Nullable.t<array<array<string>>>,
  lastCapturedColors,
  poseChanged,
) =>
  switch Nullable.toOption(visibleColors) {
  | None => {...state, missing: state.missing + 1}
  | Some(colors) =>
    let stillLastFace =
      CapturedFaceMatching.findCapturedFaceMatch(
        [Some({colors: lastCapturedColors})],
        {colors: colors},
        -1,
      )
      ->Null.toOption
      ->Option.isSome
    stillLastFace && !poseChanged ? turnCueStart : {departed: state.departed + 1, missing: 0}
  }

let turnCueCleared = state =>
  state.departed >= turnCueClearFrames || state.missing >= turnCueAbsentFrames

type autoCaptureSample = {
  colors: array<array<string>>,
  confidence: float,
  centerX: float,
  centerY: float,
  size: float,
  angle: float,
}

type autoCaptureProgress = {first: autoCaptureSample, frames: int}

// How many stickers differ; infinite when the grids differ in shape.
let colorDifference = (a: array<array<string>>, b: array<array<string>>) =>
  if Array.length(a) != Array.length(b) {
    Float.Constants.positiveInfinity
  } else {
    a->Array.reduceWithIndex(0.0, (total, row, r) => {
      let other = b->Array.getUnsafe(r)
      Array.length(row) != Array.length(other)
        ? Float.Constants.positiveInfinity
        : row->Array.reduceWithIndex(total, (count, color, c) =>
            color != other->Array.getUnsafe(c) ? count +. 1.0 : count
          )
    })
  }

// Counts frames of the same face in a row: a confident sample within 4% of
// the first one's stickers extends the run, any other starts a new one.
let nextAutoCaptureProgress = (
  previous: Nullable.t<autoCaptureProgress>,
  sample: Nullable.t<autoCaptureSample>,
) =>
  switch Nullable.toOption(sample) {
  | None => previous->Nullable.toOption->Null.fromOption
  | Some(sample) if sample.confidence < autoCaptureMinConfidence =>
    previous->Nullable.toOption->Null.fromOption
  | Some(sample) =>
    switch Nullable.toOption(previous) {
    | None => Null.make({first: sample, frames: 1})
    | Some(previous) =>
      let rows = Array.length(sample.colors)
      let allowed = Math.max(1.0, Math.floor(Int.toFloat(rows * rows) *. 0.04))
      colorDifference(sample.colors, previous.first.colors) <= allowed
        ? Null.make({first: previous.first, frames: previous.frames + 1})
        : Null.make({first: sample, frames: 1})
    }
  }

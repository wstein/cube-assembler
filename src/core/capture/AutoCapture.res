// Matching good live detections must agree before the camera captures a
// face.
let autoCaptureStableFrames = 5
let autoCaptureMinConfidence = 0.6

// After a camera capture auto capture waits for the person to turn the
// cube (they press Continue, or this long passes); nothing in the live
// frames is compared with the last capture.
let turnCueCooldownMs = 3000.0

let autoCaptureHeld = (lastCaptureAt: Nullable.t<float>, now: float) =>
  switch Nullable.toOption(lastCaptureAt) {
  | Some(at) => now -. at < turnCueCooldownMs
  | None => false
  }

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

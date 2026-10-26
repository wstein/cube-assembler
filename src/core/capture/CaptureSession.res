// The capture session's decisions: what storing a face capture does (which
// slot it lands in, what to say, which face comes next and whether the
// turn cue shows), and what the session shows around the captured faces.
// The hook keeps the state, refs and effects.
type faces = Dict.t<CaptureFlow.faceCaptureData>

@send external toFixed: (float, int) => string = "toFixed"

@tag("ok")
type captureStep =
  | @as(true)
  Captured({
      faces: faces,
      assignedFace: string,
      message: string,
      // The last camera capture, which the cube must turn away from before
      // live analysis captures again; null for other sources.
      // The next face to capture; null once all six are in.
      nextFace: Null.t<string>,
      // The turn to show before it, when the camera took this one.
      turnCue: Null.t<CaptureFlow.turnCue>,
    })
  | @as(false) Invalid({message: string})

let hasFace = (faces, face) => faces->Dict.get(face)->Option.isSome

// The slots (other than `face`, which is being retaken) whose photo this
// reading repeats: only odd cubes can tell, see RepeatedFace.
let repeatedSlot = (faces: faces, face, reading: CaptureFlow.faceCaptureReading) =>
  switch reading.cellColors {
  | Some(cellColors) =>
    let others = CaptureSteps.faceOrder->Array.filter(slot => slot != face)
    let photos =
      others->Array.map(slot => faces->Dict.get(slot)->Option.flatMap(data => data.cellColors))
    RepeatedFace.findRepeatShots(Array.concat(photos, [Some(cellColors)]))->Array.some(((
      _,
      newest,
    )) => newest == Array.length(photos))
  | None => false
  }

let captureStep = (
  faces,
  face,
  reading: CaptureFlow.faceCaptureReading,
  source: CaptureFlow.source,
  cameraSettings,
  previewColorProfile,
  size,
  reducedMotion,
  now,
) =>
  if !CapturedFaceMatching.validateFaceColors(reading.colors, size) {
    Invalid({
      message: `❌ Invalid colors detected. Confidence: ${(reading.confidence *. 100.0)
          ->toFixed(0)}%`,
    })
  } else if repeatedSlot(faces, face, reading) {
    Invalid({
      message: "❌ That is the same face as one already captured - turn the cube to the next face.",
    })
  } else {
    let placed = CaptureFlow.placeFaceCapture(
      faces,
      face,
      reading,
      source,
      cameraSettings,
      previewColorProfile,
      now,
    )
    let camera = source == Camera
    let nextFace = CaptureSteps.faceOrder->Array.find(face => !hasFace(placed.faces, face))
    Captured({
      faces: placed.faces,
      assignedFace: placed.assignedFace,
      message: CaptureFlow.capturedFaceMessage(
        placed.assignedFace,
        reading.confidence,
        placed.unexpectedCenter,
      ),
      nextFace: Null.fromOption(nextFace),
      // The cue blocks capturing while the cube turns; without the turn it
      // would only be a wait, and the step hint already says what to do.
      turnCue: switch nextFace {
      | Some(_) if camera && !reducedMotion => CaptureFlow.nextTurnCue(placed.faces)
      | _ => Null.null
      },
    })
  }

type sessionView = {
  // The center each capture slot is expected to show, from the faces so
  // far.
  predictedCenters: array<Null.t<string>>,
  predictedCenter: Null.t<string>,
  // Odd cubes route a capture to the slot its center belongs to, once the
  // first two faces fix the frame.
  centerRoutingActive: bool,
  // Slots that show the same face twice.
  repeatedNetFaces: array<string>,
  warning: Null.t<CaptureFlow.captureWarning>,
}

let sessionView = (faces: faces, webcamFace, size, dismissed) => {
  let order = CaptureSteps.faceOrder
  let photos = order->Array.map(face => faces->Dict.get(face)->Option.map(face => face.colors))
  let predictedCenters = GuidedCaptureSetup.captureCenterSlots(photos)
  let repeatedFaces = CapturedFaceMatching.findRepeatedFaces(photos)
  {
    predictedCenters,
    // Undefined for a face outside the capture order, as the original read.
    predictedCenter: predictedCenters->Array.getUnsafe(order->Array.indexOf(webcamFace)),
    centerRoutingActive: mod(size, 2) == 1 &&
    hasFace(faces, order->Array.getUnsafe(0)) &&
    hasFace(faces, order->Array.getUnsafe(1)) &&
    predictedCenters->Array.every(center => center->Null.toOption->Option.isSome) &&
    !hasFace(faces, webcamFace),
    repeatedNetFaces: repeatedFaces->Array.flatMap(((a, b)) => [
      order->Array.getUnsafe(a),
      order->Array.getUnsafe(b),
    ]),
    warning: CaptureFlow.captureWarning(faces, repeatedFaces, size, dismissed),
  }
}

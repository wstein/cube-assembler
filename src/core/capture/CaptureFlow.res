// The capture flow's decisions: placing a reading in its slot, the capture
// message and turn cue, whether a capture followed the guided protocol,
// capture warnings, the evidence for learning its colors, parsing typed
// cubes and the parity verdict.
open StickerGeometry

type frame = {width: float, height: float}
type crop = {
  x: float,
  y: float,
  width: float,
  height: float,
  // Degrees the crop was turned upright by, about its center.
  angle?: float,
  // Where it was straightened from, for a face seen at an angle.
  corners?: array<array<float>>,
}
// The camera's settings at capture time, passed through untouched; the
// browser's type on the TypeScript side.
@genType.import(("../../client/captureTypes", "CameraSettings"))
type cameraSettings

type source = | @as("camera") Camera | @as("image-file") ImageFile | @as("fixture") Fixture

type previewColorProfile = {id: string, name: string, colors: Dict.t<rgb>}

type faceCaptureData = {
  colors: array<array<string>>,
  detectedColors?: array<array<string>>,
  cellConfidences?: array<array<float>>,
  cellColors?: array<array<rgb>>,
  cellLookalikes?: array<array<Null.t<string>>>,
  confidence: float,
  croppedImage?: string,
  backgroundColor?: Null.t<rgb>,
  frame?: frame,
  crop?: crop,
  sharpness?: float,
  cameraSettings?: cameraSettings,
  previewColorProfile?: previewColorProfile,
  source?: source,
  outOfOrder?: bool,
  timestamp: float,
}

let faceOrder = CaptureSteps.faceOrder

let checkParity = (cube, size) => Parity.runFullParity(CubeAssembly.toCubeIR(cube, size))

// The parity check's verdict, or its error as an invalid result.
let parityStatus = (cube, size): Parity.parityResult =>
  try checkParity(cube, size) catch {
  | JsExn(error) =>
    Console.error2("Parity check error:", error)
    {
      valid: false,
      result: JsExn.message(error)->Option.getOr("Parity check failed"),
      checks: Dict.make(),
    }
  }

let solvedColor = face =>
  switch face {
  | "U" => "W"
  | "R" => "R"
  | "F" => "G"
  | "D" => "Y"
  | "L" => "O"
  | _ => "B"
  }

// Captured faces for a cube that was typed or picked rather than
// photographed, fully confident.
let cubeCaptureFaces = (cube: CubeState.cubeState, size, now) => {
  let face = (key, data) => (
    key,
    {
      colors: Array.fromInitializer(~length=size, r =>
        data->Array.slice(~start=r * size, ~end=r * size + size)
      ),
      confidence: 1.0,
      timestamp: now,
    },
  )
  Dict.fromArray([
    face("U", cube.u),
    face("R", cube.r),
    face("F", cube.f),
    face("D", cube.d),
    face("L", cube.l),
    face("B", cube.b),
  ])
}

let solvedCaptureFaces = (size, now) =>
  Dict.fromArray(
    faceOrder->Array.map(face => (
      face,
      {
        colors: Array.fromInitializer(~length=size, _ =>
          Array.make(~length=size, solvedColor(face))
        ),
        confidence: 1.0,
        timestamp: now,
      },
    )),
  )

@tag("ok")
type parsedCube =
  | @as(true) Parsed({cube: CubeState.cubeState, format: NotationOutput.notationFormat})
  | @as(false) Unreadable({message: string})

// Reads typed facelets or an Orbit64 token. The format is detected from the
// text where it can be, else the selected one is used.
let parseCubeInput = (input, selectedFormat: NotationOutput.notationFormat) => {
  let trimmed = String.trim(input)
  let isToken = Orbit64.looksLikeOrbit64StateToken(trimmed)
  let format: NotationOutput.notationFormat = isToken
    ? Urf
    : NotationOutput.detectNotationFormat(input)->Null.toOption->Option.getOr(selectedFormat)
  let cube = if isToken {
    Orbit64.decodeOrbit64State(trimmed)
    ->Null.toOption
    ->Option.flatMap(facelets => NotationOutput.fromURFFacelets(facelets)->Null.toOption)
  } else {
    switch format {
    | Wrg => NotationOutput.fromWRGFacelets(input)->Null.toOption
    | Urf => NotationOutput.fromURFFacelets(input)->Null.toOption
    }
  }
  switch cube {
  | Some(cube) => Parsed({cube, format})
  | None =>
    Unreadable({
      message: isToken
        ? "Invalid Orbit64 state token. Only canonical 2×2–7×7 state tokens are supported."
        : format == Wrg
        ? "Invalid facelets. Must be 6 space-separated blocks of equal, perfect-square length (9 for 3×3, 25 for 5×5, ...) using colors W, O, G, R, B, Y, in U R F D L B order."
        : "Invalid facelets. Must be 6 space-separated blocks of equal, perfect-square length (9 for 3×3, 25 for 5×5, ...) using letters U, R, F, D, L, B (the face each sticker matches when solved), in U R F D L B order.",
    })
  }
}

type faceCaptureReading = {
  colors: array<array<string>>,
  confidence: float,
  cellConfidences?: array<array<float>>,
  cellColors?: array<array<rgb>>,
  croppedImage?: string,
  backgroundColor?: Null.t<rgb>,
  frame?: frame,
  crop?: crop,
  sharpness?: float,
}

type placed = {faces: Dict.t<faceCaptureData>, assignedFace: string, unexpectedCenter: bool}

let colorsAt = (faces: Dict.t<faceCaptureData>) =>
  faceOrder->Array.map(face => faces->Dict.get(face)->Option.map(data => data.colors))

// Stores a reading in the slot its center belongs to, which may not be the
// requested one on odd cubes; a face placed elsewhere is out of order.
let placeFaceCapture = (
  faces: Dict.t<faceCaptureData>,
  face,
  reading: faceCaptureReading,
  source,
  cameraSettings: option<cameraSettings>,
  previewColorProfile: option<previewColorProfile>,
  now,
) => {
  let requestedIndex = faceOrder->Array.indexOf(face)
  let {index, unexpectedCenter} = GuidedCaptureSetup.placeCapturedFace(
    colorsAt(faces),
    requestedIndex,
    reading.colors,
  )
  let assignedFace = faceOrder->Array.getUnsafe(index)
  let wasOutOfOrder =
    faces->Dict.get(assignedFace)->Option.flatMap(data => data.outOfOrder)->Option.getOr(false)
  let entry = {
    colors: reading.colors,
    detectedColors: reading.colors,
    cellConfidences: ?reading.cellConfidences,
    cellColors: ?reading.cellColors,
    confidence: reading.confidence,
    croppedImage: ?reading.croppedImage,
    backgroundColor: ?reading.backgroundColor,
    frame: ?reading.frame,
    crop: ?reading.crop,
    sharpness: ?reading.sharpness,
    ?cameraSettings,
    source,
    ?previewColorProfile,
    outOfOrder: unexpectedCenter || index != requestedIndex || wasOutOfOrder,
    timestamp: now,
  }
  let next = Dict.copy(faces)
  next->Dict.set(assignedFace, entry)
  {faces: next, assignedFace, unexpectedCenter}
}

let capturedFaceMessage = (face, confidence, unexpectedCenter) =>
  `✓ ${CaptureSteps.faceDisplayLabel->Dict.getUnsafe(face)} captured (${(confidence *. 100.0)
      ->Float.toFixed(~digits=0)}% confidence)` ++ (
    unexpectedCenter ? " - its center isn't the suggested one; check it in the review" : ""
  )

// Where the captured face sat in the camera frame, so the turn cue can tell
// a turned cube from one still showing the same face.
let turnCuePose = (crop: option<crop>): Null.t<AutoCapture.turnCuePose> =>
  switch crop {
  | Some(crop) =>
    Null.make({
      AutoCapture.centerX: crop.x +. crop.width /. 2.0,
      centerY: crop.y +. crop.height /. 2.0,
      size: crop.width,
      angle: crop.angle->Option.getOr(0.0) *. Math.Constants.pi /. 180.0,
    })
  | None => Null.null
  }

type turnCue = {step: int, startColors: array<array<string>>, viaColors?: array<array<string>>}

let outOfOrder = (faces: Dict.t<faceCaptureData>) =>
  faceOrder->Array.some(face =>
    faces->Dict.get(face)->Option.flatMap(data => data.outOfOrder)->Option.getOr(false)
  )

// The turn to show before the next face: none once a face landed out of
// order, since the step hint then says what to do. The bottom face comes
// by way of Side 4.
let nextTurnCue = (faces: Dict.t<faceCaptureData>, nextFace, startColors) =>
  if outOfOrder(faces) {
    Null.null
  } else {
    let step = faceOrder->Array.indexOf(nextFace)
    Null.make(
      step == 5
        ? {
            step,
            startColors,
            viaColors: ?(
              faces->Dict.get(faceOrder->Array.getUnsafe(3))->Option.map(data => data.colors)
            ),
          }
        : {step, startColors},
    )
  }

let sourceOf = (faces: Dict.t<faceCaptureData>, face) =>
  faces->Dict.get(face)->Option.flatMap(data => data.source)

// Whether the faces followed the guided protocol: a camera capture, or an
// uploaded fixture that recorded it. Faces mixed with imported photos may
// not have, so they use the any-order search.
let isGuidedCapture = (faces, uploadedProtocol: Null.t<string>) =>
  (faceOrder->Array.every(face => sourceOf(faces, face) == Some(Camera)) &&
  !outOfOrder(faces) &&
  CapturedFaceMatching.checkGuidedCenters(
    colorsAt(faces)->Array.slice(~start=0, ~end=2),
  )->Array.length == 0) ||
    (faceOrder->Array.every(face => sourceOf(faces, face) == Some(Fixture)) &&
      Null.toOption(uploadedProtocol) == Some(CaptureSteps.guidedProtocol))

type captureWarning = {text: string, key: string, retake: int}

// A likely capture mistake visible while capturing - only a hint, never
// blocking. A whole face matching an earlier one (any size) comes first.
// Odd-size centers are live first-pass readings that can confuse red and
// orange, so they only count when read with some confidence.
let captureWarning = (
  faces: Dict.t<faceCaptureData>,
  repeatedFaces: array<(int, int)>,
  size,
  dismissed,
) => {
  let repeat = repeatedFaces->Array.findMap(((j, i)) => {
    let key = `repeat:${Int.toString(j)}:${Int.toString(i)}`
    dismissed->Array.includes(key)
      ? None
      : Some({
          text: `${(CaptureSteps.captureSteps->Array.getUnsafe(i)).label} and ${(
              CaptureSteps.captureSteps->Array.getUnsafe(j)
            ).label} have matching patterns. They may be different faces; check both photos if unsure.`,
          key,
          retake: i,
        })
  })
  switch repeat {
  | Some(warning) => Null.make(warning)
  | None =>
    let mid = size / 2
    let sure = i =>
      faces
      ->Dict.get(faceOrder->Array.getUnsafe(i))
      ->Option.flatMap(data => data.cellConfidences)
      ->Option.flatMap(grid => grid[mid])
      ->Option.flatMap(row => row[mid])
      ->Option.getOr(0.0) >= 0.6
    CapturedFaceMatching.checkGuidedCenters(colorsAt(faces))
    ->Array.findMap(issue => {
      let involved = switch issue {
      | TurnedTwice({photo}) => [photo - 1, photo]
      | SameCenter({photos: (a, b)}) | NotOpposite({photos: (a, b)}) => [a, b]
      }
      let key = JSON.stringifyAny(issue)->Option.getOr("")
      involved->Array.every(sure) && !(dismissed->Array.includes(key))
        ? Some({
            text: CaptureSteps.describeCenterIssue(issue),
            key,
            retake: involved->Array.reduce(0, (a, b) => a > b ? a : b),
          })
        : None
    })
    ->Null.fromOption
  }
}

type palette = {recalibrated: bool, confidentFraction: float}

// How far a reviewed capture's learned colors can be trusted: a valid cube
// from camera photos, recalibrated, confidently read and barely corrected.
// A face without its detected colors counts as fully corrected.
let captureEvidence = (
  faces: Dict.t<faceCaptureData>,
  size,
  reviewedValid,
  palette: palette,
): ColorProfileLearning.paletteEvidence => {
  let corrected = faceOrder->Array.reduce(0, (count, face) =>
    switch faces->Dict.get(face) {
    | Some({colors, detectedColors}) =>
      colors->Array.reduceWithIndex(count, (sum, row, r) =>
        row->Array.reduceWithIndex(
          sum,
          (sum, color, c) =>
            detectedColors[r]->Option.flatMap(row => row[c]) == Some(color) ? sum : sum + 1,
        )
      )
    | _ => count + size * size
    }
  )
  {
    reviewedValid,
    cameraOnly: faceOrder->Array.every(face => sourceOf(faces, face) == Some(Camera)),
    recalibrated: palette.recalibrated,
    confidentFraction: palette.confidentFraction,
    correctedFraction: Int.toFloat(corrected) /. Int.toFloat(6 * size * size),
  }
}

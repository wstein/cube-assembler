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
@genType.import(("../../client/capture/captureTypes", "CameraSettings"))
type cameraSettings

// Browser-observed identity is passed through unchanged; decisions live in PuzlWerk.
@genType.import(("../../client/capture/photoIdentity", "PhotoIdentity"))
type photoIdentity

type source = | @as("camera") Camera | @as("image-file") ImageFile | @as("fixture") Fixture

type previewColorProfile = {id: string, name: string, colors: Dict.t<rgb>}

// What the photo file said about itself when it was imported (see
// PhotoMetadata): the generator's fingerprint and the camera's EXIF.
@genType
type photoInfo = {fingerprint?: JSON.t, exif?: PhotoMetadata.exif}

type captureGuide = {step: int, mirrored: bool, displayedArrow: Null.t<int>, protocol: string}

type faceCaptureData = {
  photoIdentity?: photoIdentity,
  captureGuide?: captureGuide,
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
  photoInfo?: photoInfo,
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
  let isToken = Orbit64Token.looksLikeToken(trimmed)
  let format: NotationOutput.notationFormat = isToken
    ? Urf
    : NotationOutput.detectNotationFormat(input)->Null.toOption->Option.getOr(selectedFormat)
  let cube = if isToken {
    Orbit64Token.decodeState(trimmed)
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
        ? String.length(trimmed) == 43
            ? "Orbit64 V1 is no longer supported"
            : "Invalid Orbit64 state token. Only Orbit64 V2 color state tokens of 2×2–15×15 cubes are supported."
        : format == Wrg
        ? "Invalid facelets. Must be 6 space-separated blocks of equal, perfect-square length (9 for 3×3, 25 for 5×5, ...) using colors W, O, G, R, B, Y, in U R F D L B order."
        : "Invalid facelets. Must be 6 space-separated blocks of equal, perfect-square length (9 for 3×3, 25 for 5×5, ...) using letters U, R, F, D, L, B (the face each sticker matches when solved), in U R F D L B order.",
    })
  }
}

type faceCaptureReading = {
  photoIdentity?: photoIdentity,
  // Presentation context only; never copied into captured photo metadata.
  sourceLabelProtocol?: string,
  captureGuide?: captureGuide,
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

let bottomFirst = (faces: Dict.t<faceCaptureData>, incoming: option<captureGuide>) => {
  let populated = faceOrder->Array.filterMap(slot => faces->Dict.get(slot))
  let recorded = populated->Array.map(photo => photo.captureGuide)
  let guides = [...recorded, incoming]->Array.filterMap(guide => guide)
  let physical =
    guides->Array.some(guide => guide.protocol == GuidedCaptureProtocol.physicalProtocol)
  let compatible =
    recorded->Array.every(guide =>
      guide->Option.mapOr(false, guide =>
        guide.protocol == GuidedCaptureProtocol.physicalProtocol || guide.protocol == "retake/v1"
      )
    ) &&
      guides->Array.every(guide =>
        guide.protocol == GuidedCaptureProtocol.physicalProtocol || guide.protocol == "retake/v1"
      )
  physical && compatible
}
let captureUsesBottomFirst = faces => bottomFirst(faces, None)

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
  let placement = GuidedCaptureSetup.placeCapturedFaceForOrder(
    colorsAt(faces),
    requestedIndex,
    reading.colors,
    bottomFirst(faces, reading.captureGuide),
  )
  // V3 IDs describe observed source steps, not center-derived logical faces.
  let currentGuide =
    reading.captureGuide->Option.mapOr(false, guide =>
      GuidedCaptureProtocol.isCurrentProtocol(guide.protocol)
    )
  let index = currentGuide ? requestedIndex : placement.index
  let unexpectedCenter =
    placement.unexpectedCenter || (currentGuide && placement.index != requestedIndex)
  let assignedFace = faceOrder->Array.getUnsafe(index)
  let wasOutOfOrder =
    faces->Dict.get(assignedFace)->Option.flatMap(data => data.outOfOrder)->Option.getOr(false)
  let entry = {
    photoIdentity: ?reading.photoIdentity,
    captureGuide: ?reading.captureGuide,
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

// Source naming is a presentation decision. It must not be used as proof
// that six shots followed a physical protocol or to select a puzzle state.
let presentationProtocolFromGuides = (
  guides: array<option<captureGuide>>,
  uploadedProtocol: Null.t<string>,
) => {
  let known = protocol =>
    GuidedCaptureProtocol.isPhysicalProtocol(protocol) ||
    protocol == CaptureSteps.legacyGuidedProtocol
  let context = uploadedProtocol->Null.toOption->Option.filter(known)
  let originals =
    guides->Array.filterMap(guide => guide->Option.filter(guide => guide.protocol != "retake/v1"))
  let unsupported = originals->Array.some(guide => !known(guide.protocol))
  let versions = originals->Array.map(guide => guide.protocol)->Set.fromArray
  if unsupported || Set.size(versions) > 1 {
    Null.null
  } else {
    switch originals->Array.get(0)->Option.map(guide => guide.protocol) {
    | None => context->Null.fromOption
    | Some(observed) =>
      let mixedMissing = guides->Array.some(Option.isNone) && context->Option.isNone
      let conflict = context->Option.mapOr(false, value => value != observed)
      mixedMissing || conflict ? Null.null : Null.make(observed)
    }
  }
}
let sourcePresentationProtocol = (faces: Dict.t<faceCaptureData>, uploadedProtocol) =>
  presentationProtocolFromGuides(
    faces->Dict.valuesToArray->Array.map(photo => photo.captureGuide),
    uploadedProtocol,
  )
let sourcePhotoNamesForCapture = (faces, uploadedProtocol) =>
  CaptureSteps.sourcePhotoNames(sourcePresentationProtocol(faces, uploadedProtocol))
let capturedMessageWithProtocol = (face, confidence, unexpectedCenter, protocol) => {
  let label =
    CaptureSteps.sourcePhotoNames(protocol)
    ->Array.get(faceOrder->Array.indexOf(face))
    ->Option.getOr("Photo")
  `✓ ${label} captured (${(confidence *. 100.0)->Float.toFixed(~digits=0)}% confidence)` ++ (
    unexpectedCenter ? " - its center isn't the suggested one; check it in the review" : ""
  )
}
let capturedFaceMessage = (face, confidence, unexpectedCenter) =>
  capturedMessageWithProtocol(
    face,
    confidence,
    unexpectedCenter,
    Null.make(CaptureSteps.legacyGuidedProtocol),
  )
let capturedFaceMessageForCapture = (faces, face, confidence, unexpectedCenter, uploadedProtocol) =>
  capturedMessageWithProtocol(
    face,
    confidence,
    unexpectedCenter,
    sourcePresentationProtocol(faces, uploadedProtocol),
  )

type turnCue = {step: int}

let outOfOrder = (faces: Dict.t<faceCaptureData>) =>
  faceOrder->Array.some(face =>
    faces->Dict.get(face)->Option.flatMap(data => data.outOfOrder)->Option.getOr(false)
  )

// The turn to show after the n-th capture, whichever slots the captures
// landed in: nothing about the faces' colors stops the cues.
let nextTurnCue = (faces: Dict.t<faceCaptureData>) => {
  let captured = faceOrder->Array.filter(face => faces->Dict.get(face)->Option.isSome)->Array.length
  captured >= Array.length(faceOrder) ? Null.null : Null.make({step: captured})
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
      uploadedProtocol
      ->Null.toOption
      ->Option.mapOr(false, protocol =>
        GuidedCaptureProtocol.isPhysicalProtocol(protocol) ||
        protocol == CaptureSteps.legacyGuidedProtocol
      ))

type captureWarning = {text: string, key: string, retake: int}

// A likely capture mistake visible while capturing - only a hint, never
// blocking. A whole face matching an earlier one (any size) comes first.
// Odd-size centers are live first-pass readings that can confuse red and
// orange, so they only count when read with some confidence.
let captureWarningWithProtocol = (
  faces: Dict.t<faceCaptureData>,
  repeatedFaces: array<(int, int)>,
  size,
  dismissed,
  protocol,
) => {
  let names = CaptureSteps.sourcePhotoNames(protocol)
  let repeat = repeatedFaces->Array.findMap(((j, i)) => {
    let key = `repeat:${Int.toString(j)}:${Int.toString(i)}`
    dismissed->Array.includes(key)
      ? None
      : Some({
          text: `${names->Array.getUnsafe(i)} and ${names->Array.getUnsafe(
              j,
            )} have matching patterns. They may be different faces; check both photos if unsure.`,
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
            text: CaptureSteps.describeCenterIssueForProtocol(issue, protocol),
            key,
            retake: involved->Array.reduce(0, (a, b) => a > b ? a : b),
          })
        : None
    })
    ->Null.fromOption
  }
}

let captureWarning = (faces, repeated, size, dismissed) =>
  captureWarningWithProtocol(
    faces,
    repeated,
    size,
    dismissed,
    Null.make(CaptureSteps.legacyGuidedProtocol),
  )
let captureWarningForProtocol = (faces, repeated, size, dismissed, uploadedProtocol) =>
  captureWarningWithProtocol(
    faces,
    repeated,
    size,
    dismissed,
    sourcePresentationProtocol(faces, uploadedProtocol),
  )

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

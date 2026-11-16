// New guided captures follow the physical 3D demonstration. Camera mirroring
// changes only the displayed image, never the physical turn convention.
let faceOrder = ["U", "R", "F", "D", "L", "B"]

type captureStep = {label: string, short: string, instruction: string}

let captureSteps = [
  {label: "Side 1", short: "1", instruction: "Hold the cube upright and show any side."},
  {
    label: "Side 2",
    short: "2",
    instruction: "Follow the 3D demonstration: keep the same row on top and turn the physical cube one quarter turn to show its right side.",
  },
  {
    label: "Side 3",
    short: "3",
    instruction: "Repeat the same physical quarter turn shown by the 3D demonstration.",
  },
  {
    label: "Side 4",
    short: "4",
    instruction: "Repeat that physical quarter turn once more to show the fourth side.",
  },
  {
    label: "Bottom",
    short: "5",
    instruction: "Follow the 3D demonstration: tip the cube away from you by one quarter turn to show its bottom face.",
  },
  {
    label: "Top",
    short: "6",
    instruction: "Continue the physical tipping direction shown by the 3D demonstration, passing the next side to show the opposite top face.",
  },
]

let stepAt = i => captureSteps->Array.getUnsafe(i)
let stepOf = slot => stepAt(faceOrder->Array.indexOf(slot))

// The instruction for a step. It is the same with or without Mirror: the
// cube is turned the same way in the same order either way.
let captureInstruction = step => stepAt(step).instruction

// The direction of the arrow painted on the front face of the turn hint, in
// degrees (0 points up): side turns left, both tips up. The cue never
// changes the turning direction, and a mirror flips left and right only.
let turnHintArrowAngle = step => step < 4 ? 270 : 0

// Saved with fixtures captured this way, so they can be put together (and
// regression-tested) with the guided search again later.
let guidedProtocol = GuidedCaptureProtocol.physicalProtocol
let legacyGuidedProtocol = GuidedCaptureProtocol.legacyProtocol

// A capture mistake read from odd-size centers, in words; photo indexes are
// capture steps.
let describeCenterIssue = (issue: CapturedFaceMatching.guidedCenterIssue) => {
  let label = i => stepAt(i).label
  switch issue {
  | SameCenter({photos: (a, b)}) =>
    `${label(a)} and ${label(b)} show the same center - the same face photographed twice?`
  | TurnedTwice({photo}) =>
    `${label(photo)} shows the face opposite ${label(
        photo - 1,
      )} - the cube was probably turned twice.`
  | NotOpposite({photos: (a, b)}) =>
    `${label(a)} and ${label(b)} should be opposite faces, but aren't.`
  }
}

let faceDisplayLabel = Dict.fromArray(faceOrder->Array.map(face => (face, stepOf(face).label)))
let faceShortLabel = Dict.fromArray(faceOrder->Array.map(face => (face, stepOf(face).short)))

type glareSticker = {face: string}

// The faces to name in the glare warning, or none if too few stickers are
// washed out to warn about.
let glareFacesToWarn = (glare: array<glareSticker>) =>
  Array.length(glare) < StickerLearning.glareWarningStickers
    ? []
    : faceOrder->Array.filter(face => glare->Array.some(sticker => sticker.face == face))

// The order colors are listed in (review, stats).
let colorOrder = ["W", "O", "G", "R", "B", "Y"]

type tier = | @as("high") High | @as("medium") Medium | @as("low") Low

let confidenceTier = c => c >= 0.8 ? High : c >= 0.5 ? Medium : Low

type mark = | @as("corrected") Corrected | @as("flagged") Flagged

// How the review and the overview mark a sticker: corrected when its color
// was changed from the detection, flagged when the camera was unsure of it
// (low confidence) or it sits close to another color (a look-alike).
let stickerMark = (
  detected: Nullable.t<string>,
  color: string,
  confidence: float,
  lookalike: Nullable.t<string>,
) =>
  switch Nullable.toOption(detected) {
  | Some(detected) if detected != color => Null.make(Corrected)
  | _ =>
    confidenceTier(confidence) == Low || Nullable.toOption(lookalike)->Option.isSome
      ? Null.make(Flagged)
      : Null.null
  }

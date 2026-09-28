// Guided capture's steps: the 4 sides in turn while the cube is turned a
// quarter turn at a time (either way, same row kept on top), then top and
// bottom. Which physical face is which isn't known until all 6 are in, so
// the capture slots keep the neutral U..B keys of faceOrder (fixtures,
// uploads and the review key off them) and only their meaning is a step
// in this order - slot U is Side 1, R Side 2, ...
let faceOrder = ["U", "R", "F", "D", "L", "B"]

type captureStep = {label: string, short: string, instruction: string}

let captureSteps = [
  {label: "Side 1", short: "1", instruction: "Hold the cube upright and show any side."},
  {
    label: "Side 2",
    short: "2",
    instruction: "Keep the same row on top and turn the whole cube clockwise a quarter turn. Either way works.",
  },
  {
    label: "Side 3",
    short: "3",
    instruction: "Keep turning clockwise another quarter turn. Other directions still work.",
  },
  {
    label: "Side 4",
    short: "4",
    instruction: "Turn clockwise one more quarter turn. Any remaining side still works.",
  },
  {
    label: "Top",
    short: "5",
    instruction: "Tip the cube towards you so its top faces the camera - any angle is fine.",
  },
  {
    label: "Bottom",
    short: "6",
    instruction: "Bring Side 4 back to the camera, then continue tipping to the opposite face. Top and bottom may be swapped.",
  },
]

let stepAt = i => captureSteps->Array.getUnsafe(i)
let stepOf = slot => stepAt(faceOrder->Array.indexOf(slot))

// The instruction for a step; turns read the other way round in a mirrored
// view, where top and bottom also swap.
let captureInstruction = (step, mirrored) =>
  if !mirrored || step == 0 {
    stepAt(step).instruction
  } else {
    switch step {
    | 4 => "Tip the cube towards you so its top faces the camera. The mirrored view shows the bottom face."
    | 5 => "Bring Side 4 back to the camera, then continue tipping to the opposite face. The mirrored view shows the top face."
    | 1 => "Keep the same row on top and turn the whole cube counterclockwise in the mirrored view. Either direction works."
    | 2 => "Keep turning counterclockwise in the mirrored view. Other directions still work."
    | _ => "Turn counterclockwise in the mirrored view one more quarter turn. Any remaining side still works."
    }
  }

// Saved with fixtures captured this way, so they can be put together (and
// regression-tested) with the guided search again later.
let guidedProtocol = "sides-then-top-bottom/v1"

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

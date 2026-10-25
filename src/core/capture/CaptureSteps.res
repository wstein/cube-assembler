// Guided capture's steps: the 4 sides in turn while the cube is turned a
// quarter turn at a time (either way, same row kept on top), then top and
// bottom. Which physical face is which isn't known until all 6 are in, so
// the capture slots keep the neutral U..B keys of faceOrder (fixtures,
// uploads and the review key off them) and only their meaning is a step
// in this order - slot U is Side 1, R Side 2, ...
//
// The guided order: three quarter turns sideways show four sides, then step
// 4 tips the top toward you (shows U) and step 5 keeps tipping the same way
// past one more side to the bottom (shows D). The cue never changes the
// turning direction. Without Mirror, with the
// cube's F toward the camera and the arrow pointing left, the sides come as
// F R B L, so the faces are F R B L U D. The arrow always points the same
// way on screen, so with Mirror the physical sideways turn is the other way
// round and the side faces come in the opposite physical order; the tips are
// unaffected. The solver does not require any of this: a capture in any
// order is still accepted.
let faceOrder = ["U", "R", "F", "D", "L", "B"]

type captureStep = {label: string, short: string, instruction: string}

let captureSteps = [
  {label: "Side 1", short: "1", instruction: "Hold the cube upright and show any side."},
  {
    label: "Side 2",
    short: "2",
    instruction: "Keep the same row on top and turn the whole cube a quarter turn sideways, in the direction of the arrow as you see it in the camera picture. Either way works.",
  },
  {
    label: "Side 3",
    short: "3",
    instruction: "Keep turning in the direction of the arrow in the camera picture, another quarter turn. Other directions still work.",
  },
  {
    label: "Side 4",
    short: "4",
    instruction: "Turn one more quarter turn in the direction of the arrow in the camera picture. Any remaining side still works.",
  },
  {
    label: "Top",
    short: "5",
    instruction: "Tip the cube towards you so its top faces the camera - any angle is fine.",
  },
  {
    label: "Bottom",
    short: "6",
    instruction: "Keep tipping the cube the same way, past one more side, until the opposite face shows. Top and bottom may be swapped.",
  },
]

let stepAt = i => captureSteps->Array.getUnsafe(i)
let stepOf = slot => stepAt(faceOrder->Array.indexOf(slot))

// The instruction for a step. It is the same with or without Mirror: the
// cube is turned the same way in the same order either way.
let captureInstruction = step => stepAt(step).instruction

// The direction of the arrow painted on the front face of the turn hint, in
// degrees (0 points up): side turns left, both tips down. The cue never
// changes the turning direction, and a mirror flips left and right only.
let turnHintArrowAngle = step => step < 4 ? 270 : 180

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

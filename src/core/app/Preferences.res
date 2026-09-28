// Viewer preferences kept in first-party cookies: their names, and reading
// and writing them in a cookie string. The browser's document.cookie stays
// with the caller.
let mirrorCookie = "cube-assembler-mirror"
let autoCaptureCookie = "cube-assembler-auto-capture"
let soundCookie = "cube-assembler-capture-sound"
let cubeSizeCookie = "cube-assembler-cube-size"
let colorProfileCookie = "cube-assembler-color-profile"
let cubeViewCookie = "cube-assembler-cube-view"
let stickerlessCookie = "cube-assembler-stickerless"
let autoRotateCookie = "cube-assembler-auto-rotate"
let viewHelpCookie = "cube-assembler-view-help"
// The 3D view's turn click; until set it follows the capture sound.
let turnSoundCookie = "cube-assembler-turn-sound"
// How long a quarter turn takes, and whether it snaps past like a magnet.
let turnMsCookie = "cube-assembler-turn-ms"
let turnOvershootCookie = "cube-assembler-turn-overshoot"
// How far a swipe moves before it turns, how far a turn must get to count,
// and how far a flick carries on (percent of a quarter turn, milliseconds).
let swipeStartCookie = "cube-assembler-swipe-start-px"
let swipeCommitCookie = "cube-assembler-swipe-commit-percent"
let swipeFlickCookie = "cube-assembler-swipe-flick-ms"
// How many matching live frames auto capture waits for.
let autoCaptureFramesCookie = "cube-assembler-auto-capture-frames"
// How long scrambles are, and whether they turn inner layers.
let scrambleLengthCookie = "cube-assembler-scramble-length"
let scrambleInnerCookie = "cube-assembler-scramble-inner"
// A short vibration when a held sticker switches to a wide turn.
let vibrationCookie = "cube-assembler-vibration"
// How long that vibration lasts (milliseconds).
let vibrationMsCookie = "cube-assembler-vibration-ms"
// Developer settings: where the published app finds the local fixture
// server, and whether saving a fixture offers Upload to localhost.
let fixtureServerUrlCookie = "cube-assembler-fixture-server-url"
let localUploadCookie = "cube-assembler-local-upload"
// Light or dark colors, or whatever the system prefers.
let themeCookie = "cube-assembler-theme"
let notationCookie = "cube-assembler-notation"
let captureModeCookie = "cube-assembler-capture-mode"
// Set after an upload from the published app reached the local fixture
// server.
let fixtureServerCookie = "cube-assembler-fixture-server"

let oneYear = 365 * 24 * 60 * 60
let attributes = `Max-Age=${Int.toString(oneYear)}; Path=/; SameSite=Lax`

let readSelectionOption = (cookies, name) => {
  let prefix = `${name}=`
  cookies
  ->String.split(";")
  ->Array.map(String.trim)
  ->Array.find(cookie => cookie->String.startsWith(prefix))
  ->Option.flatMap(entry =>
    try Some(decodeURIComponent(entry->String.slice(~start=String.length(prefix)))) catch {
    | _ => None
    }
  )
}

let readSelection = (cookies, name) => Null.fromOption(readSelectionOption(cookies, name))

let readPreference = (cookies, name, fallback) =>
  switch readSelectionOption(cookies, name) {
  | Some("1") => true
  | Some("0") => false
  | _ => fallback
  }

let preferenceCookie = (name, on) => `${name}=${on ? "1" : "0"}; ${attributes}`

let selectionCookie = (name, value) => `${name}=${encodeURIComponent(value)}; ${attributes}`

let selectedCubeSize = cookies =>
  switch readSelectionOption(cookies, cubeSizeCookie) {
  | Some(("2" | "3" | "4" | "5" | "6" | "7") as value) => Null.make(Float.parseFloat(value))
  | _ => Null.null
  }

type cubeView =
  | @as("net") Net
  | @as("3d") ThreeD

let selectedCubeView = cookies =>
  switch readSelectionOption(cookies, cubeViewCookie) {
  | Some("net") => Null.make(Net)
  | Some("3d") => Null.make(ThreeD)
  | _ => Null.null
  }

// A saved whole number, as parseInt reads it.
let savedNumber = (cookies, name) => {
  let value = Float.parseInt(readSelectionOption(cookies, name)->Option.getOr(""), ~radix=10)
  Float.isFinite(value) ? Some(value) : None
}

let numberCookie = (name, value) => selectionCookie(name, Float.toString(Math.round(value)))

// One of `choices`, else `fallback`.
let readChoice = (cookies, name, choices, fallback) =>
  switch readSelectionOption(cookies, name) {
  | Some(value) if choices->Array.includes(value) => value
  | _ => fallback
  }

type range = {min: float, max: float, fallback: float}

// A whole number kept between `min` and `max`, else `fallback`.
let readNumber = (cookies, name, {min, max, fallback}) =>
  switch savedNumber(cookies, name) {
  | Some(value) => Math.min(max, Math.max(min, value))
  | None => fallback
  }

let clearedCookie = name => `${name}=; Max-Age=0; Path=/; SameSite=Lax`

// The cookies the settings page edits, which Reset all settings clears.
// The cube, colors and view picked in the scanner are kept.
let settingCookies = [
  mirrorCookie,
  autoCaptureCookie,
  soundCookie,
  notationCookie,
  captureModeCookie,
  turnSoundCookie,
  viewHelpCookie,
  turnMsCookie,
  turnOvershootCookie,
  swipeStartCookie,
  swipeCommitCookie,
  swipeFlickCookie,
  autoCaptureFramesCookie,
  scrambleLengthCookie,
  scrambleInnerCookie,
  vibrationCookie,
  vibrationMsCookie,
  fixtureServerUrlCookie,
  localUploadCookie,
  themeCookie,
]

let selectedNotationFormat = cookies => readChoice(cookies, notationCookie, ["wrg", "urf"], "wrg")

let selectedCaptureMode = cookies => readChoice(cookies, captureModeCookie, ["cv", "guide"], "cv")

let turnSoundOn = cookies =>
  readPreference(cookies, turnSoundCookie, readPreference(cookies, soundCookie, false))

let turnMsRange = {min: 60.0, max: 400.0, fallback: TurnFeel.defaultTurnMs}

type turnFeel = {turnMs: float, overshoot: bool}

let readTurnFeel = cookies => {
  turnMs: readNumber(cookies, turnMsCookie, turnMsRange),
  overshoot: readPreference(cookies, turnOvershootCookie, true),
}

type swipeRanges = {startPx: range, commitPercent: range, flickMs: range}

let swipeRanges = {
  startPx: {min: 8.0, max: 40.0, fallback: CubeGesture.defaultSwipeTuning.startPx},
  commitPercent: {
    min: 15.0,
    max: 60.0,
    fallback: Math.round(CubeGesture.defaultSwipeTuning.commitFraction *. 100.0),
  },
  flickMs: {min: 0.0, max: 240.0, fallback: CubeGesture.defaultSwipeTuning.flickMs},
}

let readSwipeTuning = (cookies): CubeGesture.swipeTuning => {
  startPx: readNumber(cookies, swipeStartCookie, swipeRanges.startPx),
  commitFraction: readNumber(cookies, swipeCommitCookie, swipeRanges.commitPercent) /. 100.0,
  flickMs: readNumber(cookies, swipeFlickCookie, swipeRanges.flickMs),
}

let autoCaptureFramesRange = {
  min: 2.0,
  max: 12.0,
  fallback: Int.toFloat(AutoCapture.autoCaptureStableFrames),
}

let readAutoCaptureFrames = cookies =>
  readNumber(cookies, autoCaptureFramesCookie, autoCaptureFramesRange)

type scrambleLength =
  | @as("short") Short
  | @as("normal") Normal
  | @as("long") Long

type scrambleOptions = {length: scrambleLength, innerLayers: bool}

let readScrambleOptions = cookies => {
  length: switch readSelectionOption(cookies, scrambleLengthCookie) {
  | Some("short") => Short
  | Some("long") => Long
  | _ => Normal
  },
  innerLayers: readPreference(cookies, scrambleInnerCookie, true),
}

let vibrationOn = cookies => readPreference(cookies, vibrationCookie, true)

// Many phone motors barely stir for 10 ms; 50 ms is a clear, short buzz.
let vibrationMsRange = {min: 10.0, max: 200.0, fallback: 50.0}

let readVibrationMs = cookies => readNumber(cookies, vibrationMsCookie, vibrationMsRange)

let localUploadShown = cookies => readPreference(cookies, localUploadCookie, true)

type theme =
  | @as("system") System
  | @as("light") Light
  | @as("dark") Dark

let selectedTheme = cookies =>
  switch readSelectionOption(cookies, themeCookie) {
  | Some("light") => Light
  | Some("dark") => Dark
  | _ => System
  }

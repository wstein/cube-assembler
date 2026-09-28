@genType let mirrorCookie: string
@genType let autoCaptureCookie: string
@genType let soundCookie: string
@genType let cubeSizeCookie: string
@genType let colorProfileCookie: string
@genType let cubeViewCookie: string
@genType let stickerlessCookie: string
@genType let autoRotateCookie: string
@genType let turnSoundCookie: string
@genType let turnMsCookie: string
@genType let turnOvershootCookie: string
@genType let swipeStartCookie: string
@genType let swipeCommitCookie: string
@genType let swipeFlickCookie: string
@genType let autoCaptureFramesCookie: string
@genType let scrambleLengthCookie: string
@genType let scrambleInnerCookie: string
@genType let vibrationCookie: string
@genType let fixtureServerUrlCookie: string
@genType let localUploadCookie: string
@genType let themeCookie: string
@genType let notationCookie: string
@genType let captureModeCookie: string
@genType let fixtureServerCookie: string

@genType let readPreference: (string, string, bool) => bool
@genType let preferenceCookie: (string, bool) => string
@genType let readSelection: (string, string) => Null.t<string>
@genType let selectionCookie: (string, string) => string
@genType let selectedCubeSize: string => Null.t<float>

@genType
type cubeView =
  | @as("net") Net
  | @as("3d") ThreeD

@genType let selectedCubeView: string => Null.t<cubeView>

@genType let readChoice: (string, string, array<string>, string) => string

@genType type range = {min: float, max: float, fallback: float}
@genType let readNumber: (string, string, range) => float
@genType let numberCookie: (string, float) => string
@genType let clearedCookie: string => string
@genType let settingCookies: array<string>
@genType let selectedNotationFormat: string => string
@genType let selectedCaptureMode: string => string
@genType let turnSoundOn: string => bool

@genType let turnMsRange: range
@genType type turnFeel = {turnMs: float, overshoot: bool}
@genType let readTurnFeel: string => turnFeel

@genType type swipeRanges = {startPx: range, commitPercent: range, flickMs: range}
@genType let swipeRanges: swipeRanges
@genType let readSwipeTuning: string => CubeGesture.swipeTuning

@genType let autoCaptureFramesRange: range
@genType let readAutoCaptureFrames: string => float

@genType
type scrambleLength =
  | @as("short") Short
  | @as("normal") Normal
  | @as("long") Long

@genType type scrambleOptions = {length: scrambleLength, innerLayers: bool}
@genType let readScrambleOptions: string => scrambleOptions
@genType let vibrationOn: string => bool
@genType let localUploadShown: string => bool

@genType
type theme =
  | @as("system") System
  | @as("light") Light
  | @as("dark") Dark

@genType let selectedTheme: string => theme

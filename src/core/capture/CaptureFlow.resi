@genType
type frame = {width: float, height: float}
@genType
type crop = {
  x: float,
  y: float,
  width: float,
  height: float,
  angle?: float,
  corners?: array<array<float>>,
}
@genType.import(("../../client/capture/captureTypes", "CameraSettings"))
type cameraSettings

@genType
type source = | @as("camera") Camera | @as("image-file") ImageFile | @as("fixture") Fixture

@genType
type previewColorProfile = {id: string, name: string, colors: Dict.t<StickerGeometry.rgb>}

@genType
type faceCaptureData = {
  colors: array<array<string>>,
  detectedColors?: array<array<string>>,
  cellConfidences?: array<array<float>>,
  cellColors?: array<array<StickerGeometry.rgb>>,
  cellLookalikes?: array<array<Null.t<string>>>,
  confidence: float,
  croppedImage?: string,
  backgroundColor?: Null.t<StickerGeometry.rgb>,
  frame?: frame,
  crop?: crop,
  sharpness?: float,
  cameraSettings?: cameraSettings,
  previewColorProfile?: previewColorProfile,
  source?: source,
  outOfOrder?: bool,
  timestamp: float,
}

@genType let checkParity: (CubeState.cubeState, int) => Parity.parityResult
@genType let parityStatus: (CubeState.cubeState, int) => Parity.parityResult
@genType let cubeCaptureFaces: (CubeState.cubeState, int, float) => Dict.t<faceCaptureData>
@genType let solvedCaptureFaces: (int, float) => Dict.t<faceCaptureData>

@genType @tag("ok")
type parsedCube =
  | @as(true) Parsed({cube: CubeState.cubeState, format: NotationOutput.notationFormat})
  | @as(false) Unreadable({message: string})

@genType let parseCubeInput: (string, NotationOutput.notationFormat) => parsedCube

@genType
type faceCaptureReading = {
  colors: array<array<string>>,
  confidence: float,
  cellConfidences?: array<array<float>>,
  cellColors?: array<array<StickerGeometry.rgb>>,
  croppedImage?: string,
  backgroundColor?: Null.t<StickerGeometry.rgb>,
  frame?: frame,
  crop?: crop,
  sharpness?: float,
}

@genType
type placed = {faces: Dict.t<faceCaptureData>, assignedFace: string, unexpectedCenter: bool}

@genType
let placeFaceCapture: (
  Dict.t<faceCaptureData>,
  string,
  faceCaptureReading,
  source,
  option<cameraSettings>,
  option<previewColorProfile>,
  float,
) => placed
@genType let capturedFaceMessage: (string, float, bool) => string
@genType let turnCuePose: option<crop> => Null.t<AutoCapture.turnCuePose>

@genType
type turnCue = {step: int, startColors: array<array<string>>, viaColors?: array<array<string>>}

@genType
let nextTurnCue: (Dict.t<faceCaptureData>, string, array<array<string>>) => Null.t<turnCue>
@genType let isGuidedCapture: (Dict.t<faceCaptureData>, Null.t<string>) => bool

@genType
type captureWarning = {text: string, key: string, retake: int}

@genType
let captureWarning: (
  Dict.t<faceCaptureData>,
  array<(int, int)>,
  int,
  array<string>,
) => Null.t<captureWarning>

@genType
type palette = {recalibrated: bool, confidentFraction: float}

@genType
let captureEvidence: (
  Dict.t<faceCaptureData>,
  int,
  bool,
  palette,
) => ColorProfileLearning.paletteEvidence

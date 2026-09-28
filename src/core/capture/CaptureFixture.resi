@genType
type captureFixtureInput = {
  capturedFaces: Dict.t<CaptureFlow.faceCaptureData>,
  puzzleSize: int,
  version: string,
  commit: string,
  userAgent: string,
  devicePixelRatio: float,
  mirrored: bool,
  cameraInfo: JSON.t,
  captureProfile: JSON.t,
  resolvedColorProfile: JSON.t,
  automaticResolution: Null.t<ColorProfileLearning.automaticResolution>,
  resolvedColorReference: JSON.t,
  guided: bool,
  cube: Null.t<CubeState.cubeState>,
  appliedBackgroundGains: Null.t<Dict.t<StickerGeometry.rgb>>,
  sampling: StickerGeometry.samplingGeometry,
  calibrationApplied: bool,
  learnedPalette: Null.t<Dict.t<StickerGeometry.rgb>>,
}

@genType let canSaveCaptureFixture: Dict.t<CaptureFlow.faceCaptureData> => bool
@genType let captureFixtureRequest: captureFixtureInput => FixtureZip.fixtureRequest

@genType type recordedNearest = {id: string, name: string, fit: float}
@genType
type recordedResolution = {
  reason?: ColorProfileLearning.reason,
  nearest?: Nullable.t<array<recordedNearest>>,
}

@genType
let recordedAutomaticResolution: Nullable.t<recordedResolution> => Null.t<
  ColorProfileLearning.automaticResolution,
>
@genType let fixtureLoadedMessage: (int, bool) => string

@genType type captureProfile = {id?: string, name: string}

@genType
type state = {
  learnedPalette: Null.t<Dict.t<StickerGeometry.rgb>>,
  mixedUpColors: array<string>,
  pendingPalette: Null.t<CaptureFinalization.pendingPalette>,
  captureProfile: Null.t<captureProfile>,
  resolvedColorProfile: Null.t<ProfileSettings.usedColorProfile>,
  resolvedColorReference: Null.t<Dict.t<StickerGeometry.rgb>>,
  automaticResolution: Null.t<ColorProfileLearning.automaticResolution>,
  globalWhiteBalanceNote: Null.t<string>,
  glareFaces: array<string>,
  appliedBackgroundGains: Null.t<Dict.t<StickerGeometry.rgb>>,
}

@genType let initialCalibration: unit => state

@genType type recordedProfile = {id?: string, name?: string}
@genType type recordedColorProfile = {name?: string, colors?: Dict.t<StickerGeometry.rgb>}
@genType
type recordedCapture = {
  profile?: Nullable.t<recordedProfile>,
  colorProfile?: Nullable.t<recordedColorProfile>,
  colorResolution?: Nullable.t<CaptureFixture.recordedResolution>,
  colorReference?: Nullable.t<Dict.t<StickerGeometry.rgb>>,
}

@genType @tag("kind")
type action =
  | @as("forgetResolvedProfile") ForgetResolvedProfile
  | @as("clear") Clear
  | @as("startCapture") StartCapture({startOver: bool})
  | @as("startRecalibration")
  StartRecalibration({
      selected: Null.t<ProfileSettings.usedColorProfile>,
    })
  | @as("applyRecalibration")
  ApplyRecalibration({
      result: CaptureFinalization.recalibration,
      profile: captureProfile,
    })
  | @as("failRecalibration") FailRecalibration
  | @as("applyFixtureCalibration")
  ApplyFixtureCalibration({
      capture: Nullable.t<recordedCapture>,
      classified: Recalibration.classified,
      recordedGains: Null.t<Dict.t<StickerGeometry.rgb>>,
    })
  | @as("setPendingPalette")
  SetPendingPalette({
      palette: Null.t<CaptureFinalization.pendingPalette>,
    })
  | @as("setAppliedBackgroundGains")
  SetAppliedBackgroundGains({
      gains: Null.t<Dict.t<StickerGeometry.rgb>>,
    })

@genType let calibrationReducer: (state, action) => state

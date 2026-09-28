@genType
type options = {
  faces: Dict.t<CaptureFlow.faceCaptureData>,
  order: array<string>,
  automatic: bool,
  palette?: Dict.t<StickerGeometry.rgb>,
  autoProfiles: array<ProfileSettings.colorProfile>,
  colorProfile: ProfileSettings.colorProfile,
  glareToWarn: array<Recalibration.location> => array<string>,
}

@genType
type pendingPalette = {
  colors: Dict.t<StickerGeometry.rgb>,
  confidentFraction: float,
  recalibrated: bool,
}

@genType
type recalibration = {
  finalFaces: Dict.t<CaptureFlow.faceCaptureData>,
  applied: bool,
  glare: array<string>,
  mixedUp: array<string>,
  learnedPalette: Null.t<Dict.t<StickerGeometry.rgb>>,
  pendingPalette: Null.t<pendingPalette>,
  resolution: Null.t<ColorProfileLearning.automaticResolution>,
  reference: Null.t<Dict.t<StickerGeometry.rgb>>,
  resolvedProfile: Null.t<ProfileSettings.usedColorProfile>,
}

@genType let finishRecalibration: (options, Recalibration.classified) => recalibration

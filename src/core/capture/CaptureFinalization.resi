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

@genType
type review = {
  cube: CubeState.cubeState,
  size: int,
  faces: Dict.t<CaptureFlow.faceCaptureData>,
  palette: pendingPalette,
  automatic: bool,
  autoProfiles: array<ProfileSettings.colorProfile>,
  resolvedId: Null.t<string>,
  profiles: array<ProfileSettings.colorProfile>,
  selectedId: string,
}

@genType
type learningOffer = {
  colors: Dict.t<StickerGeometry.rgb>,
  evidence: ColorProfileLearning.paletteEvidence,
  matchedProfileId: Null.t<string>,
}

@genType type reviewOutcome = {offer: Null.t<learningOffer>, autoMatchId: Null.t<string>}

@genType let finishReview: review => reviewOutcome

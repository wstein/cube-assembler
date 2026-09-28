@genType
type mode =
  | @as("aligned") Aligned
  | @as("fixed") Fixed

@genType
type request = {
  gridSize: int,
  mode: mode,
  requireOutline: bool,
  sampling: StickerGeometry.samplingGeometry,
  palette?: Dict.t<StickerGeometry.rgb>,
  autoProfiles?: array<ProfileSettings.colorProfile>,
  capturedBackgrounds?: Dict.t<Nullable.t<StickerGeometry.rgb>>,
}

@genType
type analysis = {
  bounds: FaceSampling.faceBounds,
  detection: Recalibration.colorDetection,
  visible: bool,
  backgroundColor: Null.t<StickerGeometry.rgb>,
  gains: StickerGeometry.rgb,
  colorProfileId?: string,
}

@genType
let readFaceSquare: (Uint8ClampedArray.t, int, int, FaceSampling.faceBounds) => Uint8ClampedArray.t
@genType let analyzeLiveFrame: (Uint8ClampedArray.t, int, int, request) => analysis
@genType let scaleBounds: (FaceSampling.faceBounds, float) => FaceSampling.faceBounds

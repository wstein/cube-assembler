@genType
let extractColorsFromImageData: (
  Uint8ClampedArray.t,
  float,
  float,
  int,
  StickerGeometry.rgb,
  StickerGeometry.samplingGeometry,
  option<Dict.t<StickerGeometry.rgb>>,
) => Recalibration.colorDetection
@genType
let hasCoherentStickerInteriors: (Uint8ClampedArray.t, float, float, int, float) => bool
@genType
let hasPlausibleStickerFace: (Uint8ClampedArray.t, float, float, int, float) => bool

@genType
type visibility = {
  visible: bool,
  coherent: bool,
  plausible?: bool,
  outline?: bool,
}

@genType
let faceVisibility: (Uint8ClampedArray.t, float, float, int, unit => bool, bool) => visibility
@genType
let outlineVisible: (Uint8ClampedArray.t, float, float, FaceSampling.faceBounds) => bool
@genType
let withGridOffset: (
  Recalibration.colorDetection,
  FaceSampling.faceBounds,
  FaceSampling.faceBounds,
) => Recalibration.colorDetection
@genType let measureSharpness: (Uint8ClampedArray.t, int, int) => float

@genType
type crop = {
  x: float,
  y: float,
  width: float,
  height: float,
  angle?: float,
  corners?: array<array<float>>,
}

@genType let cropRecord: FaceSampling.faceBounds => crop

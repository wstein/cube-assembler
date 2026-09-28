@genType
type faceBounds = {
  startX: float,
  startY: float,
  faceWidth: float,
  faceHeight: float,
  angle?: float,
  corners?: array<(float, float)>,
  gridFound?: bool,
  needsRecentering?: bool,
}

@genType let sampleFaceFraction: float
@genType let guideBounds: (float, float, float) => faceBounds

@genType type area = {x0: float, y0: float, x1: float, y1: float}
@genType type origin = {x0: float, y0: float}

@genType let alignmentArea: (faceBounds, float, float) => area
@genType
let alignFaceInArea: (
  Uint8ClampedArray.t,
  int,
  int,
  faceBounds,
  origin,
  int,
) => GridAlignment.gridAlignment
@genType
let boundsFromAlignment: (
  GridAlignment.gridAlignment,
  faceBounds,
  origin,
  float,
  float,
  Nullable.t<array<(float, float)>>,
) => faceBounds
@genType
let alignedBoundsInArea: (
  Uint8ClampedArray.t,
  int,
  int,
  faceBounds,
  origin,
  int,
  float,
  float,
) => faceBounds

@genType let cropJpegQuality: float
@genType let backgroundCubeGap: float
@genType let outlierTrimFraction: float
@genType let trimmedMeanColor: (array<StickerGeometry.rgb>, float) => Null.t<StickerGeometry.rgb>
@genType
let extractBackgroundColorFromPixels: (
  Uint8ClampedArray.t,
  int,
  int,
  faceBounds,
) => Null.t<StickerGeometry.rgb>
@genType let limitBackgroundGain: StickerGeometry.rgb => StickerGeometry.rgb
@genType let backgroundWbMethod: string
@genType
let backdropReference: Dict.t<Nullable.t<StickerGeometry.rgb>> => Null.t<StickerGeometry.rgb>
@genType
let computeBackgroundGains: Dict.t<Nullable.t<StickerGeometry.rgb>> => Null.t<
  Dict.t<StickerGeometry.rgb>,
>
@genType let stickerMeasurement: string
@genType let stickerColor: array<StickerGeometry.rgb> => Null.t<StickerGeometry.rgb>
@genType let centerCore: float
@genType let centerStickerColor: array<StickerGeometry.rgb> => Null.t<StickerGeometry.rgb>

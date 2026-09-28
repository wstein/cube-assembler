@genType
type stickerSample = {rgb: StickerGeometry.rgb, colorGuess: string}

@genType let hungarianAssignment: array<array<float>> => array<int>
@genType
let balancedAssign: (
  array<StickerGeometry.rgb>,
  array<StickerGeometry.rgb>,
  array<Nullable.t<int>>,
) => array<int>

@genType
type learnedColors = {
  colors: Dict.t<StickerGeometry.rgb>,
  clusterSizes: Dict.t<int>,
  labelsBySampleIndex: array<string>,
  leaveOneOutDistances: array<float>,
  clearLabels: array<Null.t<string>>,
  mixedUpColors: array<string>,
}

@genType
let clearStickerColors: (
  array<StickerGeometry.rgb>,
  Dict.t<StickerGeometry.rgb>,
) => array<Null.t<string>>
@genType let glareWarningStickers: int
@genType
let glareStickers: (
  array<StickerGeometry.rgb>,
  array<string>,
  Dict.t<StickerGeometry.rgb>,
) => array<int>
@genType
let mixedUpClusters: (
  array<StickerGeometry.rgb>,
  array<StickerGeometry.rgb>,
  array<int>,
) => array<int>
@genType
let learnStickerColors: (
  array<stickerSample>,
  Dict.t<StickerGeometry.rgb>,
  array<Nullable.t<string>>,
) => Null.t<learnedColors>

@genType
type gridOffset = {x: float, y: float, scale: float, angle: float}

@genType
type colorDetection = {
  colors: array<array<string>>,
  confidence: float,
  cellConfidences: array<array<float>>,
  cellColors: array<array<StickerGeometry.rgb>>,
  cellLookalikes?: array<array<Null.t<string>>>,
  gridOffset?: gridOffset,
  outerCellRatio?: float,
  centerColor?: StickerGeometry.rgb,
}

@genType
type location = {face: string, row: int, col: int}

@genType
type classified = {
  learned: Null.t<StickerLearning.learnedColors>,
  applied: bool,
  faces: Dict.t<colorDetection>,
  glare: array<location>,
}

@genType
let colorConfidences: (StickerGeometry.rgb, Dict.t<StickerGeometry.rgb>) => Dict.t<float>
@genType let paletteDistance: (Dict.t<StickerGeometry.rgb>, Dict.t<StickerGeometry.rgb>) => float
@genType let lookalikeRatio: float

@genType
type nearest = {color: string, ratio: float}

@genType
let nearestOtherColor: (StickerGeometry.rgb, string, Dict.t<StickerGeometry.rgb>) => Null.t<nearest>
@genType
let classifyAcrossFaces: (Dict.t<colorDetection>, option<Dict.t<StickerGeometry.rgb>>) => classified

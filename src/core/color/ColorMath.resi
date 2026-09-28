@genType
type oklch = {l: float, c: float, h: float}
@genType
type oklab = {l: float, a: float, b: float}

@genType let srgbChannelToLinear: float => float
@genType let rgbToOklab: StickerGeometry.rgb => oklab
@genType let linearRgbToOklab: (float, float, float) => oklab
@genType let linearChannelToSrgb: float => float
@genType let oklabToRgb: oklab => StickerGeometry.rgb
@genType let rgbToOKLCH: StickerGeometry.rgb => oklch

@genType
type hueRange = {min: float, max: float, span: float}
@genType let hueCircularRange: array<float> => Null.t<hueRange>
@genType let hueRangesOverlap: (hueRange, hueRange) => bool

@genType
type linearRange = {min: float, max: float}
@genType let linearRange: array<float> => Null.t<linearRange>

@genType let clusterOklabDistance: (oklab, oklab) => float
@genType let clusterDistance: (StickerGeometry.rgb, StickerGeometry.rgb) => float
@genType let confidenceDistanceScale: float

@genType
type classification = {color: string, confidence: float}
@genType
let classifySticker: (StickerGeometry.rgb, option<Dict.t<StickerGeometry.rgb>>) => classification

@genType let neutralGains: StickerGeometry.rgb
@genType let applyGains: (StickerGeometry.rgb, StickerGeometry.rgb) => StickerGeometry.rgb
@genType let removeGains: (StickerGeometry.rgb, StickerGeometry.rgb) => StickerGeometry.rgb

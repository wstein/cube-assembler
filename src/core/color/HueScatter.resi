@genType
type sample = {rgb: StickerGeometry.rgb, label: string}

@genType
type point = {
  label: string,
  hue: float,
  l: float,
  chroma: float,
  neutral: bool,
}

@genType
type deviation = {label: string, count: int, expected: int}

@genType let countDeviations: array<sample> => array<deviation>
@genType let neutralChroma: float
@genType let hueCut: float
@genType let hueAxis: float => float
@genType let hueBarColor: (float, float) => StickerGeometry.rgb
@genType let hueScatter: array<sample> => array<point>
@genType let meansByLabel: array<sample> => Dict.t<StickerGeometry.rgb>
@genType let colorDelta: (StickerGeometry.rgb, StickerGeometry.rgb) => float

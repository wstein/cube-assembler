@genType
type sample = {rgb: StickerGeometry.rgb, label: string}

@genType
type point = {
  label: string,
  hue: float,
  l: float,
  chroma: float,
  neutral: bool,
  misplaced: bool,
}

@genType let neutralChroma: float
@genType let hueCut: float
@genType let hueAxis: float => float
@genType let hueScatter: array<sample> => array<point>
@genType let meansByLabel: array<sample> => Dict.t<StickerGeometry.rgb>
@genType let colorDelta: (StickerGeometry.rgb, StickerGeometry.rgb) => float

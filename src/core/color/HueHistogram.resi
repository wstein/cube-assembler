@genType
type sample = {rgb: StickerGeometry.rgb, label: string}

@genType
type histogram = {
  bins: array<Dict.t<int>>,
  neutral: Dict.t<int>,
}

@genType let neutralChroma: float
@genType let hueBin: (StickerGeometry.rgb, int) => int
@genType let hueHistogram: (array<sample>, int) => histogram
@genType let meansByLabel: array<sample> => Dict.t<StickerGeometry.rgb>
@genType let colorDelta: (StickerGeometry.rgb, StickerGeometry.rgb) => float

@genType
type face = {
  cellColors: array<array<StickerGeometry.rgb>>,
  colors: array<array<string>>,
  palette: option<Dict.t<StickerGeometry.rgb>>,
}

@genType
let gate: float

@genType
let suspectLabels: array<face> => array<option<array<array<Null.t<string>>>>>

@genType
type capturedFace = {colors: array<array<string>>, cellColors?: array<array<StickerGeometry.rgb>>}

@genType
type colorStat = {
  count: int,
  expected: int,
  lightness: Null.t<ColorMath.linearRange>,
  chroma: Null.t<ColorMath.linearRange>,
  hue: Null.t<ColorMath.hueRange>,
  hueOverlapsWith: array<string>,
}

@genType let computeColorStats: (Dict.t<capturedFace>, int) => Dict.t<colorStat>

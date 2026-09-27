type cubeState = {
  u: array<string>,
  r: array<string>,
  f: array<string>,
  d: array<string>,
  l: array<string>,
  b: array<string>,
}

type notationFormat = | @as("wrg") Wrg | @as("urf") Urf

@genType let toWRGFacelets: cubeState => string
@genType let fromWRGFacelets: string => Null.t<cubeState>
@genType let gridsToWRGFacelets: Dict.t<array<array<string>>> => string
@genType let wrgFaceletsToGrids: string => Null.t<Dict.t<array<array<string>>>>
@genType let toURFFacelets: cubeState => string
@genType let fromURFFacelets: string => Null.t<cubeState>
@genType let detectNotationFormat: string => Null.t<notationFormat>

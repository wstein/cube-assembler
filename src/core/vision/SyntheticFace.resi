@genType let presets: array<string>

@genType
type logo = {row: int, col: int, color: string, size?: float}

@genType
type geometry = {gap?: float, radius?: float, margin?: float}

@genType
type options = {
  scatter?: float,
  lightness?: float,
  palette?: Dict.t<StickerGeometry.rgb>,
  logo?: logo,
  noise?: float,
  blur?: float,
  brightness?: float,
  geometry?: geometry,
}

@genType
let renderFace: (array<array<string>>, string, int, int, options) => Uint8ClampedArray.t

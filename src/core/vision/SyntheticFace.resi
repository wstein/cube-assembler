@genType let presets: array<string>

@genType
type logo = {row: int, col: int, color: string, size?: float}

@genType
type geometry = {gap?: float, radius?: float, margin?: float}

@genType
type shadow = {strength?: float, shape?: string, softness?: float}

@genType
type options = {
  scatter?: float,
  tone?: float,
  shading?: float,
  faceShift?: float,
  lightness?: float,
  palette?: Dict.t<StickerGeometry.rgb>,
  logo?: logo,
  noise?: float,
  blur?: float,
  brightness?: float,
  geometry?: geometry,
  shadow?: shadow,
}

@genType
let renderFace: (array<array<string>>, string, int, int, options) => Uint8ClampedArray.t

@genType type vec3 = (float, float, float)

@genType
type face =
  | @as("u") U
  | @as("d") D
  | @as("f") F
  | @as("b") B
  | @as("r") R
  | @as("l") L

@genType let defaultStickerHex: Dict.t<string>
@genType let autoRotateResumeDelayMs: float
@genType let autoRotateRadiansPerMs: float
@genType let isometricPitch: float
@genType let isometricYaw: float
@genType let hexToRgb: string => vec3
@genType let getFaceletColor: (CubeState.cubeState, int, face, int, int, int) => string
@genType let getDefaultZoom: float => float

@genType type seams = {top: bool, bot: bool, rt: bool, lt: bool}

@genType let getFaceSeams: (face, int, int, int, int) => seams
@genType let rotateVec: (vec3, CubeGeometry.axis, float) => vec3

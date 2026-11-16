@genType type placement = {slot: string, target: CubeState.faceKey, quarterTurns: int}
@genType type mapping = array<placement>
@genType
type validation = {
  faces: Null.t<CubeTypes.faceSet<CubeTypes.grid>>,
  candidate: Null.t<CubeTypes.orientedCandidate>,
  valid: bool,
  issues: array<string>,
  parity: Null.t<Parity.parityResult>,
}
@genType
type frame = {
  faces: CubeTypes.faceSet<CubeTypes.grid>,
  mapping: mapping,
  displayTransform: int,
  canonicalTransform: int,
}
@genType
let initializeMapping: (Dict.t<CubeTypes.grid>, Null.t<CubeTypes.orientedCandidate>) => mapping
@genType let rotateMapping: (mapping, string, int) => mapping
@genType let assignMapping: (mapping, string, CubeState.faceKey) => mapping
@genType let validateMapping: (Dict.t<CubeTypes.grid>, mapping, int) => validation
@genType let captureFrame: (Dict.t<CubeTypes.grid>, mapping, string, string) => Null.t<frame>
@genType
let transformFaces: (
  CubeTypes.faceSet<CubeTypes.grid>,
  int,
) => Null.t<CubeTypes.faceSet<CubeTypes.grid>>
@genType let inverseTransform: int => Null.t<int>

@genType @tag("kind")
type guidedCenterIssue =
  | @as("same-center") SameCenter({photos: (int, int)})
  | @as("turned-twice") TurnedTwice({photo: int})
  | @as("not-opposite") NotOpposite({photos: (int, int)})

@genType let checkGuidedCenters: array<option<CubeTypes.grid>> => array<guidedCenterIssue>

@genType
type faceMatchSample = {colors: CubeTypes.grid}

@genType
let findCapturedFaceMatch: (array<option<faceMatchSample>>, faceMatchSample, int) => Null.t<int>
@genType
let findCaptureSlotForOrientedFace: (array<option<CubeTypes.grid>>, CubeTypes.grid) => Null.t<int>
@genType let findRepeatedFaces: array<option<CubeTypes.grid>> => array<(int, int)>
@genType let validateFaceColors: (CubeTypes.grid, int) => bool
@genType let createSolvedCube: int => CubeState.cubeState

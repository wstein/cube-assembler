type faces = Dict.t<array<array<string>>>
type colors = Dict.t<string>
type axis = | @as("x") X | @as("y") Y | @as("z") Z
type faceKey = CubeState.faceKey

@genType let rotateCube: (faces, axis, int) => faces
@genType let turnFace: (faces, faceKey, int, int) => faces
@genType let allOrientations: faces => array<faces>
@genType let solvedCubeFaces: (int, colors) => faces

type faces = Dict.t<array<array<string>>>
type colors = Dict.t<string>
type axis = | @as("x") X | @as("y") Y | @as("z") Z
type faceKey = CubeState.faceKey

// A face's grid; panics when the face is missing.
let faceGrid: (faces, string) => array<array<string>>
@genType let rotateCube: (faces, axis, int) => faces
@genType let turnFace: (faces, faceKey, int, int) => faces
@genType let allOrientations: faces => array<faces>
@genType let solvedCubeFaces: (int, colors) => faces
@genType let rotateGrid: (array<array<string>>, int) => array<array<string>>

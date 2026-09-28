let solvedColor: CubeState.faceKey => string

type cornerPos = TL | TR | BL | BR
let cornerFaceletIndex: (int, cornerPos) => int
let cornerNames: array<string>
let cornerSlots: array<array<(CubeState.faceKey, cornerPos)>>
let solvedCorners: array<(string, string, string)>
let identifyCorner: ((string, string, string)) => option<(int, int)>

type edgeLine = TopLine | BottomLine | LeftLine | RightLine
let edgeLineFaceletIndex: (int, edgeLine, bool, int) => int
let edgeNames: array<string>
let edgeLines: array<((CubeState.faceKey, edgeLine, bool), (CubeState.faceKey, edgeLine, bool))>
let solvedEdges: array<(string, string)>
let identifyEdge: ((string, string)) => option<(int, int)>

let permParity: array<int> => bool
let sum: array<int> => int

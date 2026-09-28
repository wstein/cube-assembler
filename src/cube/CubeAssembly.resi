@genType let toCubeIR: (CubeState.cubeState, int) => CubeState.cubeIR
@genType let assembleCubeFromFaces: (Dict.t<CubeTypes.grid>, int) => CubeState.cubeState
@genType let solveFaceOrientations: Dict.t<CubeTypes.grid> => Null.t<CubeTypes.orientationSolution>
@genType let orientationFreeSignature: CubeTypes.faceSet<CubeTypes.grid> => string
@genType let solveGuidedCapture: CubeTypes.guidedCapture => Null.t<CubeTypes.guidedSolution>

// Each color's opposite on a standard cube.
let opposite: string => option<string>
@genType let predictGuidedCenters: array<option<CubeTypes.grid>> => array<Null.t<string>>
@genType let captureCenterSlots: array<option<CubeTypes.grid>> => array<Null.t<string>>
@genType
let captureSlotForCenter: (array<option<CubeTypes.grid>>, int, CubeTypes.grid) => Null.t<int>

@genType
type placement = {index: int, unexpectedCenter: bool}

@genType
let placeCapturedFace: (array<option<CubeTypes.grid>>, int, CubeTypes.grid) => placement

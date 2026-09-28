@genType
type faceletRef = {face: string, index: int}

@genType
type highlightGroup = {group: string, facelets: array<faceletRef>}

@genType
type parityResult = {
  valid: bool,
  result: string,
  checks: Dict.t<bool>,
  highlight?: array<highlightGroup>,
  detail?: string,
}

@genType
type wingResult = {
  valid: bool,
  result?: string,
  highlight?: array<highlightGroup>,
}

@genType let validateWingEdges: CubeState.cubeIR => wingResult
@genType let runFullParity: CubeState.cubeIR => parityResult

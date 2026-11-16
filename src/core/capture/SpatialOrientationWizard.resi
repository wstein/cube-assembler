@genType type decision = CaptureFaceMapping.placement
@genType
type candidate = {
  id: string,
  mapping: CaptureFaceMapping.mapping,
  faces: CubeTypes.faceSet<CubeTypes.grid>,
  valid: bool,
  issues: array<string>,
  fullCubeValidityKnown: bool,
}
@genType
type session = {
  candidates: array<candidate>,
  truncated: bool,
  guided: bool,
  equivalenceReduced: bool,
  issues: array<string>,
}
@genType
type choice = {
  slot: string,
  target: CubeState.faceKey,
  quarterTurns: int,
  grid: CubeTypes.grid,
  candidateIds: array<string>,
}
@genType let generate: (Dict.t<CubeTypes.grid>, int, bool) => session
@genType let remaining: (session, array<decision>) => array<candidate>
@genType let options: (session, array<decision>, string) => array<choice>
@genType let nextSlot: (session, array<decision>) => Null.t<string>
@genType let select: (array<decision>, decision) => array<decision>
@genType let previous: array<decision> => array<decision>

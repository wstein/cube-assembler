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
@genType
let preserveMapping: (
  Dict.t<CubeTypes.grid>,
  CaptureFaceMapping.mapping,
  candidate,
) => CaptureFaceMapping.mapping
@genType type reconciliation = {decisions: array<decision>, conflicts: array<decision>}
@genType let reconcile: (session, array<decision>, decision) => reconciliation
@genType
let previewFaces: (
  Dict.t<CubeTypes.grid>,
  CaptureFaceMapping.mapping,
  int,
) => CubeTypes.faceSet<CubeTypes.grid>
@genType let retainsMapping: (session, CaptureFaceMapping.mapping) => bool
@genType let matchesDecision: (CaptureFaceMapping.mapping, decision) => bool
@genType
type proposal = {
  mapping: CaptureFaceMapping.mapping,
  decisions: array<decision>,
  conflicts: array<decision>,
}
@genType
let propose: (
  Dict.t<CubeTypes.grid>,
  session,
  array<decision>,
  decision,
  CaptureFaceMapping.mapping,
) => Null.t<proposal>
@genType
type choicePreview = {
  grid: CubeTypes.grid,
  target: CubeState.faceKey,
  mapping: CaptureFaceMapping.mapping,
  displayTransform: int,
}
@genType
let previewChoice: (
  Dict.t<CubeTypes.grid>,
  session,
  array<decision>,
  decision,
  CaptureFaceMapping.mapping,
  string,
  string,
  bool,
) => Null.t<choicePreview>
@genType
type presentedChoice = {
  choice: choice,
  view: choicePreview,
  relativeTurns: int,
  isCurrent: bool,
}
@genType
let presentChoices: (
  Dict.t<CubeTypes.grid>,
  session,
  array<decision>,
  string,
  CaptureFaceMapping.mapping,
  string,
  string,
  bool,
) => array<presentedChoice>

@genType let knownAlternatives: (session, CaptureFaceMapping.mapping) => int

@genType
type protocolSession = {
  session: session,
  baseline: Null.t<candidate>,
  baselineStatus: string,
  issues: array<string>,
}
@genType let generateForProtocol: (Dict.t<CubeTypes.grid>, int, Null.t<string>) => protocolSession

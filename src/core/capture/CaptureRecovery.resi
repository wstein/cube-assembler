@genType
type observation = {
  slot: string,
  step: int,
  mirrored: bool,
  displayedArrow: Null.t<int>,
  protocol: string,
}
@genType
type pose = {
  guideObservations: array<observation>,
  frontSlot: string,
  upSlot: string,
  confirmed: bool,
  displayTransform: int,
  canonicalTransform: int,
  photoTransforms: CaptureFaceMapping.mapping,
  protocol: Null.t<string>,
  mirrored: bool,
  turnDirection: string,
  capOrder: string,
  displayedArrows: array<int>,
}
@genType
type recovery = {
  stateRelation: string,
  version: int,
  transformConvention: string,
  mapping: CaptureFaceMapping.mapping,
  captureFrame: pose,
  view: string,
}
@genType let readRecovery: 'a => Null.t<recovery>

@genType
let restoredCandidate: (
  recovery,
  Dict.t<CubeTypes.grid>,
  int,
  Null.t<Dict.t<CubeTypes.grid>>,
) => Null.t<CubeTypes.orientedCandidate>

@genType let recordGuide: (string, bool, bool) => Null.t<CaptureFlow.captureGuide>
@genType
let mergeGuideObservations: (
  array<observation>,
  Dict.t<CaptureFlow.faceCaptureData>,
) => array<observation>

@genType
let captureProtocol: (Dict.t<CaptureFlow.faceCaptureData>, Null.t<string>) => Null.t<string>

@genType let readCaptureGuide: (JSON.t, string) => Null.t<CaptureFlow.captureGuide>

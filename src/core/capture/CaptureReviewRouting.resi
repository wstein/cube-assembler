@genType
type captureReviewFace = {
  colors: array<array<string>>,
  detectedColors?: array<array<string>>,
  cellConfidences?: array<array<float>>,
  cellLookalikes?: array<array<Null.t<string>>>,
  confidence: float,
}

@genType
type captureApproval = {
  candidates: array<CubeTypes.orientedCandidate>,
  arrangements?: array<CubeTypes.guidedArrangement>,
  valid: bool,
  note?: string,
  suggestedFrom?: int,
  fallback: Null.t<CubeTypes.orientationSolution>,
  page?: int,
}

@genType let rejectAlternatives: captureApproval => array<CubeTypes.orientedCandidate>

@genType @tag("kind")
type captureReviewPlan =
  | @as("approval") Approval({approval: captureApproval})
  | @as("wizard") Wizard({remaining: array<CubeTypes.orientedCandidate>, truncated: bool})
  | @as("choose") Choose({candidate: CubeTypes.orientedCandidate})
  | @as("notice") Notice({message: string})

@genType
let planCaptureReview: (
  Dict.t<CubeTypes.grid>,
  array<string>,
  bool,
  CapturedFaceMatching.guidedCenterIssue => string,
  option<Null.t<CubeTypes.orientationSolution>>,
) => captureReviewPlan
@genType
let highConfidenceColorReadings: (
  Dict.t<captureReviewFace>,
  array<string>,
  array<string>,
  array<string>,
) => bool
@genType
let canSkipColorReview: (
  Dict.t<captureReviewFace>,
  array<string>,
  bool,
  array<string>,
  array<string>,
) => bool
@genType
let readyAssemblyAfterCapture: (
  Dict.t<captureReviewFace>,
  array<string>,
  array<string>,
  array<string>,
) => Null.t<CubeTypes.orientationSolution>

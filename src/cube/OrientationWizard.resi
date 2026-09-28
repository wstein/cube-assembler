@genType let preferredGuidedArrangementIndex: array<CubeTypes.guidedArrangement> => int
@genType let wizardFaceOrder: array<CubeState.faceKey>
@genType let faceContentKey: CubeTypes.grid => string
@genType let pickWizardFace: array<CubeTypes.orientedCandidate> => Null.t<CubeState.faceKey>

@genType
type wizardOption = {grid: CubeTypes.grid, candidates: array<CubeTypes.orientedCandidate>}

@genType
let groupWizardOptions: (
  array<CubeTypes.orientedCandidate>,
  CubeState.faceKey,
) => array<wizardOption>

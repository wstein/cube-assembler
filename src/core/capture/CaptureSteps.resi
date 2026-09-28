@genType let faceOrder: array<string>

@genType
type captureStep = {label: string, short: string, instruction: string}

@genType let captureSteps: array<captureStep>
@genType let captureInstruction: (int, bool) => string
@genType let guidedProtocol: string
@genType let describeCenterIssue: CapturedFaceMatching.guidedCenterIssue => string
@genType let faceDisplayLabel: Dict.t<string>
@genType let faceShortLabel: Dict.t<string>

@genType
type glareSticker = {face: string}

@genType let glareFacesToWarn: array<glareSticker> => array<string>
@genType let colorOrder: array<string>

@genType
type tier = | @as("high") High | @as("medium") Medium | @as("low") Low

@genType let confidenceTier: float => tier

@genType @tag("ok")
type captureStep =
  | @as(true)
  Captured({
      faces: Dict.t<CaptureFlow.faceCaptureData>,
      assignedFace: string,
      message: string,
      lastColors: Null.t<array<array<string>>>,
      lastPose: Null.t<AutoCapture.turnCuePose>,
      nextFace: Null.t<string>,
      turnCue: Null.t<CaptureFlow.turnCue>,
    })
  | @as(false) Invalid({message: string})

@genType
let captureStep: (
  Dict.t<CaptureFlow.faceCaptureData>,
  string,
  CaptureFlow.faceCaptureReading,
  CaptureFlow.source,
  option<CaptureFlow.cameraSettings>,
  option<CaptureFlow.previewColorProfile>,
  int,
  bool,
  float,
) => captureStep

@genType
type sessionView = {
  predictedCenters: array<Null.t<string>>,
  predictedCenter: Null.t<string>,
  centerRoutingActive: bool,
  repeatedNetFaces: array<string>,
  warning: Null.t<CaptureFlow.captureWarning>,
}

@genType
let sessionView: (Dict.t<CaptureFlow.faceCaptureData>, string, int, array<string>) => sessionView

// The capture flow's decisions: typed entry point for
// src/core/capture/CaptureFlow.res. Only the functions that default `now`
// to the current time need wrappers; the rest are the generated ones.
import {
  cubeCaptureFaces as cubeCaptureFacesRes,
  placeFaceCapture as placeFaceCaptureRes,
  solvedCaptureFaces as solvedCaptureFacesRes,
  type faceCaptureReading,
  type placed,
  type source,
} from '../../core/capture/CaptureFlow.gen'
import {
  captureStep as captureStepRes,
  type captureStep as step,
} from '../../core/capture/CaptureSession.gen'
import type { CubeState } from '../../cube/cubeAssembly'
import type {
  CameraSettings,
  FaceCaptureData,
  PreviewColorProfile,
} from './captureTypes'

export {
  captureEvidence,
  captureWarning,
  capturedFaceMessage,
  checkParity,
  isGuidedCapture,
  nextTurnCue,
  parityStatus,
  parseCubeInput,
  turnCuePose,
} from '../../core/capture/CaptureFlow.gen'
export { sessionView } from '../../core/capture/CaptureSession.gen'

export type {
  captureWarning as CaptureWarning,
  faceCaptureReading as FaceCaptureReading,
  turnCue as TurnCue,
} from '../../core/capture/CaptureFlow.gen'
export type { captureStep as CaptureStep } from '../../core/capture/CaptureSession.gen'

type Faces = Record<string, FaceCaptureData>

// Captured faces for a cube that was typed or picked rather than
// photographed, fully confident.
export function cubeCaptureFaces(
  cube: CubeState,
  size: number,
  now = Date.now(),
): Faces {
  return cubeCaptureFacesRes(cube, size, now)
}

export function solvedCaptureFaces(size: number, now = Date.now()): Faces {
  return solvedCaptureFacesRes(size, now)
}

// Stores a reading in the slot its center belongs to, which may not be the
// requested one on odd cubes; a face placed elsewhere is out of order.
export function placeFaceCapture(
  faces: Faces,
  face: string,
  reading: faceCaptureReading,
  source: source,
  cameraSettings?: CameraSettings,
  previewColorProfile?: PreviewColorProfile,
  now = Date.now(),
): placed {
  return placeFaceCaptureRes(
    faces,
    face,
    reading,
    source,
    cameraSettings,
    previewColorProfile,
    now,
  )
}

// What storing a reading for `face` does: the slot it lands in, what to
// say, the next face (null once all six are in) and the turn cue before
// it, which needs the camera and motion.
export function captureStep(
  faces: Faces,
  face: string,
  reading: faceCaptureReading,
  source: source,
  cameraSettings: CameraSettings | undefined,
  previewColorProfile: PreviewColorProfile | undefined,
  size: number,
  reducedMotion: boolean,
  now = Date.now(),
): step {
  return captureStepRes(
    faces,
    face,
    reading,
    source,
    cameraSettings,
    previewColorProfile,
    size,
    reducedMotion,
    now,
  )
}

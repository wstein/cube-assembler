// The capture flow's decisions: typed entry point for
// src/core/capture/CaptureFlow.res.
import {
  captureEvidence as captureEvidenceRes,
  captureWarning as captureWarningRes,
  capturedFaceMessage as capturedFaceMessageRes,
  checkParity as checkParityRes,
  cubeCaptureFaces as cubeCaptureFacesRes,
  isGuidedCapture as isGuidedCaptureRes,
  nextTurnCue as nextTurnCueRes,
  parityStatus as parityStatusRes,
  parseCubeInput as parseCubeInputRes,
  placeFaceCapture as placeFaceCaptureRes,
  solvedCaptureFaces as solvedCaptureFacesRes,
  turnCuePose as turnCuePoseRes,
} from '../core/capture/CaptureFlow.gen'
import {
  captureStep as captureStepRes,
  sessionView as sessionViewRes,
} from '../core/capture/CaptureSession.gen'
import type { CubeState } from '../cube/cubeAssembly'
import type { ParityResult } from '../cube/parity'
import type { TurnCuePose } from './autoCapture'
import type { FaceCaptureData, PreviewColorProfile } from './captureTypes'
import type { PaletteEvidence } from './colorProfileLearning'
import type { FaceCaptureResult, RGB } from './imageProcessing'

type Faces = Record<string, FaceCaptureData>
type FacesRes = Parameters<typeof isGuidedCaptureRes>[0]
const toRes = (faces: Faces) => faces as unknown as FacesRes
const fromRes = (faces: FacesRes) => faces as unknown as Faces

export function checkParity(cube: CubeState, size: number): ParityResult {
  return checkParityRes(cube, size) as ParityResult
}

// The parity check's verdict, or its error as an invalid result.
export function parityStatus(cube: CubeState, size: number): ParityResult {
  return parityStatusRes(cube, size) as ParityResult
}

// Captured faces for a cube that was typed or picked rather than
// photographed, fully confident.
export function cubeCaptureFaces(
  cube: CubeState,
  size: number,
  now = Date.now(),
): Faces {
  return fromRes(cubeCaptureFacesRes(cube, size, now))
}

export function solvedCaptureFaces(size: number, now = Date.now()): Faces {
  return fromRes(solvedCaptureFacesRes(size, now))
}

type NotationFormat = 'wrg' | 'urf'

// Reads typed facelets or an Orbit64 token. The format is detected from the
// text where it can be, else the selected one is used.
export function parseCubeInput(
  input: string,
  selectedFormat: NotationFormat,
):
  | { ok: true; cube: CubeState; format: NotationFormat }
  | { ok: false; message: string } {
  return parseCubeInputRes(input, selectedFormat)
}

export interface FaceCaptureReading {
  colors: string[][]
  confidence: number
  cellConfidences?: number[][]
  cellColors?: RGB[][]
  croppedImage?: string
  backgroundColor?: RGB | null
  frame?: FaceCaptureResult['frame']
  crop?: FaceCaptureResult['crop']
  sharpness?: number
}

// Stores a reading in the slot its center belongs to, which may not be the
// requested one on odd cubes; a face placed elsewhere is out of order.
export function placeFaceCapture(
  faces: Faces,
  face: string,
  reading: FaceCaptureReading,
  source: 'camera' | 'image-file',
  cameraSettings?: Partial<MediaTrackSettings>,
  previewColorProfile?: PreviewColorProfile,
  now = Date.now(),
): { faces: Faces; assignedFace: string; unexpectedCenter: boolean } {
  const placed = placeFaceCaptureRes(
    toRes(faces),
    face,
    reading,
    source,
    cameraSettings as Parameters<typeof placeFaceCaptureRes>[4],
    previewColorProfile,
    now,
  )
  return { ...placed, faces: fromRes(placed.faces) }
}

export function capturedFaceMessage(
  face: string,
  confidence: number,
  unexpectedCenter: boolean,
): string {
  return capturedFaceMessageRes(face, confidence, unexpectedCenter)
}

// Where the captured face sat in the camera frame, so the turn cue can
// tell a turned cube from one still showing the same face.
export function turnCuePose(
  crop: FaceCaptureResult['crop'] | undefined,
): TurnCuePose | null {
  return turnCuePoseRes(crop)
}

export interface TurnCue {
  step: number
  startColors: string[][]
  viaColors?: string[][]
}

// The turn to show before the next face; none once a face landed out of
// order.
export function nextTurnCue(
  faces: Faces,
  nextFace: string,
  startColors: string[][],
): TurnCue | null {
  return nextTurnCueRes(toRes(faces), nextFace, startColors)
}

// Whether the faces followed the guided protocol.
export function isGuidedCapture(
  faces: Faces,
  uploadedProtocol: string | null,
): boolean {
  return isGuidedCaptureRes(toRes(faces), uploadedProtocol)
}

export interface CaptureWarning {
  text: string
  key: string
  retake: number
}

// A likely capture mistake visible while capturing - only a hint.
export function captureWarning(
  faces: Faces,
  repeatedFaces: Array<[number, number]>,
  size: number,
  dismissed: string[],
): CaptureWarning | null {
  return captureWarningRes(toRes(faces), repeatedFaces, size, dismissed)
}

// How far a reviewed capture's learned colors can be trusted.
export function captureEvidence(
  faces: Faces,
  size: number,
  reviewedValid: boolean,
  palette: { recalibrated: boolean; confidentFraction: number },
): PaletteEvidence {
  return captureEvidenceRes(toRes(faces), size, reviewedValid, palette)
}

export type CaptureStep =
  | {
      ok: true
      faces: Faces
      assignedFace: string
      message: string
      lastColors: string[][] | null
      lastPose: TurnCuePose | null
      nextFace: string | null
      turnCue: TurnCue | null
    }
  | { ok: false; message: string }

// What storing a reading for `face` does: the slot it lands in, what to
// say, the next face (null once all six are in) and the turn cue before
// it, which needs the camera and motion.
export function captureStep(
  faces: Faces,
  face: string,
  reading: FaceCaptureReading,
  source: 'camera' | 'image-file',
  cameraSettings: Partial<MediaTrackSettings> | undefined,
  previewColorProfile: PreviewColorProfile | undefined,
  size: number,
  reducedMotion: boolean,
  now = Date.now(),
): CaptureStep {
  const step = captureStepRes(
    toRes(faces),
    face,
    reading,
    source,
    cameraSettings as Parameters<typeof captureStepRes>[4],
    previewColorProfile,
    size,
    reducedMotion,
    now,
  )
  return step.ok ? { ...step, faces: fromRes(step.faces) } : step
}

// What the session shows around the captured faces: predicted centers,
// whether odd-cube center routing is active, repeated faces, a warning.
export function sessionView(
  faces: Faces,
  webcamFace: string,
  size: number,
  dismissed: string[],
): {
  predictedCenters: Array<string | null>
  predictedCenter: string | null
  centerRoutingActive: boolean
  repeatedNetFaces: string[]
  warning: CaptureWarning | null
} {
  return sessionViewRes(toRes(faces), webcamFace, size, dismissed)
}

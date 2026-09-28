// Cube state assembly from captured faces, and the search for each face's
// identity and rotation: typed entry point for CubeAssembly.res.

import {
  assembleCubeFromFaces as assembleCubeFromFacesRes,
  orientationFreeSignature as orientationFreeSignatureRes,
  solveFaceOrientations as solveFaceOrientationsRes,
  solveGuidedCapture as solveGuidedCaptureRes,
} from './CubeAssembly.gen'
import type { GuidedCapture, GuidedSolution } from './guidedCaptureSetup'
import type { cubeState as CubeState } from './CubeState.gen'
export type {
  cubeState as CubeState,
  cubeIR as CubeIR,
  faceKey as FaceKey,
} from './CubeState.gen'

export {
  predictGuidedCenters,
  captureCenterSlots,
  captureSlotForCenter,
  placeCapturedFace,
} from './guidedCaptureSetup'
export type {
  GuidedCapture,
  GuidedArrangement,
  GuidedSolution,
} from './guidedCaptureSetup'
export {
  checkGuidedCenters,
  findCapturedFaceMatch,
  findCaptureSlotForOrientedFace,
  findRepeatedFaces,
  validateFaceColors,
  createSolvedCube,
} from './capturedFaceMatching'
export type { GuidedCenterIssue, FaceMatchSample } from './capturedFaceMatching'

type FaceKey = import('./CubeState.gen').faceKey

// Flattens captured faces into a cube state; missing faces read as solved.
export function assembleCubeFromFaces(
  faces: Record<string, string[][]>,
  size = 3,
): CubeState {
  return assembleCubeFromFacesRes(faces, size)
}

export interface OrientedCandidate {
  faces: Record<FaceKey, string[][]>
  rotations: Record<FaceKey, number>
}

export interface OrientationSolution {
  faces: Record<FaceKey, string[][]>
  rotations: Record<FaceKey, number>
  cornerScore: number // out of 8
  // Out of 12 - NaN on a 2x2, which has no edge pieces at all; callers
  // must check before displaying it.
  edgeScore: number
  // Distinct pieces, correct orientation sums and matching permutation
  // parity - what makes the assembled cube physically reachable. A perfect
  // cornerScore/edgeScore alone doesn't imply it.
  fullyValid: boolean
  // Every distinct candidate tied for the winning score, deduped by sticker
  // content; `faces`/`rotations` mirror alternatives[0]. More than one means
  // the capture is genuinely ambiguous, which only the person holding the
  // cube can resolve.
  alternatives: OrientedCandidate[]
  // True when more distinct tied candidates existed than were kept, so
  // `alternatives` is not the complete set and callers must say so.
  truncated: boolean
}

// Identifies each captured face and solves for the rotation of each that
// makes the most corners valid, using edges only to break ties. Odd sizes
// get identity from each fixed center; even sizes search for it jointly
// with rotation. Null if face identity can't be determined at all.
export function solveFaceOrientations(
  capturedFaces: Record<string, string[][]>,
): OrientationSolution | null {
  return solveFaceOrientationsRes(capturedFaces) as OrientationSolution | null
}

// Same content held differently is the same cube: the smallest signature
// over all 24 orientations identifies it regardless of how it's held.
export function orientationFreeSignature(
  faces: Record<FaceKey, string[][]>,
): string {
  return orientationFreeSignatureRes(faces)
}

// The 64 arrangements a guided capture allows, best first, in standard
// orientation; null when a photo is missing or sizes differ.
export function solveGuidedCapture(
  capture: GuidedCapture,
): GuidedSolution | null {
  return solveGuidedCaptureRes(capture) as GuidedSolution | null
}

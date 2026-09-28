// Capture checks on raw photos: center mistakes, repeated faces and valid
// colors. Typed entry point for CapturedFaceMatching.res.
import {
  checkGuidedCenters as checkGuidedCentersRes,
  createSolvedCube as createSolvedCubeRes,
  findCaptureSlotForOrientedFace as findCaptureSlotForOrientedFaceRes,
  findCapturedFaceMatch as findCapturedFaceMatchRes,
  findRepeatedFaces as findRepeatedFacesRes,
  validateFaceColors as validateFaceColorsRes,
} from './CapturedFaceMatching.gen'
import type { cubeState as CubeState } from './CubeState.gen'

// Photo positions in a guided capture: 0-3 the sides, 4-5 top/bottom.
export type GuidedCenterIssue =
  | { kind: 'same-center'; photos: [number, number] }
  | { kind: 'turned-twice'; photo: number }
  | { kind: 'not-opposite'; photos: [number, number] }

type Photos = Array<string[][] | undefined>

// Odd sizes only: capture mistakes the centers alone reveal.
export function checkGuidedCenters(photos: Photos): GuidedCenterIssue[] {
  return checkGuidedCentersRes(photos) as GuidedCenterIssue[]
}

export interface FaceMatchSample {
  colors: string[][]
}

// A face already saved in a different slot with the same stickers.
export function findCapturedFaceMatch(
  captures: Array<FaceMatchSample | undefined>,
  candidate: FaceMatchSample,
  excludeIndex = -1,
): number | null {
  return findCapturedFaceMatchRes(captures, candidate, excludeIndex)
}

// The photo behind a net face, even when it was rotated in assembly.
export function findCaptureSlotForOrientedFace(
  captures: Photos,
  face: string[][],
): number | null {
  return findCaptureSlotForOrientedFaceRes(captures, face)
}

// Pairs of photos that look like the same face taken twice.
export function findRepeatedFaces(photos: Photos): Array<[number, number]> {
  return findRepeatedFacesRes(photos)
}

export function validateFaceColors(colors: string[][], size = 3): boolean {
  return validateFaceColorsRes(colors, size)
}

export function createSolvedCube(size = 3): CubeState {
  return createSolvedCubeRes(size)
}

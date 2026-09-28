// Guided capture: the 4 side faces photographed in order while turning the
// cube, then top and bottom in either order and at any rotation. Typed
// entry point for GuidedCaptureSetup.res.
import {
  captureCenterSlots as captureCenterSlotsRes,
  captureSlotForCenter as captureSlotForCenterRes,
  placeCapturedFace as placeCapturedFaceRes,
  predictGuidedCenters as predictGuidedCentersRes,
} from './GuidedCaptureSetup.gen'
import type { OrientationSolution } from './cubeAssembly'

export interface GuidedCapture {
  // The 4 side photos in capture order, each taken upright.
  sides: [string[][], string[][], string[][], string[][]]
  // The two remaining photos in capture order - top and bottom, either way
  // round, each at any rotation.
  caps: [string[][], string[][]]
}

// How the photos were put together for one arrangement.
export interface GuidedArrangement {
  // Which way the cube was turned between side photos: 'left' means the
  // face that was on the right came to the front next.
  turn: 'left' | 'right'
  // True if the second of the two cap photos is the top.
  capsSwapped: boolean
  // Quarter turns clockwise applied to cap photo 1 and 2.
  capRotations: [number, number]
}

export interface GuidedSolution extends OrientationSolution {
  // Parallel to `alternatives`: how each was put together.
  arrangements: GuidedArrangement[]
}

type Photos = Array<string[][] | undefined>

// Each photo slot's predicted center color from the centers measured so
// far (odd sizes only).
export function predictGuidedCenters(photos: Photos): Array<string | null> {
  return predictGuidedCentersRes(photos)
}

// The center color reserved for each capture slot once the first two
// photos are in.
export function captureCenterSlots(photos: Photos): Array<string | null> {
  return captureCenterSlotsRes(photos)
}

// The slot a new photo belongs in, or null for a duplicate center.
export function captureSlotForCenter(
  photos: Photos,
  requestedIndex: number,
  candidate: string[][],
): number | null {
  return captureSlotForCenterRes(photos, requestedIndex, candidate)
}

// Where a new photo goes; one fitting no free slot stays where it was
// captured, flagged.
export function placeCapturedFace(
  photos: Photos,
  requestedIndex: number,
  candidate: string[][],
): { index: number; unexpectedCenter: boolean } {
  return placeCapturedFaceRes(photos, requestedIndex, candidate)
}

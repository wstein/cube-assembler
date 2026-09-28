// The orientation wizard: narrows tied arrangements down to one, one face
// at a time. Typed entry point for OrientationWizard.res.
import {
  faceContentKey as faceContentKeyRes,
  groupWizardOptions as groupWizardOptionsRes,
  pickWizardFace as pickWizardFaceRes,
  preferredGuidedArrangementIndex as preferredGuidedArrangementIndexRes,
  wizardFaceOrder,
} from './OrientationWizard.gen'
import type {
  FaceKey,
  GuidedArrangement,
  OrientedCandidate,
} from './cubeAssembly'

// Which guided arrangement to ask about first.
export function preferredGuidedArrangementIndex(
  arrangements: GuidedArrangement[],
): number {
  return preferredGuidedArrangementIndexRes(arrangements)
}

export const WIZARD_FACE_ORDER: FaceKey[] = wizardFaceOrder

export function faceContentKey(colors: string[][]): string {
  return faceContentKeyRes(colors)
}

// The face worth asking about next, or null once every face agrees.
export function pickWizardFace(remaining: OrientedCandidate[]): FaceKey | null {
  return pickWizardFaceRes(remaining)
}

// The remaining candidates grouped by their grid for `face`.
export function groupWizardOptions(
  remaining: OrientedCandidate[],
  face: FaceKey,
): { grid: string[][]; candidates: OrientedCandidate[] }[] {
  return groupWizardOptionsRes(remaining, face) as {
    grid: string[][]
    candidates: OrientedCandidate[]
  }[]
}

import type { FaceKey } from '../../cube/cubeAssembly'

export const CANONICAL_FACE_NAMES: Record<FaceKey, string> = {
  F: 'Front',
  R: 'Right',
  B: 'Back',
  L: 'Left',
  U: 'Up',
  D: 'Down',
}

export const canonicalFaceName = (face: string): string =>
  CANONICAL_FACE_NAMES[face.toUpperCase() as FaceKey] ?? face

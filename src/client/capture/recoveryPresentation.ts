// A presentation adapter, not a second cube state. The app keeps its logical
// cube; the existing viewport receives a derived frame and returns through its
// exact inverse. All picking and the axis indicator see that same frame.
import {
  assembleCubeFromFaces,
  type CubeState,
  type FaceKey,
} from '../../cube/cubeAssembly'
import { transformFaces } from './captureFaceMapping'
import type { CaptureRecovery } from './captureRecovery'
const KEYS: FaceKey[] = ['U', 'R', 'F', 'D', 'L', 'B']
export function cubeFaces(
  cube: CubeState,
  size: number,
): Record<FaceKey, string[][]> {
  return Object.fromEntries(
    KEYS.map((f) => {
      const values = cube[f.toLowerCase() as keyof CubeState]
      return [
        f,
        Array.from({ length: size }, (_, row) =>
          values.slice(row * size, (row + 1) * size),
        ),
      ]
    }),
  ) as Record<FaceKey, string[][]>
}
export function presentationCube(
  cube: CubeState,
  size: number,
  recovery: CaptureRecovery | null,
  inverse = false,
): CubeState {
  if (!recovery || recovery.view !== 'capture') return cube
  const index = inverse
    ? recovery.captureFrame.canonicalTransform
    : recovery.captureFrame.displayTransform
  const faces = transformFaces(cubeFaces(cube, size), index)
  if (!faces) throw new Error('Invalid recorded display transform')
  return assembleCubeFromFaces(faces, size)
}

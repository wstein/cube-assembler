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

// A proper spatial rotation maps an outward face normal to another face;
// clockwise direction and layer depth remain unchanged. Face identities are
// transformed by the same authoritative ReScript geometry as sticker grids.
export function presentationMoves(
  moves: import('../view3d/cubeView3DState').CubeTurn[],
  recovery: CaptureRecovery | null,
  inverse = false,
): import('../view3d/cubeView3DState').CubeTurn[] {
  if (!recovery || recovery.view !== 'capture') return moves
  const labels = Object.fromEntries(KEYS.map((f) => [f, [[f]]])) as Record<
    FaceKey,
    string[][]
  >
  const transformed = transformFaces(
    labels,
    inverse
      ? recovery.captureFrame.canonicalTransform
      : recovery.captureFrame.displayTransform,
  )!
  return moves.map((move) => ({
    ...move,
    face: KEYS.find((f) => transformed[f][0][0] === move.face)!,
  }))
}

export function presentationColorFrame(
  frame: import('../../core/view/AxisGizmo.gen').colorFrame,
  recovery: CaptureRecovery | null,
  inverse = false,
): import('../../core/view/AxisGizmo.gen').colorFrame {
  const cube = Object.fromEntries(
    KEYS.map((f) => [
      f.toLowerCase(),
      [frame[f.toLowerCase() as keyof typeof frame]],
    ]),
  ) as CubeState
  const shown = presentationCube(cube, 1, recovery, inverse)
  return Object.fromEntries(
    KEYS.map((f) => [
      f.toLowerCase(),
      shown[f.toLowerCase() as keyof CubeState][0],
    ]),
  ) as typeof frame
}

export function sameCubeState(left: CubeState, right: CubeState): boolean {
  return KEYS.every((f) => {
    const key = f.toLowerCase() as keyof CubeState
    return (
      left[key].length === right[key].length &&
      left[key].every((value, i) => value === right[key][i])
    )
  })
}

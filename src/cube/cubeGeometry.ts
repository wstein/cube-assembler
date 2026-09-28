// Typed entry point for the ReScript sticker geometry. Its data is already
// indexed by the six face letters, so no runtime conversion is needed.
import {
  allOrientations as allOrientationsRes,
  rotateCube as rotateCubeRes,
  rotateGrid as rotateGridRes,
  solvedCubeFaces as solvedCubeFacesRes,
  turnFace as turnFaceRes,
} from './CubeGeometry.gen'
import type { FaceKey } from './cubeAssembly'

export type Faces = Record<FaceKey, string[][]>
export type Axis = 'x' | 'y' | 'z'

export function rotateCube(
  faces: Faces,
  axis: Axis,
  quarterTurns: number,
): Faces {
  return rotateCubeRes(faces, axis, quarterTurns) as Faces
}

export function turnFace(
  faces: Faces,
  face: FaceKey,
  quarterTurns: number,
  depth = 1,
): Faces {
  return turnFaceRes(faces, face, quarterTurns, depth) as Faces
}

export function allOrientations(faces: Faces): Faces[] {
  return allOrientationsRes(faces) as Faces[]
}

export function solvedCubeFaces(
  n: number,
  colors: Record<FaceKey, string>,
): Faces {
  return solvedCubeFacesRes(n, colors) as Faces
}

// Turns a face grid clockwise by quarter turns, as a new grid.
export function rotateGrid(
  grid: string[][],
  quarterTurnsClockwise: number,
): string[][] {
  return rotateGridRes(grid, quarterTurnsClockwise)
}

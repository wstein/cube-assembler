// Typed entry point for the ReScript cube move model (CubeMoves.res): turns
// of layers, blocks and the whole cube, their notation, the move history
// and scrambles.
import {
  applyCubeLayerMove as applyCubeLayerMoveRes,
  applyCubeMove as applyCubeMoveRes,
  cubeStateToFaces as cubeStateToFacesRes,
  facesToCubeState as facesToCubeStateRes,
  formatCubeTurn as formatCubeTurnRes,
  generateScrambleMoves as generateScrambleMovesRes,
  recordTurn as recordTurnRes,
  type cubeTurn,
  type scrambleLength,
} from './CubeMoves.gen'
import type { CubeState, FaceKey } from './cubeAssembly'
import type { Faces } from './cubeGeometry'

export type CubeTurn = cubeTurn
export type ScrambleLength = scrambleLength

export function cubeStateToFaces(cube: CubeState, n: number): Faces {
  return cubeStateToFacesRes(cube, n) as Faces
}

export function facesToCubeState(faces: Faces): CubeState {
  return facesToCubeStateRes(faces)
}

export function applyCubeMove(
  cube: CubeState,
  n: number,
  face: FaceKey,
  quarterTurns = 1,
): CubeState {
  return applyCubeMoveRes(cube, n, face, quarterTurns)
}

// Turns `width` layers ending `depth` layers in from `face` (a single slice
// by default).
export function applyCubeLayerMove(
  cube: CubeState,
  n: number,
  face: FaceKey,
  depth: number,
  quarterTurns = 1,
  width = 1,
): CubeState {
  return applyCubeLayerMoveRes(cube, n, face, depth, quarterTurns, width)
}

export function formatCubeTurn(
  turn: CubeTurn,
  size = Number.POSITIVE_INFINITY,
): string {
  return formatCubeTurnRes(turn, size)
}

export function recordTurn(moves: CubeTurn[], turn: CubeTurn): CubeTurn[] {
  return recordTurnRes(moves, turn)
}

export function generateScrambleMoves(
  size: number,
  options: { length?: ScrambleLength; innerLayers?: boolean } = {},
  random: () => number = Math.random,
): CubeTurn[] {
  return generateScrambleMovesRes(size, options, random)
}

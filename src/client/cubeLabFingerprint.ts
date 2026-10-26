// The CubeLab moves block: typed entry point for the ReScript module
// src/core/view/CubeLabFingerprint.res.
import {
  escapeForScript,
  format,
  json,
  movesText,
  payload,
  type payload as CubeLabMovesPayload,
} from '../core/view/CubeLabFingerprint.gen'
import type { CubeTurn } from '../cube/cubeMoves'

export type { CubeLabMovesPayload }
export const CUBELAB_MOVES_FORMAT = format
export const CUBELAB_MOVES_ID = 'cubelab-moves'
export const cubeLabMovesText = (moves: CubeTurn[], size: number): string =>
  movesText(moves, size)
export const cubeLabMovesPayload = (
  moves: CubeTurn[],
  size: number,
): CubeLabMovesPayload => payload(moves, size)
export const cubeLabMovesJson = (moves: CubeTurn[], size: number): string =>
  json(moves, size)
export const escapeScriptJson = (text: string): string => escapeForScript(text)

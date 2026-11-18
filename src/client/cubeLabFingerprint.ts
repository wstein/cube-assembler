// The CubeLab moves block: typed entry point for the ReScript module
// src/core/view/CubeLabFingerprint.res.
import {
  escapeForScript,
  format,
  formatFor,
  formatV2,
  maxSizeV1,
  json,
  movesText,
  payload,
  type payload as CubeLabMovesPayload,
} from '../core/view/CubeLabFingerprint.gen'
import type { CubeTurn } from '../cube/cubeMoves'

export type { CubeLabMovesPayload }
export const CUBELAB_MOVES_FORMAT = format
export const CUBELAB_MOVES_FORMAT_V2 = formatV2
export const CUBELAB_MAX_SIZE_V1 = maxSizeV1
export const cubeLabMovesFormat = (size: number): string => formatFor(size)
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

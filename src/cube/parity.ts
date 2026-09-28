// Cube validity (color balance, corners, edges, wings and their parity)
// with the stickers to point at when a check fails: typed entry point for
// Parity.res. The orientation search keeps its own faster mirror of these
// rules in CubeAssembly.res.
import {
  runFullParity as runFullParityRes,
  validateWingEdges as validateWingEdgesRes,
} from './Parity.gen'
import type { CubeIR } from './cubeAssembly'

export type FaceColor = 'W' | 'O' | 'G' | 'R' | 'B' | 'Y'

export type FaceletRef = { face: string; index: number }
// One corner/edge/wing reading implicated in a failure; entries sharing a
// `group` are the candidates to cross-highlight for "which one is misread".
export type HighlightGroup = { group: string; facelets: FaceletRef[] }
export type ParityResult = {
  valid: boolean
  result: string
  checks: Record<string, boolean>
  // The stickers implicated in `result`, when the failure is local enough
  // to point at; omitted for global failures.
  highlight?: HighlightGroup[]
  // More explanation of `result`, where there is more to say.
  detail?: string
}

// Wing stickers checked by counting: every pair a real one, each N-2 times.
export function validateWingEdges(cube: CubeIR): {
  valid: boolean
  result?: string
  highlight?: HighlightGroup[]
} {
  return validateWingEdgesRes(cube) as {
    valid: boolean
    result?: string
    highlight?: HighlightGroup[]
  }
}

export function runFullParity(cube: CubeIR): ParityResult {
  return runFullParityRes(cube) as ParityResult
}

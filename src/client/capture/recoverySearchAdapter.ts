import {
  Recovery,
  snapshot,
  type capture,
  type candidateInput,
  type projection,
} from '@puzlwerk/capture-recovery'
import { initializeMapping, validateMapping } from './captureFaceMapping'
import type { FaceCaptureData } from './captureTypes'

export type CapturedPhotos = Record<string, FaceCaptureData>

// Temporary checker boundary: all search, source identity and review decisions
// remain in PuzlWerk. Existing CubeAssembler ReScript reports only its checks.
export function recoveryChecker(faces: CapturedPhotos, size: number) {
  const grids = Object.fromEntries(
    Object.entries(faces).map(([slot, face]) => [slot, face.colors]),
  )
  return (
    _candidate: candidateInput,
    projected: projection[],
  ): Recovery.assessment => {
    const result = validateMapping(
      grids,
      projected.map(({ slot, target, quarterTurns }) => ({
        slot,
        target,
        quarterTurns,
      })),
      size,
    )
    return {
      feasibility: {
        status: result.valid ? 'pass' : 'fail',
        checkerId: 'CubeAssembler.CaptureFaceMapping.validateMapping',
        sourceRevision: '722f8ffe6428ebb27dae1d66bb98569a57e334ec',
        scope:
          size >= 4
            ? 'Existing corner, wing and orbit checks; full NxN reachability unverified'
            : 'Existing CubeAssembler parity checks',
        issues: result.issues,
      },
      wire: undefined,
    }
  }
}

export function recoveryRequest(
  current: capture,
  faces: CapturedPhotos,
  action = 'findMatchingCube',
  maxEvaluated = 5000,
): Recovery.request {
  const captured = snapshot(current)
  const grids = Object.fromEntries(
    Object.entries(faces).map(([slot, face]) => [slot, face.colors]),
  )
  // Existing ReScript resolves fixed-center targets; this adapter transports
  // that report rather than introducing a second color/face convention.
  const initial = initializeMapping(grids, null)
  return {
    action,
    searchId: crypto.randomUUID(),
    maxEvaluated,
    maxCandidates: 8,
    centers:
      captured.size % 2
        ? initial.map(({ slot, target }) => ({
            target,
            color:
              grids[slot][Math.floor(captured.size / 2)][
                Math.floor(captured.size / 2)
              ],
          }))
        : [],
    reviewedGrids: {
      captureRevision: captured.revision,
      grids: captured.observations.map(({ photoId, slot }) => ({
        photoId,
        grid: grids[slot],
      })),
    },
  }
}

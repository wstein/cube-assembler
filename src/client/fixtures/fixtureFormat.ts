// Reading the colors out of a saved fixture's meta.json, current or
// earlier format: typed entry point for src/core/capture/FixtureFormat.res.
import {
  readFixtureAssembled as readFixtureAssembledRes,
  readFixtureColors as readFixtureColorsRes,
} from '../../core/capture/FixtureFormat.gen'

export interface FixtureColors {
  // The human-verified colors per slot, keyed U..B.
  colors: Record<string, string[][]>
  // What detection produced before hand corrections, if recorded.
  detected: Record<string, string[][]> | null
}

// Null when the meta has neither format (or colors of the wrong size).
export function readFixtureColors(meta: {
  gridSize?: unknown
  colorsURFDLB?: unknown
  detectedURFDLB?: unknown
  faces?: Record<string, Record<string, unknown>>
}): FixtureColors | null {
  return readFixtureColorsRes(meta)
}

// The cube the fixture's photos were approved as, keyed U..B; null if the
// meta does not say.
export function readFixtureAssembled(meta: {
  gridSize?: unknown
  capture?: { assembledURFDLB?: unknown } | null
}): Record<string, string[][]> | null {
  return readFixtureAssembledRes(meta)
}

// Reading the colors out of a saved fixture's meta.json, in either format:
//   current - colorsURFDLB / detectedURFDLB, one WRG facelets string each;
//   earlier - per face, faces.u.colors / faces.u.detected as row arrays
//             (fixtures saved before 97efa6d, e.g. by an older checkout).
// Both are keyed by capture slot U..B (the photos' capture order).

import { wrgFaceletsToGrids } from './notationOutput'

const SLOTS = ['u', 'r', 'f', 'd', 'l', 'b']
const COLORS = new Set(['W', 'Y', 'O', 'R', 'G', 'B'])

export interface FixtureColors {
  // The human-verified colors per slot, keyed U..B.
  colors: Record<string, string[][]>
  // What detection produced before hand corrections, if recorded.
  detected: Record<string, string[][]> | null
}

function isGrid(value: unknown, n: number): value is string[][] {
  return Array.isArray(value) && value.length === n
    && value.every((row) => Array.isArray(row) && row.length === n && row.every((c) => COLORS.has(c)))
}

// Per-face grids from the earlier format, or null unless all 6 are there.
function perFace(faces: Record<string, Record<string, unknown>> | undefined, key: string, n: number): Record<string, string[][]> | null {
  const grids = SLOTS.map((slot) => faces?.[slot]?.[key])
  if (!grids.every((g) => isGrid(g, n))) return null
  return Object.fromEntries(SLOTS.map((slot, i) => [slot.toUpperCase(), grids[i] as string[][]]))
}

function fromString(value: unknown, n: number): Record<string, string[][]> | null {
  const grids = typeof value === 'string' ? wrgFaceletsToGrids(value) : null
  return grids && grids.U.length === n ? grids : null
}

// Null when the meta has neither format (or colors of the wrong size).
export function readFixtureColors(meta: {
  gridSize?: unknown
  colorsURFDLB?: unknown
  detectedURFDLB?: unknown
  faces?: Record<string, Record<string, unknown>>
}): FixtureColors | null {
  const n = meta.gridSize
  if (typeof n !== 'number') return null
  const colors = fromString(meta.colorsURFDLB, n) ?? perFace(meta.faces, 'colors', n)
  if (!colors) return null
  const detected = fromString(meta.detectedURFDLB, n) ?? perFace(meta.faces, 'detected', n)
  return { colors, detected }
}

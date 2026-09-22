/**
 * test/cubeAssembly.test.ts
 * Vitest tests for src/client/cubeAssembly.ts's face-orientation solver.
 *
 * solveFaceOrientations() identifies each of 6 arbitrarily-captured faces
 * and finds the 0/90/180/270 rotation of each that maximizes valid corner
 * cubies first, edge cubies second - see the "Face identity + orientation
 * solving" comment block in cubeAssembly.ts for the full rationale. Odd
 * sizes (3x3, 5x5, 7x7) get identity for free from each face's fixed
 * center sticker; even sizes (2x2, 4x4, 6x6) have no such reference and
 * search for identity jointly with rotation.
 *
 * Run: npx vitest run test/cubeAssembly.test.ts
 */
import { describe, it, expect } from 'vitest'
import { solveFaceOrientations } from '../src/client/cubeAssembly'

const SOLVED_COLOR: Record<string, string> = { U: 'W', R: 'R', F: 'G', D: 'Y', L: 'O', B: 'B' }

function solvedFaces(size: number): Record<string, string[][]> {
  const out: Record<string, string[][]> = {}
  for (const [face, color] of Object.entries(SOLVED_COLOR)) {
    out[face] = Array.from({ length: size }, () => Array(size).fill(color))
  }
  return out
}

function rotateGrid(grid: string[][], turns: number): string[][] {
  let result = grid
  for (let t = 0; t < ((turns % 4) + 4) % 4; t++) {
    const n = result.length
    const next: string[][] = Array.from({ length: n }, () => Array(n).fill(''))
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) next[c][n - 1 - r] = result[r][c]
    }
    result = next
  }
  return result
}

// A real, physically-achievable scramble (one U turn from solved), built
// directly from turn semantics rather than the solver's own tables, so it
// exercises those tables instead of assuming them. Unlike a solved cube
// (every face uniform, so any rotation of it looks identical), this makes
// F/R/B/L non-uniform - the only kind of fixture that can actually tell a
// correctly- from an incorrectly-rotated capture apart.
function uTurnedFaces(size: number): Record<string, string[][]> {
  const solved = solvedFaces(size)
  const turned: Record<string, string[][]> = Object.fromEntries(
    Object.entries(solved).map(([face, grid]) => [face, grid.map((row) => row.slice())])
  )
  turned.F[0] = solved.L[0].slice()
  turned.R[0] = solved.F[0].slice()
  turned.B[0] = solved.R[0].slice()
  turned.L[0] = solved.B[0].slice()
  return turned
}

// Captures faces in an arbitrary order under numeric slot keys ('1'..'6'),
// each pre-rotated by a known amount, mirroring how the app hands the
// solver raw capture-order data with no identity or rotation info attached.
function captureWithRotations(
  faces: Record<string, string[][]>,
  rotationByFace: Record<string, number>
): Record<string, string[][]> {
  const captured: Record<string, string[][]> = {}
  let slot = 1
  for (const [face, grid] of Object.entries(faces)) {
    captured[String(slot)] = rotateGrid(grid, rotationByFace[face])
    slot++
  }
  return captured
}

describe('solveFaceOrientations', () => {
  it.each([3, 5, 7])('resolves a solved %ix%i cube with zero rotation and full validity', (size) => {
    const result = solveFaceOrientations(solvedFaces(size))
    expect(result).not.toBeNull()
    expect(result!.cornerScore).toBe(8)
    expect(result!.edgeScore).toBe(12)
    expect(Object.values(result!.rotations).every((r) => r === 0)).toBe(true)
  })

  it.each([3, 5, 7])('recovers a real one-move scramble (%ix%i, U turn) at full validity', (size) => {
    const captured = captureWithRotations(uTurnedFaces(size), { U: 2, R: 1, F: 3, D: 0, L: 1, B: 2 })
    const result = solveFaceOrientations(captured)
    expect(result).not.toBeNull()
    expect(result!.cornerScore).toBe(8)
    expect(result!.edgeScore).toBe(12)
  })

  it('identifies each face by center color regardless of capture-slot order', () => {
    // Capture slots deliberately do not match U R F D L B order.
    const solved = solvedFaces(3)
    const captured = {
      slotA: solved.B, slotB: solved.U, slotC: solved.D,
      slotD: solved.F, slotE: solved.L, slotF: solved.R,
    }
    const result = solveFaceOrientations(captured)
    expect(result).not.toBeNull()
    expect(result!.faces.U.flat().every((c) => c === 'W')).toBe(true)
    expect(result!.faces.R.flat().every((c) => c === 'R')).toBe(true)
    expect(result!.faces.F.flat().every((c) => c === 'G')).toBe(true)
    expect(result!.faces.D.flat().every((c) => c === 'Y')).toBe(true)
    expect(result!.faces.L.flat().every((c) => c === 'O')).toBe(true)
    expect(result!.faces.B.flat().every((c) => c === 'B')).toBe(true)
  })

  describe('even sizes (no fixed center reference - identity searched jointly with rotation)', () => {
    it.each([2, 4, 6])('resolves a solved %ix%i cube, shuffled and pre-rotated, to full validity', (size) => {
      // Even sizes have no center to key off, so - unlike the odd-size
      // "identifies each face" test above - there's no fixed expected
      // U/R/F/D/L/B identity to assert against; a valid result is any
      // fully-corner-and-edge-valid labeling.
      const captured = captureWithRotations(solvedFaces(size), { U: 3, R: 1, F: 2, D: 0, L: 3, B: 1 })
      const result = solveFaceOrientations(captured)
      expect(result).not.toBeNull()
      expect(result!.cornerScore).toBe(8)
      expect(result!.edgeScore).toBe(12)
    })

    it('resolves a real one-move scramble (4x4, U turn), shuffled and pre-rotated, to full validity', () => {
      // This is the regression case for the reported bug: a real capture
      // of a 4x4 cube, in arbitrary capture order/rotation, must resolve
      // to a fully valid state - cornerScore 8/8 rules out any corner
      // showing two opposite-face colors at once (e.g. Orange+Red, which
      // can never physically occur on the same cubie), which is exactly
      // what capture-order-as-identity with no rotation solving produced.
      const captured = captureWithRotations(uTurnedFaces(4), { U: 2, R: 1, F: 3, D: 0, L: 1, B: 2 })
      const result = solveFaceOrientations(captured)
      expect(result).not.toBeNull()
      expect(result!.cornerScore).toBe(8)
      expect(result!.edgeScore).toBe(12)
    })

    it('completes a 4x4 search within a reasonable time budget', () => {
      const captured = captureWithRotations(solvedFaces(4), { U: 1, R: 2, F: 3, D: 0, L: 1, B: 2 })
      const start = performance.now()
      solveFaceOrientations(captured)
      expect(performance.now() - start).toBeLessThan(3000)
    })

    it('returns null when fewer or more than 6 faces are captured', () => {
      const six = solvedFaces(4)
      const { U, ...five } = six
      expect(solveFaceOrientations(five)).toBeNull()
      expect(solveFaceOrientations({ ...six, extra: six.U })).toBeNull()
    })
  })

  it('returns null when two captured faces share the same center color', () => {
    const faces = solvedFaces(3)
    faces.B = faces.U.map((row) => row.slice()) // duplicate White center
    expect(solveFaceOrientations(faces)).toBeNull()
  })

  it('returns null for an empty capture set', () => {
    expect(solveFaceOrientations({})).toBeNull()
  })
})

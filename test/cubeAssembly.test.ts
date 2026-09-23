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
    expect(result!.fullyValid).toBe(true)
    expect(Object.values(result!.rotations).every((r) => r === 0)).toBe(true)
  })

  it.each([3, 5, 7])('recovers a real one-move scramble (%ix%i, U turn) at full validity', (size) => {
    const captured = captureWithRotations(uTurnedFaces(size), { U: 2, R: 1, F: 3, D: 0, L: 1, B: 2 })
    const result = solveFaceOrientations(captured)
    expect(result).not.toBeNull()
    expect(result!.cornerScore).toBe(8)
    expect(result!.edgeScore).toBe(12)
    expect(result!.fullyValid).toBe(true)
  })

  it('rejects a decoy rotation that scores a false 8/8 corners + 12/12 edges by duplicating pieces (permutation-parity regression)', () => {
    // Regression case for a real user-reported bug: cornerColors and
    // cornerOrientation both reported valid, edgeColors/edgeOrientation
    // too, yet the server's stricter permParity check failed. Root cause:
    // scoreCorners/scoreEdges (pre-fix) checked each of the 8/12 named
    // positions' triple/pair against the SET of physically-real pieces
    // independently - "is this ANY valid corner/edge" - with no
    // requirement that two positions don't match the SAME physical piece.
    // This exact capture (already at its as-captured, zero-rotation
    // orientation - the pre-fix solver picked rotation {0,0,0,0,0,0},
    // i.e. did nothing) scores a perfect 8/8 + 12/12 that way, but its
    // actual corner-piece list is [0,1,1,0,7,6,6,7] - pieces 0/1/6/7 each
    // read twice, 2/3/4/5 never - not a permutation at all, hence
    // physically impossible. A genuinely valid rotation of this same
    // capture DOES exist (U:1,R:3,F:0,D:1,L:3,B:0) and must be what the
    // solver picks.
    const raw = 'RWWRWWRWW RRRRRRYYY GGGGGGGGG YYOYYOYYO WWWOOOOOO BBBBBBBBB'.split(' ')
    const faceOrder = ['U', 'R', 'F', 'D', 'L', 'B']
    const capturedFaces: Record<string, string[][]> = {}
    faceOrder.forEach((key, i) => {
      const flat = raw[i].split('')
      capturedFaces[key] = [flat.slice(0, 3), flat.slice(3, 6), flat.slice(6, 9)]
    })

    const result = solveFaceOrientations(capturedFaces)
    expect(result).not.toBeNull()
    expect(result!.fullyValid).toBe(true)
    expect(result!.cornerScore).toBe(8)
    expect(result!.edgeScore).toBe(12)
    // Must NOT be the decoy (leaving every face unrotated) - that's the
    // exact wrong answer the bug produced.
    expect(Object.values(result!.rotations).some((r) => r !== 0)).toBe(true)
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
      // A 2x2 has no edge pieces at all - every piece is a corner - so
      // edgeScore is NaN there, not a real (and inevitably misleading)
      // count; only 4x4/6x6 actually have edges to score.
      if (size === 2) {
        expect(Number.isNaN(result!.edgeScore)).toBe(true)
      } else {
        expect(result!.edgeScore).toBe(12)
      }
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

    it('scores a real user-reported 4x4 capture as fully edge-valid (mirrored-wing regression)', () => {
      // Regression case for a reported bug: scoreEdges() picked a single
      // "representative" wing sticker per edge side using the same raw
      // index on both faces, but 4 of the 12 edges (UR, UB, DB, DL) read
      // their two faces' wing positions in OPPOSITE directions - the same
      // class of bug server/Server.ts's EDGE_LINES table documents
      // already hitting (and fixing) for the wing-edge parity check. This
      // capture (posted as evidence of a real, valid cube that the app
      // nonetheless warned about) used to score 11/12 - DB specifically -
      // even though the assembled cube was genuinely correct (its
      // structural/corner/wing-edge parity all passed). Must now score
      // 12/12.
      const toGrid = (s: string, n: number): string[][] =>
        Array.from({ length: n }, (_, r) => s.slice(r * n, r * n + n).split(''))
      const faces: Record<string, string[][]> = {
        U: toGrid('OYYWWBWYRYOGBORB', 4),
        R: toGrid('YRROBRBBOGGROWRY', 4),
        F: toGrid('RWWRGBROWOWYWGYW', 4),
        D: toGrid('RWOBRYOGORWBYWGO', 4),
        L: toGrid('GOYWRYRYBGOBRGGG', 4),
        B: toGrid('GGBYYWBBWYGOBOBG', 4),
      }
      const captured = captureWithRotations(faces, { U: 2, R: 0, F: 1, D: 3, L: 2, B: 0 })
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

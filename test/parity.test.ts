/**
 * test/parity.test.ts
 * Regression tests for src/client/parity.ts's runFullParity and its
 * facelet-index tables (CORNER_SLOTS, EDGE_FACELETS_3x3, EDGE_LINES).
 *
 * Run: npx vitest run test/parity.test.ts
 */
import { describe, it, expect } from 'vitest'
import type { CubeIR } from '../src/client/cubeAssembly'
import { runFullParity as checkParity, validateWingEdges } from '../src/client/parity'

type FaceGrid = CubeIR['u']

function toGrid(s: string): FaceGrid {
  const n = Math.round(Math.sqrt(s.length))
  return { n, data: s.split('') }
}

function cubeFromFacelets(spaced: string): CubeIR {
  const blocks = spaced.trim().split(/\s+/)
  const [u, r, f, d, l, b] = blocks.map(toGrid)
  return { size: u.n, u, r, f, d, l, b }
}

function solvedCube(n = 3): CubeIR {
  const colors = ['W', 'R', 'G', 'Y', 'O', 'B']
  return cubeFromFacelets(colors.map((c) => c.repeat(n * n)).join(' '))
}

describe('parity: 3x3 corner/edge facelet-index tables', () => {
  it('accepts a solved cube', () => {
    expect(checkParity(solvedCube())).toMatchObject({ valid: true, result: 'Valid — all parity checks passed' })
  })

  it('accepts a real scrambled capture (the reported false-positive case)', () => {
    // Reported bug: this exact, genuinely valid scramble was rejected
    // with "Unknown corner color triplet" by the original (buggy) table,
    // despite colorBalance and centerCores both passing.
    const cube = cubeFromFacelets(
      'ROGYWBWYG ROROROYWY GBYBGWGBO YWBWYGORB WROYORWRO WGBYBGRGB'
    )
    expect(checkParity(cube)).toMatchObject({ valid: true, result: 'Valid — all parity checks passed' })
  })

  it('rejects a cube with a genuinely broken corner (negative control)', () => {
    const cube = cubeFromFacelets(
      'ROGYWBWYG ROROROYWY GBYBGWGBO YWBWYGORB WROYORWRO WGBYBGRGB'
    )
    // Swap two stickers that belong to the same UFR corner slot (u[8]
    // and r[0]) - still uses only colors already present, so this alone
    // wouldn't break color balance, only corner validity.
    ;[cube.u.data[8], cube.r.data[0]] = [cube.r.data[0], cube.u.data[8]]
    const result = checkParity(cube)
    expect(result.valid).toBe(false)
    expect(result.result).toBe('Unknown corner color triplet')
  })

  it('rejects a cube with a genuinely broken edge (negative control)', () => {
    const cube = solvedCube()
    // Swap F's UF-edge sticker with D's center sticker (a plain swap, so
    // color balance stays intact) - the UF edge now reads (W, Y), and
    // opposite colors can never be adjacent on a real cube, so no valid
    // edge pair matches it.
    ;[cube.f.data[1], cube.d.data[4]] = [cube.d.data[4], cube.f.data[1]]
    const result = checkParity(cube)
    expect(result.valid).toBe(false)
    expect(result.result).toBe('Unknown edge color pair')
  })

  it('specifically covers the previously-broken UBR/UBL corner entries', () => {
    // A single U-turn from solved (F top row <- L, R top row <- F,
    // B top row <- R, L top row <- B) touches the UBR and UBL corners
    // this fix corrected the indices for.
    const cube = solvedCube()
    cube.f.data[0] = cube.f.data[1] = cube.f.data[2] = 'O'
    cube.r.data[0] = cube.r.data[1] = cube.r.data[2] = 'G'
    cube.b.data[0] = cube.b.data[1] = cube.b.data[2] = 'R'
    cube.l.data[0] = cube.l.data[1] = cube.l.data[2] = 'B'
    expect(checkParity(cube)).toMatchObject({ valid: true, result: 'Valid — all parity checks passed' })
  })
})

describe('parity: non-3x3 sizes (no center-block uniformity check)', () => {
  it('accepts a solved 2x2, and 4x4-7x7', () => {
    expect(checkParity(solvedCube(2))).toMatchObject({ valid: true, result: 'Valid — all parity checks passed' })
    for (const n of [4, 5, 6, 7]) {
      expect(checkParity(solvedCube(n))).toMatchObject({ valid: true, result: 'Valid (structural + corner + wing-edge count check)' })
    }
  })

  it('accepts a real scrambled 4x4 capture with mixed-color face centers (the reported center-uniformity false-positive)', () => {
    // Reported bug: on a genuinely scrambled 4x4, a face's 4 center
    // stickers are routinely a mix of colors (center pieces are
    // independently movable on even cubes - that's why "center
    // reduction" is a required first step of the standard big-cube
    // solving method), so requiring them to be uniform incorrectly
    // rejected this valid capture with "Center cores not uniform" even
    // though colorBalance passed.
    const cube = cubeFromFacelets(
      'YOOWWRRYWYRRRRRG YBGORBBBWBBBOOOO GGGOOGYYGRYBRYRW BGWBROOYRYOYBOOB GBGWBOGBRGGWWYWY GGGRYWWOYWWBYWWR'
    )
    expect(checkParity(cube)).toMatchObject({ valid: true, result: 'Valid (structural + corner + wing-edge count check)' })
  })

  it('accepts the same real 4x4 capture under wing-edge counting (the reported direction-bug false-positive)', () => {
    // A second, independent bug the same capture caught: EDGE_LINES was
    // first derived by pattern-matching against CORNER_SLOTS (reasoning
    // about which corner sits at which slot on each face), which got the
    // UR/UB/DB/DL edges' direction backwards - undetectable by cross-
    // checking against the legacy N=3 table, since N=3 has only one,
    // self-symmetric wing position where a forward and a reversed formula
    // produce an identical result. Re-derived from explicit 3D coordinates
    // for all 6 faces instead, which exposed and fixed the 4 wrong edges;
    // this capture's wing-edge counts only balance under the corrected
    // table (see EDGE_LINES's reverse flags above).
    const cube = cubeFromFacelets(
      'YOOWWRRYWYRRRRRG YBGORBBBWBBBOOOO GGGOOGYYGRYBRYRW BGWBROOYRYOYBOOB GBGWBOGBRGGWWYWY GGGRYWWOYWWBYWWR'
    )
    expect(validateWingEdges(cube)).toEqual({ valid: true })
  })

  it('rejects a 2x2 with an invalid color balance', () => {
    const cube = solvedCube(2)
    cube.u.data[0] = 'R' // now 5 R, 3 W - breaks the N² == 4-per-color invariant
    const result = checkParity(cube)
    expect(result.valid).toBe(false)
    expect(result.result).toBe('Invalid color balance')
    expect(result.detail).toBe('White 3, Red 5 - each color should appear 4 times')
    // Every Red sticker is a candidate for the misread one - the 4 on R plus the one on U.
    expect(result.highlight).toEqual([{
      group: 'Red ×5',
      facelets: [{ face: 'u', index: 0 }, ...[0, 1, 2, 3].map((index) => ({ face: 'r', index }))],
    }])
  })

  it('rejects a 2x2 with a genuinely broken corner triplet', () => {
    const cube = solvedCube(2)
    ;[cube.u.data[3], cube.r.data[0]] = [cube.r.data[0], cube.u.data[3]]
    const result = checkParity(cube)
    expect(result.valid).toBe(false)
    expect(result.result).toBe('Unknown corner color triplet')
  })

  it('rejects a 4x4 with a genuinely broken corner triplet', () => {
    const cube = solvedCube(4)
    ;[cube.u.data[15], cube.r.data[0]] = [cube.r.data[0], cube.u.data[15]]
    const result = checkParity(cube)
    expect(result.valid).toBe(false)
    expect(result.result).toBe('Unknown corner color triplet')
  })

  it('rejects a 4x4 with an unbalanced wing-edge color-pair count', () => {
    // Swap two wing stickers between different edges (u's UF wing and d's
    // DR wing) so each individual wing still reads as *some* valid pair,
    // but one canonical pair now has 3 copies and another has 1 (instead
    // of 2 each) - a state no legal scramble can reach, since a wing
    // piece's colors are fixed.
    const cube = solvedCube(4)
    ;[cube.u.data[13], cube.d.data[7]] = [cube.d.data[7], cube.u.data[13]]
    const result = checkParity(cube)
    expect(result.valid).toBe(false)
    // Every offending pair named with its actual vs. expected count, not
    // just "unbalanced" - a human can see directly that W/Y and G/R are
    // the two colors being confused (each short exactly where the other
    // is over), without re-deriving the count table themselves.
    expect(result.result).toBe(
      'Wing edge color-pair counts unbalanced: W-G has 1 (expected 2), W-R has 3 (expected 2), Y-G has 3 (expected 2), Y-R has 1 (expected 2)'
    )
    // Highlight must include the two stickers that were actually swapped -
    // the real culprits - but can't narrow any further than that: W-R and
    // Y-G (the two OVER-represented pairs) have 3 wings each instead of
    // 2, and there's no way to tell which of those 3 is the genuine one
    // vs. the misread one from counts alone, so all 6 wings (12 facelets,
    // as 6 group entries) are implicated. The two UNDER-represented pairs
    // (W-G, Y-R) have nothing to highlight - they're just missing, not
    // sitting on the cube anywhere. Every entry's `group` names which
    // over-represented pair it belongs to, so a client can cross-
    // highlight the rest of the same pool on hover.
    const allFacelets = result.highlight!.flatMap((g) => g.facelets)
    expect(allFacelets).toEqual(
      expect.arrayContaining([{ face: 'u', index: 13 }, { face: 'd', index: 7 }])
    )
    expect(allFacelets.length).toBe(12)
    expect(result.highlight!.length).toBe(6)
    expect(new Set(result.highlight!.map((g) => g.group))).toEqual(new Set(['W-R', 'Y-G']))
  })

  it('rejects a 4x4 with a genuinely impossible wing-edge color pair', () => {
    // Swap the UF edge's own two wings (u's and f's sides) with each
    // other, producing a same-color (W-W or G-G) reading at that
    // position - impossible for a real edge, which always joins two
    // different, non-opposite colors.
    const cube = solvedCube(4)
    ;[cube.u.data[13], cube.f.data[2]] = [cube.f.data[2], cube.u.data[13]]
    const result = checkParity(cube)
    expect(result.valid).toBe(false)
    // Names the actual bad pair and where it was read from, not just that
    // "some" wing was wrong.
    expect(result.result).toMatch(/^Unknown wing edge color pair "G-G" at edge UF/)
  })

  it('accepts solved cubes of every wing-bearing size via validateWingEdges directly', () => {
    for (const n of [4, 5, 6, 7]) {
      expect(validateWingEdges(solvedCube(n))).toEqual({ valid: true })
    }
  })
})

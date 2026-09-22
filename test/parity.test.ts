/**
 * test/parity.test.ts
 * Regression tests for server/Server.ts's runFullParity and its facelet-
 * index tables (CORNER_SLOTS, EDGE_FACELETS_3x3, EDGE_LINES).
 *
 * Mirrors the fixed logic inline (matching test/notation.test.ts's own
 * "inline minimal mirrors" approach) rather than importing server/Server.ts
 * directly: that file's default export ({ port, fetch }) is Bun's
 * auto-serve convention, and importing it could risk binding a port
 * already held by a running dev server.
 *
 * Run: npx vitest run test/parity.test.ts
 */
import { describe, it, expect } from 'vitest'

type FaceColor = 'W' | 'O' | 'G' | 'R' | 'B' | 'Y'
type FaceGrid = { n: number; data: FaceColor[] }
type CubeIR = { size: number; u: FaceGrid; r: FaceGrid; f: FaceGrid; d: FaceGrid; l: FaceGrid; b: FaceGrid }

const SOLVED_CORNERS: Array<[FaceColor, FaceColor, FaceColor]> = [
  ['W', 'R', 'G'], ['W', 'B', 'R'], ['W', 'O', 'B'], ['W', 'G', 'O'],
  ['Y', 'G', 'R'], ['Y', 'R', 'B'], ['Y', 'B', 'O'], ['Y', 'O', 'G'],
]
const SOLVED_EDGES: Array<[FaceColor, FaceColor]> = [
  ['W', 'G'], ['W', 'R'], ['W', 'B'], ['W', 'O'],
  ['Y', 'G'], ['Y', 'R'], ['Y', 'B'], ['Y', 'O'],
  ['G', 'R'], ['G', 'O'], ['B', 'R'], ['B', 'O'],
]

// Corners are always single unit cubies regardless of puzzle size N, so
// their 4 grid-corner slots (top-left/top-right/bottom-left/bottom-right)
// on each face generalize cleanly to any N; only the literal facelet
// index of a slot depends on N.
type CornerSlot = 'TL' | 'TR' | 'BL' | 'BR'
function cornerFaceletIdx(n: number, slot: CornerSlot): number {
  switch (slot) {
    case 'TL': return 0
    case 'TR': return n - 1
    case 'BL': return n * (n - 1)
    case 'BR': return n * n - 1
  }
}

// [faceA, slotA, faceB, slotB, faceC, slotC] per corner: UFR, UBR, UBL, UFL,
// DFR, DBR, DBL, DFL. The B (back) face is viewed from outside the cube
// (mirrored left/right relative to F), which the UBR/UBL entries'
// `b`/`l` slots originally got backwards - confirmed against a real
// scrambled capture that a correct table accepts and the original one
// rejected with "Unknown corner color triplet" despite colorBalance
// passing.
const CORNER_SLOTS = [
  ['u', 'BR', 'r', 'TL', 'f', 'TR'], ['u', 'TR', 'b', 'TL', 'r', 'TR'], ['u', 'TL', 'l', 'TL', 'b', 'TR'], ['u', 'BL', 'f', 'TL', 'l', 'TR'],
  ['d', 'TR', 'f', 'BR', 'r', 'BL'], ['d', 'BR', 'r', 'BR', 'b', 'BL'], ['d', 'BL', 'b', 'BR', 'l', 'BL'], ['d', 'TL', 'l', 'BR', 'f', 'BL'],
] as const

// UF, UR, UB, UL, DF, DR, DB, DL, FR, FL, BR, BL. Same B-face mirroring
// mistake as CORNER_SLOTS hit the BR/BL entries' `b` index.
const EDGE_FACELETS_3x3 = [
  ['u', 7, 'f', 1], ['u', 5, 'r', 1], ['u', 1, 'b', 1], ['u', 3, 'l', 1],
  ['d', 1, 'f', 7], ['d', 5, 'r', 7], ['d', 7, 'b', 7], ['d', 3, 'l', 7],
  ['f', 5, 'r', 3], ['f', 3, 'l', 5], ['b', 3, 'r', 5], ['b', 5, 'l', 3],
] as const

// Wing-edge geometry for N>3: derived from explicit 3D coordinates for all
// 6 faces (not the corner-slot shortcut, which can't distinguish a
// "forward" pairing from a "reversed" one - the only cross-check available
// at N=3 has a single, self-symmetric wing position where both coincide).
// reverse=true means the wing at distance w from the first-listed corner
// reads that face's line at position (N-1-w), not w.
type EdgeLineType = 'TOP' | 'BOTTOM' | 'LEFT' | 'RIGHT'
function lineFaceletIdx(n: number, line: EdgeLineType, w: number): number {
  switch (line) {
    case 'TOP': return w
    case 'BOTTOM': return n * (n - 1) + w
    case 'LEFT': return w * n
    case 'RIGHT': return w * n + (n - 1)
  }
}
const EDGE_LINES = [
  ['UF', 'u', 'BOTTOM', false, 'f', 'TOP', false],
  ['UR', 'u', 'RIGHT', false, 'r', 'TOP', true],
  ['UB', 'u', 'TOP', false, 'b', 'TOP', true],
  ['UL', 'u', 'LEFT', false, 'l', 'TOP', false],
  ['DF', 'd', 'TOP', false, 'f', 'BOTTOM', false],
  ['DR', 'd', 'RIGHT', false, 'r', 'BOTTOM', false],
  ['DB', 'd', 'BOTTOM', false, 'b', 'BOTTOM', true],
  ['DL', 'd', 'LEFT', false, 'l', 'BOTTOM', true],
  ['FR', 'f', 'RIGHT', false, 'r', 'LEFT', false],
  ['FL', 'f', 'LEFT', false, 'l', 'RIGHT', false],
  ['BR', 'b', 'LEFT', false, 'r', 'RIGHT', false],
  ['BL', 'b', 'RIGHT', false, 'l', 'LEFT', false],
] as const
function edgeLineFaceletIdx(n: number, line: EdgeLineType, reverse: boolean, w: number): number {
  return lineFaceletIdx(n, line, reverse ? n - 1 - w : w)
}

function validateWingEdges(cube: CubeIR): { valid: boolean; result?: string } {
  const n = cube.size
  const counts = new Array(SOLVED_EDGES.length).fill(0)
  for (const [, faceA, lineA, reverseA, faceB, lineB, reverseB] of EDGE_LINES) {
    for (let w = 1; w <= n - 2; w++) {
      const c0 = getFace(cube, faceA).data[edgeLineFaceletIdx(n, lineA as EdgeLineType, reverseA, w)]
      const c1 = getFace(cube, faceB).data[edgeLineFaceletIdx(n, lineB as EdgeLineType, reverseB, w)]
      let found = false
      for (let pi = 0; pi < SOLVED_EDGES.length; pi++) {
        const se = SOLVED_EDGES[pi]
        if ((c0 === se[0] && c1 === se[1]) || (c0 === se[1] && c1 === se[0])) { counts[pi]++; found = true; break }
      }
      if (!found) return { valid: false, result: 'Unknown wing edge color pair' }
    }
  }
  const expected = n - 2
  if (!counts.every((c) => c === expected)) {
    return { valid: false, result: `Wing edge color-pair counts unbalanced (expected ${expected} of each)` }
  }
  return { valid: true }
}

function getFace(cube: CubeIR, key: string): FaceGrid {
  return (cube as any)[key]
}

function permParity(perm: number[]): boolean {
  const visited = new Array(perm.length).fill(false)
  let cycles = 0
  for (let i = 0; i < perm.length; i++) {
    if (!visited[i]) {
      let j = i
      while (!visited[j]) { visited[j] = true; j = perm[j] }
      cycles++
    }
  }
  return (perm.length - cycles) % 2 === 0
}

function countColors(cube: CubeIR): Record<FaceColor, number> {
  const counts: any = { W: 0, O: 0, G: 0, R: 0, B: 0, Y: 0 }
  for (const face of [cube.u, cube.r, cube.f, cube.d, cube.l, cube.b]) {
    for (const c of face.data) counts[c]++
  }
  return counts
}

function validateColorBalance(cube: CubeIR): boolean {
  const counts = countColors(cube)
  const expected = cube.size ** 2
  return Object.values(counts).every((c) => c === expected)
}

// Faithful port of runFullParity's full corner/edge/orientation/permutation
// logic, generalized across puzzle sizes the same way the server is.
function checkParity(cube: CubeIR): { valid: boolean; result: string } {
  const n = cube.size

  if (!validateColorBalance(cube)) return { valid: false, result: 'Invalid color balance' }

  const cornerPieces: number[] = []
  const cornerOrients: number[] = []
  for (const [fa, ca, fb, cb, fc, cc] of CORNER_SLOTS) {
    const colors: FaceColor[] = [
      getFace(cube, fa).data[cornerFaceletIdx(n, ca as CornerSlot)],
      getFace(cube, fb).data[cornerFaceletIdx(n, cb as CornerSlot)],
      getFace(cube, fc).data[cornerFaceletIdx(n, cc as CornerSlot)],
    ]
    let found = false
    for (let pi = 0; pi < SOLVED_CORNERS.length && !found; pi++) {
      const sc = SOLVED_CORNERS[pi]
      for (let rot = 0; rot < 3; rot++) {
        if (colors[rot % 3] === sc[0] && colors[(rot + 1) % 3] === sc[1] && colors[(rot + 2) % 3] === sc[2]) {
          cornerPieces.push(pi); cornerOrients.push(rot); found = true; break
        }
      }
    }
    if (!found) return { valid: false, result: 'Unknown corner color triplet' }
  }

  const cornerOrientSum = cornerOrients.reduce((a, b) => a + b, 0)
  if (cornerOrientSum % 3 !== 0) return { valid: false, result: 'Corner orientation sum not 0 mod 3' }

  if (n === 2) return { valid: true, result: 'OK' }
  if (n !== 3) {
    const wingResult = validateWingEdges(cube)
    if (!wingResult.valid) return { valid: false, result: wingResult.result! }
    return { valid: true, result: 'OK (structural + corner + wing-edge count check)' }
  }

  const edgePieces: number[] = []
  const edgeOrients: number[] = []
  for (const [fa, ia, fb, ib] of EDGE_FACELETS_3x3) {
    const c0 = getFace(cube, fa).data[ia]
    const c1 = getFace(cube, fb).data[ib]
    let found = false
    for (let pi = 0; pi < SOLVED_EDGES.length; pi++) {
      const se = SOLVED_EDGES[pi]
      if (c0 === se[0] && c1 === se[1]) { edgePieces.push(pi); edgeOrients.push(0); found = true; break }
      if (c0 === se[1] && c1 === se[0]) { edgePieces.push(pi); edgeOrients.push(1); found = true; break }
    }
    if (!found) return { valid: false, result: 'Unknown edge color pair' }
  }

  if (edgeOrients.reduce((a, b) => a + b, 0) % 2 !== 0) {
    return { valid: false, result: 'Edge orientation sum not 0 mod 2' }
  }
  if (permParity(cornerPieces) !== permParity(edgePieces)) {
    return { valid: false, result: 'Corner perm parity != edge perm parity' }
  }
  return { valid: true, result: 'OK' }
}

function toGrid(s: string): FaceGrid {
  const n = Math.round(Math.sqrt(s.length))
  return { n, data: s.split('') as FaceColor[] }
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

describe('server parity: 3x3 corner/edge facelet-index tables', () => {
  it('accepts a solved cube', () => {
    expect(checkParity(solvedCube())).toEqual({ valid: true, result: 'OK' })
  })

  it('accepts a real scrambled capture (the reported false-positive case)', () => {
    // Reported bug: this exact, genuinely valid scramble was rejected
    // with "Unknown corner color triplet" by the original (buggy) table,
    // despite colorBalance and centerCores both passing.
    const cube = cubeFromFacelets(
      'ROGYWBWYG ROROROYWY GBYBGWGBO YWBWYGORB WROYORWRO WGBYBGRGB'
    )
    expect(checkParity(cube)).toEqual({ valid: true, result: 'OK' })
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
    expect(checkParity(cube)).toEqual({ valid: true, result: 'OK' })
  })
})

describe('server parity: non-3x3 sizes (no center-block uniformity check)', () => {
  it('accepts a solved 2x2, and 4x4-7x7', () => {
    expect(checkParity(solvedCube(2))).toEqual({ valid: true, result: 'OK' })
    for (const n of [4, 5, 6, 7]) {
      expect(checkParity(solvedCube(n))).toEqual({ valid: true, result: 'OK (structural + corner + wing-edge count check)' })
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
    expect(checkParity(cube)).toEqual({ valid: true, result: 'OK (structural + corner + wing-edge count check)' })
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
    expect(checkParity(cube)).toEqual({ valid: false, result: 'Invalid color balance' })
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
    expect(result.result).toMatch(/unbalanced/i)
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
    expect(result.result).toBe('Unknown wing edge color pair')
  })

  it('accepts solved cubes of every wing-bearing size via validateWingEdges directly', () => {
    for (const n of [4, 5, 6, 7]) {
      expect(validateWingEdges(solvedCube(n))).toEqual({ valid: true })
    }
  })
})

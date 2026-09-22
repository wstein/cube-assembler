/**
 * test/parity.test.ts
 * Regression tests for server/Server.ts's corner/edge facelet-index
 * tables (CORNER_FACELETS_3x3, EDGE_FACELETS_3x3).
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

const SOLVED_CORNERS_3x3: Array<[FaceColor, FaceColor, FaceColor]> = [
  ['W', 'R', 'G'], ['W', 'B', 'R'], ['W', 'O', 'B'], ['W', 'G', 'O'],
  ['Y', 'G', 'R'], ['Y', 'R', 'B'], ['Y', 'B', 'O'], ['Y', 'O', 'G'],
]
const SOLVED_EDGES_3x3: Array<[FaceColor, FaceColor]> = [
  ['W', 'G'], ['W', 'R'], ['W', 'B'], ['W', 'O'],
  ['Y', 'G'], ['Y', 'R'], ['Y', 'B'], ['Y', 'O'],
  ['G', 'R'], ['G', 'O'], ['B', 'R'], ['B', 'O'],
]

// [faceA, idxA, faceB, idxB, faceC, idxC] per corner: UFR, UBR, UBL, UFL,
// DFR, DBR, DBL, DFL. The B (back) face is viewed from outside the cube
// (mirrored left/right relative to F), which the UBR/UBL entries'
// `b`/`l` indices originally got backwards - confirmed against a real
// scrambled capture that a correct table accepts and the original one
// rejected with "Unknown corner color triplet" despite colorBalance and
// centerCores both passing.
const CORNER_FACELETS_3x3 = [
  ['u', 8, 'r', 0, 'f', 2], ['u', 2, 'b', 0, 'r', 2], ['u', 0, 'l', 0, 'b', 2], ['u', 6, 'f', 0, 'l', 2],
  ['d', 2, 'f', 8, 'r', 6], ['d', 8, 'r', 8, 'b', 6], ['d', 6, 'b', 8, 'l', 6], ['d', 0, 'l', 8, 'f', 6],
] as const

// UF, UR, UB, UL, DF, DR, DB, DL, FR, FL, BR, BL. Same B-face mirroring
// mistake as CORNER_FACELETS_3x3 hit the BR/BL entries' `b` index.
const EDGE_FACELETS_3x3 = [
  ['u', 7, 'f', 1], ['u', 5, 'r', 1], ['u', 1, 'b', 1], ['u', 3, 'l', 1],
  ['d', 1, 'f', 7], ['d', 5, 'r', 7], ['d', 7, 'b', 7], ['d', 3, 'l', 7],
  ['f', 5, 'r', 3], ['f', 3, 'l', 5], ['b', 3, 'r', 5], ['b', 5, 'l', 3],
] as const

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

// Faithful port of runFullParity's corner/edge/orientation/permutation
// logic (color balance and center-core checks omitted - unaffected by
// this table and already covered by validateColorBalance elsewhere).
function checkCornersAndEdges(cube: CubeIR): { valid: boolean; result: string } {
  const cornerPieces: number[] = []
  const cornerOrients: number[] = []
  for (const [fa, ia, fb, ib, fc, ic] of CORNER_FACELETS_3x3) {
    const colors: FaceColor[] = [getFace(cube, fa).data[ia], getFace(cube, fb).data[ib], getFace(cube, fc).data[ic]]
    let found = false
    for (let pi = 0; pi < SOLVED_CORNERS_3x3.length && !found; pi++) {
      const sc = SOLVED_CORNERS_3x3[pi]
      for (let rot = 0; rot < 3; rot++) {
        if (colors[rot % 3] === sc[0] && colors[(rot + 1) % 3] === sc[1] && colors[(rot + 2) % 3] === sc[2]) {
          cornerPieces.push(pi); cornerOrients.push(rot); found = true; break
        }
      }
    }
    if (!found) return { valid: false, result: 'Unknown corner color triplet' }
  }

  const edgePieces: number[] = []
  const edgeOrients: number[] = []
  for (const [fa, ia, fb, ib] of EDGE_FACELETS_3x3) {
    const c0 = getFace(cube, fa).data[ia]
    const c1 = getFace(cube, fb).data[ib]
    let found = false
    for (let pi = 0; pi < SOLVED_EDGES_3x3.length; pi++) {
      const se = SOLVED_EDGES_3x3[pi]
      if (c0 === se[0] && c1 === se[1]) { edgePieces.push(pi); edgeOrients.push(0); found = true; break }
      if (c0 === se[1] && c1 === se[0]) { edgePieces.push(pi); edgeOrients.push(1); found = true; break }
    }
    if (!found) return { valid: false, result: 'Unknown edge color pair' }
  }

  if (cornerOrients.reduce((a, b) => a + b, 0) % 3 !== 0) {
    return { valid: false, result: 'Corner orientation sum not 0 mod 3' }
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
  return { n: 3, data: s.split('') as FaceColor[] }
}

function cubeFromFacelets(spaced: string): CubeIR {
  const flat = spaced.replace(/\s+/g, '')
  return {
    size: 3,
    u: toGrid(flat.slice(0, 9)), r: toGrid(flat.slice(9, 18)), f: toGrid(flat.slice(18, 27)),
    d: toGrid(flat.slice(27, 36)), l: toGrid(flat.slice(36, 45)), b: toGrid(flat.slice(45, 54)),
  }
}

function solvedCube(): CubeIR {
  return cubeFromFacelets('WWWWWWWWW RRRRRRRRR GGGGGGGGG YYYYYYYYY OOOOOOOOO BBBBBBBBB')
}

describe('server parity: corner/edge facelet-index tables', () => {
  it('accepts a solved cube', () => {
    expect(checkCornersAndEdges(solvedCube())).toEqual({ valid: true, result: 'OK' })
  })

  it('accepts a real scrambled capture (the reported false-positive case)', () => {
    // Reported bug: this exact, genuinely valid scramble was rejected
    // with "Unknown corner color triplet" by the original (buggy) table,
    // despite colorBalance and centerCores both passing.
    const cube = cubeFromFacelets(
      'ROGYWBWYG ROROROYWY GBYBGWGBO YWBWYGORB WROYORWRO WGBYBGRGB'
    )
    expect(checkCornersAndEdges(cube)).toEqual({ valid: true, result: 'OK' })
  })

  it('rejects a cube with a genuinely broken corner (negative control)', () => {
    const cube = cubeFromFacelets(
      'ROGYWBWYG ROROROYWY GBYBGWGBO YWBWYGORB WROYORWRO WGBYBGRGB'
    )
    // Swap two stickers that belong to the same UFR corner slot (u[8]
    // and r[0]) - still uses only colors already present, so this alone
    // wouldn't break color balance, only corner validity.
    ;[cube.u.data[8], cube.r.data[0]] = [cube.r.data[0], cube.u.data[8]]
    const result = checkCornersAndEdges(cube)
    expect(result.valid).toBe(false)
    expect(result.result).toBe('Unknown corner color triplet')
  })

  it('rejects a cube with a genuinely broken edge (negative control)', () => {
    const cube = solvedCube()
    // A solved cube's U/F edge should read (W,G) or (G,W); force
    // something else entirely.
    cube.u.data[7] = 'B'
    const result = checkCornersAndEdges(cube)
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
    expect(checkCornersAndEdges(cube)).toEqual({ valid: true, result: 'OK' })
  })
})

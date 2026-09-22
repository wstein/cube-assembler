/**
 * test/assemblyWorker.test.ts
 * Regression tests for server/AssemblyWorker.ts's corner/edge validation
 * (validateCorners, validateEdges, checkFullParity) - the /api/assemble
 * brute-force face-orientation search used by the (currently UI-
 * unreachable) "Run Assembly Pipeline" feature.
 *
 * Mirrors the fixed logic inline (matching test/parity.test.ts's own
 * approach for server/Server.ts) rather than importing AssemblyWorker.ts
 * directly: that file assigns `self.onmessage` at module scope, which
 * throws outside an actual Worker/browser context.
 *
 * Run: npx vitest run test/assemblyWorker.test.ts
 */
import { describe, it, expect } from 'vitest'

type FaceColor = 'W' | 'O' | 'G' | 'R' | 'B' | 'Y'
type FaceGrid = { n: number; data: FaceColor[] }
type CubeIR = { size: number; u: FaceGrid; r: FaceGrid; f: FaceGrid; d: FaceGrid; l: FaceGrid; b: FaceGrid }

type CornerSlot = 'TL' | 'TR' | 'BL' | 'BR'
function cornerFaceletIdx(n: number, slot: CornerSlot): number {
  switch (slot) {
    case 'TL': return 0
    case 'TR': return n - 1
    case 'BL': return n * (n - 1)
    case 'BR': return n * n - 1
  }
}

// The 8 canonical corner color-triples (read in the same faceA/faceB/faceC
// order as CORNERS below), each with its 2 other valid cyclic rotations.
// The production code originally used the opposite (mirror) chirality
// here, which rejected every cube including a solved one - see
// server/AssemblyWorker.ts for the full writeup.
const VALID_CORNERS = new Set([
  'W-R-G', 'G-W-R', 'R-G-W', 'W-B-R', 'R-W-B', 'B-R-W', 'W-O-B', 'B-W-O',
  'O-B-W', 'W-G-O', 'O-W-G', 'G-O-W', 'Y-G-R', 'R-Y-G', 'G-R-Y', 'Y-R-B',
  'B-Y-R', 'R-B-Y', 'Y-B-O', 'O-Y-B', 'B-O-Y', 'Y-O-G', 'G-Y-O', 'O-G-Y',
])
const VALID_EDGES = new Set([
  'W-G', 'W-R', 'W-B', 'W-O', 'Y-G', 'Y-R', 'Y-B', 'Y-O', 'G-R', 'G-O', 'B-R', 'B-O',
  'G-W', 'R-W', 'B-W', 'O-W', 'G-Y', 'R-Y', 'B-Y', 'O-Y', 'R-G', 'O-G', 'R-B', 'O-B',
])

const CORNERS = [
  ['u', 'BR', 'r', 'TL', 'f', 'TR'], ['u', 'TR', 'b', 'TL', 'r', 'TR'], ['u', 'TL', 'l', 'TL', 'b', 'TR'], ['u', 'BL', 'f', 'TL', 'l', 'TR'],
  ['d', 'TR', 'f', 'BR', 'r', 'BL'], ['d', 'BR', 'r', 'BR', 'b', 'BL'], ['d', 'BL', 'b', 'BR', 'l', 'BL'], ['d', 'TL', 'l', 'BR', 'f', 'BL'],
] as const

const EDGES = [
  ['u', 7, 'f', 1], ['u', 5, 'r', 1], ['u', 1, 'b', 1], ['u', 3, 'l', 1],
  ['d', 1, 'f', 7], ['d', 5, 'r', 7], ['d', 7, 'b', 7], ['d', 3, 'l', 7],
  ['f', 5, 'r', 3], ['f', 3, 'l', 5], ['b', 3, 'r', 5], ['b', 5, 'l', 3],
] as const

function gf(cube: CubeIR, key: string): FaceGrid { return (cube as any)[key] }

function validateEdges(cube: CubeIR): boolean {
  if (cube.size !== 3) return true
  for (const [fa, ia, fb, ib] of EDGES) {
    const key = `${gf(cube, fa).data[ia]}-${gf(cube, fb).data[ib]}`
    if (!VALID_EDGES.has(key)) return false
  }
  return true
}

function validateCorners(cube: CubeIR): boolean {
  const n = cube.size
  for (const [fa, ca, fb, cb, fc, cc] of CORNERS) {
    const key = `${gf(cube, fa).data[cornerFaceletIdx(n, ca as CornerSlot)]}-${gf(cube, fb).data[cornerFaceletIdx(n, cb as CornerSlot)]}-${gf(cube, fc).data[cornerFaceletIdx(n, cc as CornerSlot)]}`
    if (!VALID_CORNERS.has(key)) return false
  }
  return true
}

const SOLVED_C: Array<[FaceColor, FaceColor, FaceColor]> = [
  ['W', 'R', 'G'], ['W', 'B', 'R'], ['W', 'O', 'B'], ['W', 'G', 'O'],
  ['Y', 'G', 'R'], ['Y', 'R', 'B'], ['Y', 'B', 'O'], ['Y', 'O', 'G'],
]
const SOLVED_E: Array<[FaceColor, FaceColor]> = [
  ['W', 'G'], ['W', 'R'], ['W', 'B'], ['W', 'O'],
  ['Y', 'G'], ['Y', 'R'], ['Y', 'B'], ['Y', 'O'],
  ['G', 'R'], ['G', 'O'], ['B', 'R'], ['B', 'O'],
]

function permParity(p: number[]): boolean {
  const v = new Array(p.length).fill(false)
  let cycles = 0
  for (let i = 0; i < p.length; i++) {
    if (!v[i]) { let j = i; while (!v[j]) { v[j] = true; j = p[j] }; cycles++ }
  }
  return (p.length - cycles) % 2 === 0
}

function checkFullParity(cube: CubeIR): boolean {
  const n = cube.size
  const cp: number[] = [], co: number[] = []
  for (const [fa, ca, fb, cb, fc, cc] of CORNERS) {
    const colors: FaceColor[] = [
      gf(cube, fa).data[cornerFaceletIdx(n, ca as CornerSlot)],
      gf(cube, fb).data[cornerFaceletIdx(n, cb as CornerSlot)],
      gf(cube, fc).data[cornerFaceletIdx(n, cc as CornerSlot)],
    ]
    let found = false
    for (let pi = 0; pi < SOLVED_C.length && !found; pi++) {
      for (let rot = 0; rot < 3; rot++) {
        if (colors[rot % 3] === SOLVED_C[pi][0] && colors[(rot + 1) % 3] === SOLVED_C[pi][1] && colors[(rot + 2) % 3] === SOLVED_C[pi][2]) {
          cp.push(pi); co.push(rot); found = true; break
        }
      }
    }
    if (!found) return false
  }
  const coSum = co.reduce((a, b) => a + b, 0)
  if (coSum % 3 !== 0) return false
  if (n !== 3) return true

  const ep: number[] = [], eo: number[] = []
  for (const [fa, ia, fb, ib] of EDGES) {
    const c0 = gf(cube, fa).data[ia], c1 = gf(cube, fb).data[ib]
    let found = false
    for (let pi = 0; pi < SOLVED_E.length && !found; pi++) {
      if (c0 === SOLVED_E[pi][0] && c1 === SOLVED_E[pi][1]) { ep.push(pi); eo.push(0); found = true }
      else if (c0 === SOLVED_E[pi][1] && c1 === SOLVED_E[pi][0]) { ep.push(pi); eo.push(1); found = true }
    }
    if (!found) return false
  }
  const eoSum = eo.reduce((a, b) => a + b, 0)
  if (eoSum % 2 !== 0) return false
  return permParity(cp) === permParity(ep)
}

function toGrid(s: string): FaceGrid {
  const n = Math.round(Math.sqrt(s.length))
  return { n, data: s.split('') as FaceColor[] }
}
function cubeFromFacelets(spaced: string): CubeIR {
  const [u, r, f, d, l, b] = spaced.trim().split(/\s+/).map(toGrid)
  return { size: u.n, u, r, f, d, l, b }
}
function solvedCube(n = 3): CubeIR {
  const colors = ['W', 'R', 'G', 'Y', 'O', 'B']
  return cubeFromFacelets(colors.map((c) => c.repeat(n * n)).join(' '))
}

describe('AssemblyWorker corner/edge validation (3x3)', () => {
  it('accepts a solved cube', () => {
    expect(validateCorners(solvedCube())).toBe(true)
    expect(validateEdges(solvedCube())).toBe(true)
    expect(checkFullParity(solvedCube())).toBe(true)
  })

  it('accepts a real scrambled capture that the old B-face-mirrored table rejected', () => {
    const cube = cubeFromFacelets(
      'ROGYWBWYG ROROROYWY GBYBGWGBO YWBWYGORB WROYORWRO WGBYBGRGB'
    )
    expect(validateCorners(cube)).toBe(true)
    expect(checkFullParity(cube)).toBe(true)
  })

  it('specifically covers the previously-broken UBR/UBL corner entries', () => {
    const cube = solvedCube()
    cube.f.data[0] = cube.f.data[1] = cube.f.data[2] = 'O'
    cube.r.data[0] = cube.r.data[1] = cube.r.data[2] = 'G'
    cube.b.data[0] = cube.b.data[1] = cube.b.data[2] = 'R'
    cube.l.data[0] = cube.l.data[1] = cube.l.data[2] = 'B'
    expect(validateCorners(cube)).toBe(true)
    expect(checkFullParity(cube)).toBe(true)
  })

  it('rejects a genuinely broken corner', () => {
    const cube = solvedCube()
    ;[cube.u.data[8], cube.r.data[0]] = [cube.r.data[0], cube.u.data[8]]
    expect(validateCorners(cube)).toBe(false)
    expect(checkFullParity(cube)).toBe(false)
  })
})

describe('AssemblyWorker corner validation generalized to non-3x3 sizes', () => {
  it('accepts a solved 2x2 and 4x4 (no center-block check required)', () => {
    expect(validateCorners(solvedCube(2))).toBe(true)
    expect(checkFullParity(solvedCube(2))).toBe(true)
    expect(validateCorners(solvedCube(4))).toBe(true)
    expect(checkFullParity(solvedCube(4))).toBe(true)
  })

  it('accepts a real scrambled 4x4 capture with mixed-color face centers', () => {
    // Previously rejected before this fix: validateCorners used literal
    // 3x3 facelet indices regardless of N, so it nonsensically indexed
    // into a 4x4's 16-element face arrays; a since-removed validateCenters
    // check would also have rejected this for its mixed-color centers.
    const cube = cubeFromFacelets(
      'YOOWWRRYWYRRRRRG YBGORBBBWBBBOOOO GGGOOGYYGRYBRYRW BGWBROOYRYOYBOOB GBGWBOGBRGGWWYWY GGGRYWWOYWWBYWWR'
    )
    expect(validateCorners(cube)).toBe(true)
    expect(checkFullParity(cube)).toBe(true)
  })

  it('rejects a 4x4 with a genuinely broken corner triplet', () => {
    const cube = solvedCube(4)
    ;[cube.u.data[15], cube.r.data[0]] = [cube.r.data[0], cube.u.data[15]]
    expect(validateCorners(cube)).toBe(false)
    expect(checkFullParity(cube)).toBe(false)
  })
})

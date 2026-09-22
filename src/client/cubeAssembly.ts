// Cube state assembly from captured faces

export interface CubeState {
  u: string[]
  r: string[]
  f: string[]
  d: string[]
  l: string[]
  b: string[]
}

// Server-side wire format: each face carries its own grid dimension + colors
export interface CubeIR {
  size: number
  u: { n: number; data: string[] }
  r: { n: number; data: string[] }
  f: { n: number; data: string[] }
  d: { n: number; data: string[] }
  l: { n: number; data: string[] }
  b: { n: number; data: string[] }
}

export function toCubeIR(cube: CubeState, size: number): CubeIR {
  const grid = (data: string[]) => ({ n: size, data })
  return {
    size,
    u: grid(cube.u),
    r: grid(cube.r),
    f: grid(cube.f),
    d: grid(cube.d),
    l: grid(cube.l),
    b: grid(cube.b),
  }
}

// WCA color to position mapping
const COLOR_FACES: Record<string, 'U' | 'R' | 'F' | 'D' | 'L' | 'B'> = {
  W: 'U', // White = Up
  Y: 'D', // Yellow = Down
  O: 'L', // Orange = Left
  R: 'R', // Red = Right
  G: 'F', // Green = Front
  B: 'B', // Blue = Back
}

const SOLVED_FACE_COLOR: Record<'U' | 'R' | 'F' | 'D' | 'L' | 'B', string> = {
  U: 'W', R: 'R', F: 'G', D: 'Y', L: 'O', B: 'B',
}

function solvedFace(letter: keyof typeof SOLVED_FACE_COLOR, size: number): string[][] {
  const color = SOLVED_FACE_COLOR[letter]
  return Array.from({ length: size }, () => Array(size).fill(color))
}

export function assembleCubeFromFaces(
  faces: Record<string, string[][]>,
  size = 3
): CubeState {
  // Flatten each NxN face into a size*size-element array
  const flattenFace = (face: string[][]): string[] => {
    return face.flat()
  }

  const cubeState: CubeState = {
    u: flattenFace(faces.U || solvedFace('U', size)),
    r: flattenFace(faces.R || solvedFace('R', size)),
    f: flattenFace(faces.F || solvedFace('F', size)),
    d: flattenFace(faces.D || solvedFace('D', size)),
    l: flattenFace(faces.L || solvedFace('L', size)),
    b: flattenFace(faces.B || solvedFace('B', size)),
  }

  return cubeState
}

// ─────────────────────────────────────────────────────────────────────────────
// Face identity + orientation solving
//
// The user captures 6 faces in an arbitrary physical orientation — the app
// has no way to know which capture is "the U face" or which way up it was
// held. For odd-sized cubes (3x3, 5x5, 7x7 — the ones with a fixed,
// non-rotating center piece), the center sticker's color directly and
// unambiguously identifies the face (WCA convention: White=U, Yellow=D,
// Green=F, Blue=B, Orange=L, Red=R). That alone fixes WHICH captured face
// is which, but not each face's ROTATION (0/90/180/270) relative to the
// other 5 — a corner or edge that should show a valid, physically-real
// color combination will only do so once every face is rotated correctly.
//
// Solved by corner cubies first, then edges, matching how a human (or a
// solver) actually reasons about a scrambled cube: corners are 3-way
// junctions (8 of them) and far more discriminating than edges (2-way,
// 12 of them) — wrong rotations are very unlikely to accidentally produce
// 8/8 valid corners, whereas a handful of edges alone leaves more
// ambiguity. Edges are used only to break ties among rotation assignments
// that already score equally well on corners.
// ─────────────────────────────────────────────────────────────────────────────

export type FaceKey = 'U' | 'R' | 'F' | 'D' | 'L' | 'B'
const FACE_KEYS: FaceKey[] = ['U', 'R', 'F', 'D', 'L', 'B']

const COLOR_TO_FACE: Record<string, FaceKey> = Object.fromEntries(
  Object.entries(SOLVED_FACE_COLOR).map(([face, color]) => [color, face as FaceKey])
) as Record<string, FaceKey>

type CornerPos = 'TL' | 'TR' | 'BL' | 'BR'
type EdgePos = 'top' | 'right' | 'bottom' | 'left'

// For each face, which named physical corner/edge occupies each of its 4
// corner / 4 edge-midpoint positions, in the face's UN-rotated (as-stored)
// orientation — i.e. reading the grid row0=top, row(N-1)=bottom, col0=left,
// col(N-1)=right, exactly as a human looks at that face from outside with
// U "up" and F "toward them," the standard convention this app's spaced
// facelet notation (see notationOutput.ts) already assumes.
const FACE_CORNERS: Record<FaceKey, Record<CornerPos, string>> = {
  U: { TL: 'UBL', TR: 'UBR', BL: 'UFL', BR: 'UFR' },
  F: { TL: 'UFL', TR: 'UFR', BL: 'DFL', BR: 'DFR' },
  R: { TL: 'UFR', TR: 'UBR', BL: 'DFR', BR: 'DBR' },
  B: { TL: 'UBR', TR: 'UBL', BL: 'DBR', BR: 'DBL' },
  L: { TL: 'UBL', TR: 'UFL', BL: 'DBL', BR: 'DFL' },
  D: { TL: 'DFL', TR: 'DFR', BL: 'DBL', BR: 'DBR' },
}

const FACE_EDGES: Record<FaceKey, Record<EdgePos, string>> = {
  U: { top: 'UB', right: 'UR', bottom: 'UF', left: 'UL' },
  F: { top: 'UF', right: 'FR', bottom: 'DF', left: 'FL' },
  R: { top: 'UR', right: 'BR', bottom: 'DR', left: 'FR' },
  B: { top: 'UB', right: 'BL', bottom: 'DB', left: 'BR' },
  L: { top: 'UL', right: 'FL', bottom: 'DL', left: 'BL' },
  D: { top: 'DF', right: 'DR', bottom: 'DB', left: 'DL' },
}

// Each named corner/edge's 3/2 touching faces, in a fixed reading order —
// matters only for internal consistency (gathering + validity-checking use
// the same order), not for any particular "correct" convention.
// Tuple order matters here (unlike EDGE_FACES below): it fixes which
// cyclic sticker-rotations count as a valid "twisted in place" corner vs.
// an unreachable mirror image, so it must follow the corner's actual
// geometric chirality (consistently CW or CCW as viewed from outside) —
// NOT a naive "U/D axis first" pattern, which looks reasonable but silently
// breaks validity checks on half the corners (verified against this app's
// server-side CORNER_FACELETS_3x3/SOLVED_CORNERS_3x3 tables).
const CORNER_FACES: Record<string, [FaceKey, FaceKey, FaceKey]> = {
  UFR: ['U', 'R', 'F'], UFL: ['U', 'F', 'L'], UBR: ['U', 'B', 'R'], UBL: ['U', 'L', 'B'],
  DFR: ['D', 'F', 'R'], DFL: ['D', 'L', 'F'], DBR: ['D', 'R', 'B'], DBL: ['D', 'B', 'L'],
}
const EDGE_FACES: Record<string, [FaceKey, FaceKey]> = {
  UF: ['U', 'F'], UR: ['U', 'R'], UB: ['U', 'B'], UL: ['U', 'L'],
  DF: ['D', 'F'], DR: ['D', 'R'], DB: ['D', 'B'], DL: ['D', 'L'],
  FR: ['F', 'R'], FL: ['F', 'L'], BR: ['B', 'R'], BL: ['B', 'L'],
}

function rotations<T>(arr: T[]): T[][] {
  return arr.map((_, i) => [...arr.slice(i), ...arr.slice(0, i)])
}

// All valid ordered triples/pairs, including every cyclic rotation (corner
// twist) / flip (edge flip) — both are legal states on a real, possibly-
// scrambled cube, so a "wrong-looking" order alone must not be flagged.
const VALID_CORNER_TRIPLES = new Set(
  Object.keys(CORNER_FACES).flatMap((name) => {
    const [f1, f2, f3] = CORNER_FACES[name]
    return rotations([SOLVED_FACE_COLOR[f1], SOLVED_FACE_COLOR[f2], SOLVED_FACE_COLOR[f3]]).map((t) => t.join(''))
  })
)
const VALID_EDGE_PAIRS = new Set(
  Object.keys(EDGE_FACES).flatMap((name) => {
    const [f1, f2] = EDGE_FACES[name]
    return rotations([SOLVED_FACE_COLOR[f1], SOLVED_FACE_COLOR[f2]]).map((p) => p.join(''))
  })
)

function rotateGrid(grid: string[][], quarterTurnsClockwise: number): string[][] {
  const turns = ((quarterTurnsClockwise % 4) + 4) % 4
  let result = grid
  for (let t = 0; t < turns; t++) {
    const n = result.length
    const next: string[][] = Array.from({ length: n }, () => Array(n).fill(''))
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        next[c][n - 1 - r] = result[r][c]
      }
    }
    result = next
  }
  return result
}

function cornerSticker(grid: string[][], pos: CornerPos): string {
  const n = grid.length
  if (pos === 'TL') return grid[0][0]
  if (pos === 'TR') return grid[0][n - 1]
  if (pos === 'BL') return grid[n - 1][0]
  return grid[n - 1][n - 1]
}

function edgeSticker(grid: string[][], pos: EdgePos): string {
  const n = grid.length
  const mid = Math.floor(n / 2) // representative sticker per side; enough as a corroborating signal
  if (pos === 'top') return grid[0][mid]
  if (pos === 'bottom') return grid[n - 1][mid]
  if (pos === 'left') return grid[mid][0]
  return grid[mid][n - 1]
}

export interface OrientationSolution {
  faces: Record<FaceKey, string[][]>
  rotations: Record<FaceKey, number>
  cornerScore: number // out of 8
  edgeScore: number // out of 12
}

/**
 * Identifies each captured face (via center-sticker color — odd sizes
 * only) and solves for the 0/90/180/270 rotation of each that maximizes
 * how many of the cube's 8 corners show a physically valid color triple,
 * using the 12 edges only to break ties. Returns null if center colors
 * don't identify all 6 faces uniquely (even-sized cube, or a capture
 * error), not if orientation-solving merely scores imperfectly — check
 * cornerScore/edgeScore against 8/12 to see how well-supported the result
 * is.
 */
export function solveFaceOrientations(
  capturedFaces: Record<string, string[][]>
): OrientationSolution | null {
  const size = Object.values(capturedFaces)[0]?.length
  if (!size || size % 2 === 0) return null // even sizes have no fixed center reference

  const byIdentity: Partial<Record<FaceKey, string[][]>> = {}
  for (const colors of Object.values(capturedFaces)) {
    const mid = Math.floor(size / 2)
    const centerColor = colors[mid][mid]
    const identity = COLOR_TO_FACE[centerColor]
    if (!identity || byIdentity[identity]) return null // unreadable or duplicate center color
    byIdentity[identity] = colors
  }
  if (FACE_KEYS.some((f) => !byIdentity[f])) return null
  const faces = byIdentity as Record<FaceKey, string[][]>

  let best: { rotations: Record<FaceKey, number>; cornerScore: number; edgeScore: number } | null = null

  for (let rU = 0; rU < 4; rU++) for (let rR = 0; rR < 4; rR++) for (let rF = 0; rF < 4; rF++)
  for (let rD = 0; rD < 4; rD++) for (let rL = 0; rL < 4; rL++) for (let rB = 0; rB < 4; rB++) {
    const rot: Record<FaceKey, number> = { U: rU, R: rR, F: rF, D: rD, L: rL, B: rB }
    const rotated: Record<FaceKey, string[][]> = {} as Record<FaceKey, string[][]>
    for (const f of FACE_KEYS) rotated[f] = rotateGrid(faces[f], rot[f])

    let cornerScore = 0
    for (const [name, [f1, f2, f3]] of Object.entries(CORNER_FACES)) {
      const posOf = (f: FaceKey) => (Object.entries(FACE_CORNERS[f]) as [CornerPos, string][]).find(([, n]) => n === name)![0]
      const triple = [
        cornerSticker(rotated[f1], posOf(f1)),
        cornerSticker(rotated[f2], posOf(f2)),
        cornerSticker(rotated[f3], posOf(f3)),
      ].join('')
      if (VALID_CORNER_TRIPLES.has(triple)) cornerScore++
    }

    if (!best || cornerScore > best.cornerScore) {
      // New corner-score leader: (re)compute edges only for the leader,
      // since edges only matter as a tiebreaker among equal corner scores.
      let edgeScore = 0
      for (const [name, [f1, f2]] of Object.entries(EDGE_FACES)) {
        const posOf = (f: FaceKey) => (Object.entries(FACE_EDGES[f]) as [EdgePos, string][]).find(([, n]) => n === name)![0]
        const pair = [edgeSticker(rotated[f1], posOf(f1)), edgeSticker(rotated[f2], posOf(f2))].join('')
        if (VALID_EDGE_PAIRS.has(pair)) edgeScore++
      }
      best = { rotations: rot, cornerScore, edgeScore }
    } else if (cornerScore === best.cornerScore) {
      let edgeScore = 0
      for (const [name, [f1, f2]] of Object.entries(EDGE_FACES)) {
        const posOf = (f: FaceKey) => (Object.entries(FACE_EDGES[f]) as [EdgePos, string][]).find(([, n]) => n === name)![0]
        const pair = [edgeSticker(rotated[f1], posOf(f1)), edgeSticker(rotated[f2], posOf(f2))].join('')
        if (VALID_EDGE_PAIRS.has(pair)) edgeScore++
      }
      if (edgeScore > best.edgeScore) best = { rotations: rot, cornerScore, edgeScore }
    }
  }

  if (!best) return null

  const finalFaces: Record<FaceKey, string[][]> = {} as Record<FaceKey, string[][]>
  for (const f of FACE_KEYS) finalFaces[f] = rotateGrid(faces[f], best.rotations[f])

  return { faces: finalFaces, rotations: best.rotations, cornerScore: best.cornerScore, edgeScore: best.edgeScore }
}

export function faceColorsToString(colors: string[][]): string {
  return colors.map(row => row.join(' ')).join('\n')
}

export function validateFaceColors(colors: string[][], size = 3): boolean {
  if (colors.length !== size) return false

  const validColors = new Set(['W', 'Y', 'O', 'R', 'G', 'B'])

  for (const row of colors) {
    if (row.length !== size) return false
    for (const color of row) {
      if (!validColors.has(color)) return false
    }
  }

  return true
}

export function createSolvedCube(size = 3): CubeState {
  return {
    u: Array(size * size).fill('W'),
    r: Array(size * size).fill('R'),
    f: Array(size * size).fill('G'),
    d: Array(size * size).fill('Y'),
    l: Array(size * size).fill('O'),
    b: Array(size * size).fill('B'),
  }
}

export function parseColorInput(input: string): Record<string, string[][]> | null {
  const faceData: Record<string, string[][]> = {}
  const validColors = new Set(['W', 'Y', 'O', 'R', 'G', 'B'])

  // Try compact format first: U:WWWWWWWWW R:RRRRRRRRR ... (ignore all whitespace)
  const compactMatch = input.match(/([URFDLB]):([A-Z]{9})/g)
  if (compactMatch && compactMatch.length > 0) {
    for (const match of compactMatch) {
      const [faceName, colors] = match.split(':')
      const colorChars = colors.split('')

      if (!colorChars.every(c => validColors.has(c))) {
        console.warn(`Face ${faceName} has invalid colors: ${colorChars.filter(c => !validColors.has(c)).join(',')}`)
        continue
      }

      faceData[faceName] = [
        [colorChars[0], colorChars[1], colorChars[2]],
        [colorChars[3], colorChars[4], colorChars[5]],
        [colorChars[6], colorChars[7], colorChars[8]],
      ]
    }

    if (Object.keys(faceData).length === 6) {
      return faceData
    }
  }

  // Fall back to line-by-line format: U W W W ... or U:W W W ...
  const lines = input
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'))

  for (const line of lines) {
    const [faceName, ...colorChars] = line.split(/[\s:,]+/).filter(s => s)

    if (!['U', 'R', 'F', 'D', 'L', 'B'].includes(faceName)) {
      console.warn(`Skipping invalid face: ${faceName}`)
      continue
    }

    if (colorChars.length !== 9) {
      console.warn(`Face ${faceName} has ${colorChars.length} colors, expected 9`)
      continue
    }

    const invalidColors = colorChars.filter(c => !validColors.has(c))
    if (invalidColors.length > 0) {
      console.warn(`Face ${faceName} has invalid colors: ${invalidColors.join(',')}`)
      continue
    }

    faceData[faceName] = [
      [colorChars[0], colorChars[1], colorChars[2]],
      [colorChars[3], colorChars[4], colorChars[5]],
      [colorChars[6], colorChars[7], colorChars[8]],
    ]
  }

  const missingFaces = ['U', 'R', 'F', 'D', 'L', 'B'].filter(f => !faceData[f])
  if (missingFaces.length > 0) {
    console.warn(`Missing faces: ${missingFaces.join(',')}`)
  }

  return Object.keys(faceData).length === 6 ? faceData : null
}

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
// server-side CORNER_SLOTS/SOLVED_CORNERS tables in server/Server.ts).
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

// Precomputed once: which position on each of a corner's/edge's touching
// faces it occupies, in the same face order as CORNER_FACES/EDGE_FACES.
// Static (independent of any particular capture or rotation), so computing
// it up front - rather than re-deriving it inside every scored combination,
// as an earlier version did - matters once the even-size search below adds
// a second, much larger search dimension (which capture is which face) on
// top of rotation alone.
const CORNER_POSITIONS: Record<string, [CornerPos, CornerPos, CornerPos]> = {}
for (const [name, [f1, f2, f3]] of Object.entries(CORNER_FACES)) {
  const posOf = (f: FaceKey) => (Object.entries(FACE_CORNERS[f]) as [CornerPos, string][]).find(([, n]) => n === name)![0]
  CORNER_POSITIONS[name] = [posOf(f1), posOf(f2), posOf(f3)]
}
const EDGE_POSITIONS: Record<string, [EdgePos, EdgePos]> = {}
for (const [name, [f1, f2]] of Object.entries(EDGE_FACES)) {
  const posOf = (f: FaceKey) => (Object.entries(FACE_EDGES[f]) as [EdgePos, string][]).find(([, n]) => n === name)![0]
  EDGE_POSITIONS[name] = [posOf(f1), posOf(f2)]
}

function scoreCorners(faces: Record<FaceKey, string[][]>): number {
  let score = 0
  for (const [name, [f1, f2, f3]] of Object.entries(CORNER_FACES)) {
    const [p1, p2, p3] = CORNER_POSITIONS[name]
    const triple = cornerSticker(faces[f1], p1) + cornerSticker(faces[f2], p2) + cornerSticker(faces[f3], p3)
    if (VALID_CORNER_TRIPLES.has(triple)) score++
  }
  return score
}

function scoreEdges(faces: Record<FaceKey, string[][]>): number {
  let score = 0
  for (const [name, [f1, f2]] of Object.entries(EDGE_FACES)) {
    const [p1, p2] = EDGE_POSITIONS[name]
    const pair = edgeSticker(faces[f1], p1) + edgeSticker(faces[f2], p2)
    if (VALID_EDGE_PAIRS.has(pair)) score++
  }
  return score
}

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

type BestCandidate = { faces: Record<FaceKey, string[][]>; rotations: Record<FaceKey, number>; cornerScore: number; edgeScore: number }

// Scores one fully-assigned, fully-rotated candidate and folds it into
// `best` if it beats the current leader (more valid corners first, valid
// edges as the tiebreaker) - shared by both the odd-size (identity known,
// rotation-only) and even-size (identity + rotation) searches below so
// the corner-before-edge reduction logic exists in exactly one place.
function considerCandidate(
  faces: Record<FaceKey, string[][]>,
  rotations: Record<FaceKey, number>,
  best: BestCandidate | null
): BestCandidate | null {
  const cornerScore = scoreCorners(faces)
  if (best && cornerScore < best.cornerScore) return best
  if (best && cornerScore === best.cornerScore) {
    const edgeScore = scoreEdges(faces)
    return edgeScore > best.edgeScore ? { faces, rotations, cornerScore, edgeScore } : best
  }
  return { faces, rotations, cornerScore, edgeScore: scoreEdges(faces) }
}

// Odd sizes (3x3, 5x5, 7x7): each face's fixed center sticker identifies
// it unambiguously, so only rotation (4^6 = 4096 combinations) needs
// solving. Returns null if center colors don't identify all 6 faces
// uniquely (duplicate or unreadable center).
function solveOddSizeOrientations(capturedFaces: Record<string, string[][]>, size: number): OrientationSolution | null {
  const byIdentity: Partial<Record<FaceKey, string[][]>> = {}
  for (const colors of Object.values(capturedFaces)) {
    const mid = Math.floor(size / 2)
    const identity = COLOR_TO_FACE[colors[mid][mid]]
    if (!identity || byIdentity[identity]) return null // unreadable or duplicate center color
    byIdentity[identity] = colors
  }
  if (FACE_KEYS.some((f) => !byIdentity[f])) return null
  const faces = byIdentity as Record<FaceKey, string[][]>

  let best: BestCandidate | null = null
  for (let rU = 0; rU < 4; rU++) for (let rR = 0; rR < 4; rR++) for (let rF = 0; rF < 4; rF++)
  for (let rD = 0; rD < 4; rD++) for (let rL = 0; rL < 4; rL++) for (let rB = 0; rB < 4; rB++) {
    const rot: Record<FaceKey, number> = { U: rU, R: rR, F: rF, D: rD, L: rL, B: rB }
    const rotated: Record<FaceKey, string[][]> = {} as Record<FaceKey, string[][]>
    for (const f of FACE_KEYS) rotated[f] = rotateGrid(faces[f], rot[f])
    best = considerCandidate(rotated, rot, best)
  }
  return best
}

function permutations<T>(arr: T[]): T[][] {
  if (arr.length <= 1) return [arr]
  const result: T[][] = []
  for (let i = 0; i < arr.length; i++) {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)]
    for (const p of permutations(rest)) result.push([arr[i], ...p])
  }
  return result
}

// Even sizes (2x2, 4x4, 6x6): center stickers belong to independently-
// rotatable center cubies, not a single fixed reference cubie, so unlike
// odd sizes there is no shortcut to each face's identity - it has to be
// searched for jointly with rotation, using the same corner/edge validity
// scoring. Which of the 6 captures is U/R/F/D/L/B, and each's rotation,
// is 6! x 4^6 = 2,949,120 combinations - too many to search plainly.
// Fixing capture #1 as U at rotation 0 cuts that by the cube's 24-element
// rotation group (any solution can be re-expressed, as a whole, with
// capture #1 in that position without changing which corners/edges are
// valid - reconstructing a cube from photos alone has no way to know
// which face is "really" U anyway, so any one consistent labeling is as
// good as another), leaving 5! x 4^5 = 122,880 - fast enough in practice.
function solveEvenSizeOrientations(capturedFaces: Record<string, string[][]>): OrientationSolution | null {
  const captures = Object.values(capturedFaces)
  if (captures.length !== 6) return null

  const [firstCapture, ...rest] = captures
  const otherKeys: FaceKey[] = ['R', 'F', 'D', 'L', 'B']

  // Precompute every capture's 4 rotations once, rather than re-rotating
  // inside the ~123K-combination search below.
  const firstRotated = rotateGrid(firstCapture, 0)
  const restRotations = rest.map((capture) => [0, 1, 2, 3].map((r) => rotateGrid(capture, r)))

  let best: BestCandidate | null = null
  for (const order of permutations([0, 1, 2, 3, 4])) {
    for (let mask = 0; mask < 1024; mask++) {
      const rotations: Record<FaceKey, number> = { U: 0 } as Record<FaceKey, number>
      const faces: Record<FaceKey, string[][]> = { U: firstRotated } as Record<FaceKey, string[][]>
      for (let slot = 0; slot < 5; slot++) {
        const captureIdx = order[slot]
        const rot = (mask >> (slot * 2)) & 0b11
        rotations[otherKeys[slot]] = rot
        faces[otherKeys[slot]] = restRotations[captureIdx][rot]
      }
      best = considerCandidate(faces, rotations, best)
    }
  }
  return best
}

/**
 * Identifies each captured face and solves for the 0/90/180/270 rotation
 * of each that maximizes how many of the cube's 8 corners show a
 * physically valid color triple, using the 12 edges only to break ties
 * among equally-good rotations. Odd sizes (3x3, 5x5, 7x7) get face
 * identity for free from each face's fixed center sticker; even sizes
 * (2x2, 4x4, 6x6) have no such reference and must search for identity
 * jointly with rotation (see solveEvenSizeOrientations). Returns null if
 * face identity can't be determined at all (odd: duplicate/unreadable
 * center; even: not exactly 6 captures) - not if orientation-solving
 * merely scores imperfectly, which check cornerScore/edgeScore against
 * 8/12 for.
 */
export function solveFaceOrientations(
  capturedFaces: Record<string, string[][]>
): OrientationSolution | null {
  const size = Object.values(capturedFaces)[0]?.length
  if (!size) return null
  return size % 2 === 1
    ? solveOddSizeOrientations(capturedFaces, size)
    : solveEvenSizeOrientations(capturedFaces)
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


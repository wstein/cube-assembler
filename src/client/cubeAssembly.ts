// Cube state assembly from captured faces

import { allOrientations } from './cubeGeometry'

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

// On N>3, an edge's two faces don't always read their shared wing
// positions in the same direction: UR/UB/DB/DL's second-listed face (R/B/
// B/L respectively) reads its wing index MIRRORED relative to the first
// face (U/U/D/D), while the other 8 edges read both faces the same way.
// This exactly mirrors server/Server.ts's EDGE_LINES table (reverseB),
// which was derived from explicit 3D coordinates after a naive corner-
// adjacency-based guess got these same 4 edges wrong - see that table's
// comment for the full story. Invisible on N=3 (single, self-symmetric
// wing position, so "mirrored" and "forward" read the same index), which
// is exactly why this went unnoticed here until a real N=4 capture
// produced a same-shape false "edge mismatch" warning on a genuinely
// valid cube (parity's wingEdgeColors check, which already used the
// correct server-side convention, agreed the cube was fine).
const EDGES_WITH_MIRRORED_SECOND_FACE = new Set(['UR', 'UB', 'DB', 'DL'])

function scoreEdges(faces: Record<FaceKey, string[][]>): number {
  let score = 0
  for (const [name, [f1, f2]] of Object.entries(EDGE_FACES)) {
    const [p1, p2] = EDGE_POSITIONS[name]
    const mirrored = EDGES_WITH_MIRRORED_SECOND_FACE.has(name)
    const pair = edgeSticker(faces[f1], p1, false) + edgeSticker(faces[f2], p2, mirrored)
    if (VALID_EDGE_PAIRS.has(pair)) score++
  }
  return score
}

// ─────────────────────────────────────────────────────────────────────────────
// Full validity (distinct pieces + orientation sums + matching permutation
// parity) - mirrors server/Server.ts's runFullParity exactly, but as a
// filter the rotation SEARCH itself optimizes for, not a check the server
// runs afterward on whatever the search already committed to.
//
// scoreCorners/scoreEdges above check each of the 8/12 named positions'
// triple/pair against the SET of physically-real pieces independently -
// "is this ANY valid corner" - with no requirement that two positions
// don't match the SAME physical piece. A rotation assignment that reads
// one piece into two different slots (while another piece's slot goes
// unfilled) can score a perfect 8/8 or 12/12 that way despite being
// physically impossible, and the exhaustive search below has no reason to
// prefer the genuinely-correct rotation over that kind of decoy - both
// score identically under scoreCorners/scoreEdges alone. This is exactly
// the gap a real capture hit: cornerColors and cornerOrientation both
// reported valid, yet the corner-piece list was [0,1,1,0,7,6,6,7] - pieces
// 0/1/6/7 doubled, 2/3/4/5 never appearing - which only the server's
// stricter bijection-based permParity caught (2026-09-23 design
// discussion). Fixed at the source: identify WHICH of the 8/12 canonical
// pieces each position actually is (not just "some" valid one), reject
// outright the moment two positions claim the same piece, and require the
// same orientation-sum and permutation-parity invariants the server does
// - so the search only ever accepts a genuinely reachable cube state when
// one exists among the candidates, instead of merely a locally-plausible-
// looking one.
// ─────────────────────────────────────────────────────────────────────────────

const CORNER_NAMES = Object.keys(CORNER_FACES)
const SOLVED_CORNER_TRIPLE: Record<string, [string, string, string]> = Object.fromEntries(
  CORNER_NAMES.map((name) => {
    const [f1, f2, f3] = CORNER_FACES[name]
    return [name, [SOLVED_FACE_COLOR[f1], SOLVED_FACE_COLOR[f2], SOLVED_FACE_COLOR[f3]]]
  })
)
const EDGE_NAMES = Object.keys(EDGE_FACES)
const SOLVED_EDGE_PAIR: Record<string, [string, string]> = Object.fromEntries(
  EDGE_NAMES.map((name) => {
    const [f1, f2] = EDGE_FACES[name]
    return [name, [SOLVED_FACE_COLOR[f1], SOLVED_FACE_COLOR[f2]]]
  })
)

// Which of the 8 canonical corners the sticker triple AT a position
// actually is (by name, not just position identity) and its twist (0/1/2)
// relative to that piece's solved orientation - null if the triple is an
// impossible combination (e.g. two same colors, or two opposite colors,
// touching) that matches no real corner at all.
function identifyCorner(triple: [string, string, string]): { name: string; twist: number } | null {
  for (const name of CORNER_NAMES) {
    const sc = SOLVED_CORNER_TRIPLE[name]
    for (let rot = 0; rot < 3; rot++) {
      if (triple[rot % 3] === sc[0] && triple[(rot + 1) % 3] === sc[1] && triple[(rot + 2) % 3] === sc[2]) {
        return { name, twist: rot }
      }
    }
  }
  return null
}
function identifyEdge(pair: [string, string]): { name: string; flip: number } | null {
  for (const name of EDGE_NAMES) {
    const se = SOLVED_EDGE_PAIR[name]
    if (pair[0] === se[0] && pair[1] === se[1]) return { name, flip: 0 }
    if (pair[0] === se[1] && pair[1] === se[0]) return { name, flip: 1 }
  }
  return null
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

// ─────────────────────────────────────────────────────────────────────────────
// Wing-edge validity for N>3 - mirrors server/Server.ts's EDGE_LINES/
// validateWingEdges, ported to this file's string[][] grid representation
// (server's tables index a flat per-face array; these read the same
// positions via row/col on a 2D grid instead).
//
// Real bug this fixes: isFullyValid used to return true for n!==3 right
// after the corner checks passed - corners alone don't fully constrain a
// 4x4+'s per-face rotation (many different rotations of U/R/etc. can
// still leave all 8 corners valid and distinct), so the search had ZERO
// signal telling it a corner-valid candidate's WINGS were scrambled, and
// could - and did, on a real reported capture - settle on one with U
// rotated 180deg and R rotated 90deg CW away from the only wing-consistent
// answer. Confirmed live: server/Server.ts's validateWingEdges (which
// DOES check this, just after the fact rather than inside the search)
// correctly flagged that exact capture's result as wing-unbalanced.
// ─────────────────────────────────────────────────────────────────────────────

type EdgeLineType = 'TOP' | 'BOTTOM' | 'LEFT' | 'RIGHT'
function edgeLineSticker(grid: string[][], line: EdgeLineType, reverse: boolean, w: number): string {
  const n = grid.length
  const pos = reverse ? n - 1 - w : w
  switch (line) {
    case 'TOP': return grid[0][pos]
    case 'BOTTOM': return grid[n - 1][pos]
    case 'LEFT': return grid[pos][0]
    case 'RIGHT': return grid[pos][n - 1]
  }
}

// [edgeName, faceA, lineA, reverseA, faceB, lineB, reverseB] - index-
// parallel with EDGE_NAMES (both derived from/matching EDGE_FACES' key
// order). reverse=true means the wing at distance w from the edge's
// first-listed corner endpoint reads that face's line at (N-1-w), not w -
// see server/Server.ts's EDGE_LINES for the full derivation story (a
// naive corner-adjacency guess got UR/UB/DB/DL backwards; this is
// reverse-checked against that already-verified table, not re-derived).
const WING_EDGE_LINES: Array<[FaceKey, EdgeLineType, boolean, FaceKey, EdgeLineType, boolean]> = [
  ['U', 'BOTTOM', false, 'F', 'TOP', false],
  ['U', 'RIGHT', false, 'R', 'TOP', true],
  ['U', 'TOP', false, 'B', 'TOP', true],
  ['U', 'LEFT', false, 'L', 'TOP', false],
  ['D', 'TOP', false, 'F', 'BOTTOM', false],
  ['D', 'RIGHT', false, 'R', 'BOTTOM', false],
  ['D', 'BOTTOM', false, 'B', 'BOTTOM', true],
  ['D', 'LEFT', false, 'L', 'BOTTOM', true],
  ['F', 'RIGHT', false, 'R', 'LEFT', false],
  ['F', 'LEFT', false, 'L', 'RIGHT', false],
  ['B', 'LEFT', false, 'R', 'RIGHT', false],
  ['B', 'RIGHT', false, 'L', 'LEFT', false],
]

// Counting check only (not full permutation/orientation, which would need
// per-wing-depth orbit tracking on N>=5 - see server/Server.ts's
// validateWingEdges for why that's future work, not a gap introduced
// here): every wing sticker pair must be one of the 12 canonical pairs
// (opposite/same colors touching is physically impossible anywhere on a
// real cube), AND each canonical pair must appear exactly N-2 times
// across all wings, since a specific wing piece has a fixed color pair
// and fixed total supply. Weaker than a full check on N>=5 (could miss a
// cross-depth imbalance) but can only ever accept too much, never falsely
// reject a real cube - and it's still strictly more than the "nothing at
// all" this replaces.
function wingEdgeCountsValid(faces: Record<FaceKey, string[][]>, n: number): boolean {
  const counts = new Array(EDGE_NAMES.length).fill(0)
  for (const [faceA, lineA, reverseA, faceB, lineB, reverseB] of WING_EDGE_LINES) {
    for (let w = 1; w <= n - 2; w++) {
      const c0 = edgeLineSticker(faces[faceA], lineA, reverseA, w)
      const c1 = edgeLineSticker(faces[faceB], lineB, reverseB, w)
      let found = false
      for (let pi = 0; pi < EDGE_NAMES.length; pi++) {
        const [p0, p1] = SOLVED_EDGE_PAIR[EDGE_NAMES[pi]]
        if ((c0 === p0 && c1 === p1) || (c0 === p1 && c1 === p0)) { counts[pi]++; found = true; break }
      }
      if (!found) return false
    }
  }
  const expected = n - 2
  return counts.every((c) => c === expected)
}

function isFullyValid(faces: Record<FaceKey, string[][]>): boolean {
  const n = faces.U.length
  const cornerIndexByName = new Map(CORNER_NAMES.map((name, i) => [name, i]))
  const cornerPieces: number[] = []
  const cornerTwists: number[] = []
  const usedCorners = new Set<string>()
  for (const [name, [f1, f2, f3]] of Object.entries(CORNER_FACES)) {
    const [p1, p2, p3] = CORNER_POSITIONS[name]
    const triple: [string, string, string] = [
      cornerSticker(faces[f1], p1), cornerSticker(faces[f2], p2), cornerSticker(faces[f3], p3),
    ]
    const id = identifyCorner(triple)
    if (!id || usedCorners.has(id.name)) return false
    usedCorners.add(id.name)
    cornerPieces.push(cornerIndexByName.get(id.name)!)
    cornerTwists.push(id.twist)
  }
  if (cornerTwists.reduce((a, b) => a + b, 0) % 3 !== 0) return false

  // 2x2 has no edges at all - corner distinctness + orientation is the
  // complete validity model there.
  if (n === 2) return true
  // 4x4+ edges split into wings - counting check only (see
  // wingEdgeCountsValid), not full permutation/orientation like n===3
  // gets below, but real coverage where there used to be none at all.
  if (n > 3) return wingEdgeCountsValid(faces, n)

  const edgeIndexByName = new Map(EDGE_NAMES.map((name, i) => [name, i]))
  const edgePieces: number[] = []
  const edgeFlips: number[] = []
  const usedEdges = new Set<string>()
  for (const [name, [f1, f2]] of Object.entries(EDGE_FACES)) {
    const [p1, p2] = EDGE_POSITIONS[name]
    const mirrored = EDGES_WITH_MIRRORED_SECOND_FACE.has(name)
    const pair: [string, string] = [edgeSticker(faces[f1], p1, false), edgeSticker(faces[f2], p2, mirrored)]
    const id = identifyEdge(pair)
    if (!id || usedEdges.has(id.name)) return false
    usedEdges.add(id.name)
    edgePieces.push(edgeIndexByName.get(id.name)!)
    edgeFlips.push(id.flip)
  }
  if (edgeFlips.reduce((a, b) => a + b, 0) % 2 !== 0) return false

  return permParity(cornerPieces) === permParity(edgePieces)
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

function edgeSticker(grid: string[][], pos: EdgePos, mirrored: boolean): string {
  const n = grid.length
  const raw = Math.floor(n / 2) // representative sticker per side; enough as a corroborating signal
  const mid = mirrored ? n - 1 - raw : raw
  if (pos === 'top') return grid[0][mid]
  if (pos === 'bottom') return grid[n - 1][mid]
  if (pos === 'left') return grid[mid][0]
  return grid[mid][n - 1]
}

export interface OrientedCandidate {
  faces: Record<FaceKey, string[][]>
  rotations: Record<FaceKey, number>
}

export interface OrientationSolution {
  faces: Record<FaceKey, string[][]>
  rotations: Record<FaceKey, number>
  cornerScore: number // out of 8
  // out of 12 - NaN on a 2x2, which has no edge pieces at all (all 8
  // pieces are corners): scoring "edges" there would mean re-reading
  // corner stickers as if they were something else, a category error, not
  // just a less-useful signal. Callers must check size (or Number.isNaN)
  // before displaying this, rather than assuming it's always meaningful.
  edgeScore: number
  // Whether this candidate passed isFullyValid (distinct pieces, correct
  // orientation sums, matching permutation parity) - the thing that
  // actually matters for the assembled cube to be physically reachable.
  // cornerScore===8 (and edgeScore===12) does NOT imply this: those only
  // check each position independently, not that they're distinct pieces.
  // False here alongside a perfect cornerScore/edgeScore means every
  // position looked locally plausible but no candidate in the whole
  // search space was actually a reachable cube - a genuinely bad capture
  // (a misread color), not a rotation problem this solver can fix.
  fullyValid: boolean
  // Every DISTINCT candidate tied for the winning (fullyValid, cornerScore,
  // edgeScore) score, deduped by actual resulting sticker content (not by
  // rotation-parameter identity - a uniformly-colored face rotated any
  // amount produces byte-identical content, so a solved cube's ~4096
  // trivially-tied rotation combinations correctly collapse to just 1
  // entry here, not 4096). Length 1 in the overwhelming common case: a
  // real capture with actual color variation almost always pins down a
  // unique rotation. Length >1 means the capture is genuinely ambiguous
  // - e.g. the whole cube could be reoriented (front/back, left/right
  // swapped) and still read as equally valid from the photographed colors
  // alone - which only the person holding the physical cube can resolve.
  // `faces`/`rotations` above always mirror alternatives[0]; capped at
  // MAX_ALTERNATIVES (see its comment) so a pathological capture can't
  // produce an unusable wall of options - see `truncated` below for
  // knowing when that cap actually bound.
  alternatives: OrientedCandidate[]
  // True when more genuinely-distinct tied candidates existed than
  // MAX_ALTERNATIVES could keep - i.e. `alternatives` is an arbitrary
  // (search-order-dependent) subset, not the complete set. A caller must
  // surface this rather than silently presenting `alternatives` as
  // exhaustive: the customer's actual physical orientation could be one
  // of the discarded ones. Real-world captures essentially never hit
  // this (see MAX_ALTERNATIVES's comment) - a highly regular/repeating
  // capture (e.g. a checkerboard-style test pattern, or 2+ faces that are
  // literal duplicates of each other) can.
  truncated: boolean
}

// Cap on how many distinct tied-for-best candidates to keep. Bounds
// memory/UI on a pathological input (e.g. a capture with almost no color
// variation, or a highly regular repeating pattern) - a real capture with
// actual color variation almost always pins down a unique rotation or, at
// most, a handful of genuinely-tied alternatives. NOT a guarantee this
// never binds, though: a real reported case (a 4x4 with independently-
// symmetric R/D/L wing patterns) hit 36 genuine ties, which the previous
// cap of 8 silently truncated - i.e. potentially discarding the
// customer's actual correct orientation. `truncated` above exists exactly
// so a caller is never left assuming an incomplete list is the whole
// story; this cap only needs to be "generous," not literally unbounded.
const MAX_ALTERNATIVES = 48

// Canonical string encoding of a candidate's actual resulting sticker
// content, for dedup - NOT of its rotation parameters, which can differ
// while producing byte-identical content (any rotation of a uniformly-
// colored face) and must be treated as the same candidate, not a genuine
// alternative.
function faceSetSignature(faces: Record<FaceKey, string[][]>): string {
  return FACE_KEYS.map((f) => faces[f].map((row) => row.join('')).join('')).join('|')
}

type BestCandidates = {
  cornerScore: number
  edgeScore: number
  fullyValid: boolean
  alternatives: OrientedCandidate[]
  seenSignatures: Set<string>
  truncated: boolean
}

// Scores one fully-assigned, fully-rotated candidate and folds it into
// `best` - shared by both the odd-size (identity known, rotation-only)
// and even-size (identity + rotation) searches below so the reduction
// logic exists in exactly one place. Collects EVERY distinct candidate
// tied for the winning score (see OrientationSolution.alternatives), not
// just one - a plain "keep the single best" reduction would silently
// discard genuine orientation ambiguity instead of surfacing it.
//
// Priority: a fully-valid candidate (isFullyValid - see its comment for
// why this is a separate, stricter check from cornerScore/edgeScore)
// ALWAYS beats a not-fully-valid one, full stop, regardless of score -
// there is no such thing as a "better" physically-impossible cube. Among
// candidates tied on validity, more valid corners first, valid edges as
// the tiebreaker (matches the pre-existing behavior, still relevant for
// ranking imperfect candidates when NO fully-valid one exists in the
// search space at all - a genuinely bad capture, not a rotation problem).
// On a 2x2 (no edge pieces to score), corner validity is the only signal.
function considerCandidate(
  faces: Record<FaceKey, string[][]>,
  rotations: Record<FaceKey, number>,
  best: BestCandidates | null
): BestCandidates | null {
  const hasEdges = faces.U.length > 2
  const fullyValid = isFullyValid(faces)
  const cornerScore = scoreCorners(faces)
  const edgeScore = hasEdges ? scoreEdges(faces) : NaN

  const beatsBest = !best
    || (fullyValid && !best.fullyValid)
    || (fullyValid === best.fullyValid && cornerScore > best.cornerScore)
    || (fullyValid === best.fullyValid && cornerScore === best.cornerScore && hasEdges && edgeScore > best.edgeScore)
  if (beatsBest) {
    return {
      cornerScore, edgeScore, fullyValid,
      alternatives: [{ faces, rotations }],
      seenSignatures: new Set([faceSetSignature(faces)]),
      truncated: false,
    }
  }

  const tiesBest = best !== null
    && fullyValid === best.fullyValid
    && cornerScore === best.cornerScore
    && (!hasEdges || edgeScore === best.edgeScore)
  if (tiesBest && best) {
    const signature = faceSetSignature(faces)
    if (!best.seenSignatures.has(signature)) {
      if (best.alternatives.length < MAX_ALTERNATIVES) {
        best.seenSignatures.add(signature)
        best.alternatives.push({ faces, rotations })
      } else {
        best.truncated = true
      }
    }
  }
  return best
}

// Odd sizes (3x3, 5x5, 7x7): each face's fixed center sticker identifies
// it unambiguously, so only rotation (4^6 = 4096 combinations) needs
// solving. Returns null if center colors don't identify all 6 faces
// uniquely (duplicate or unreadable center).
//
// Both odd and even sizes surface every genuinely-distinct tied
// alternative (see OrientationSolution.alternatives) - a previous version
// canonicalized even sizes down to a single choice on the theory that
// solveEvenSizeOrientations already deliberately pins one capture's
// identity+rotation ("reconstructing a cube from photos alone has no way
// to know which face is really which anyway, so any one consistent
// labeling is as good as another"), so any remaining tie must be that
// same kind of arbitrary whole-cube-relabeling freedom, not a genuine
// question about where any piece physically is. That reasoning covers a
// real degenerate case (a solved cube: every tie there really is just
// "which capture do we call R," and its assembled state is identical
// either way) but does NOT cover the general case: a real reported 4x4
// capture had 36 genuinely-distinct tied alternatives where the fixed
// anchor face stayed constant (by construction) while every other face
// varied independently and inconsistently (one even landing on only 2 of
// its 4 possible rotations, not all 4) - not expressible as a single
// whole-cube rotation, so a materially different assembled cube each
// time. Telling those two situations apart in general would need a full
// 24-element whole-cube-rotation-equivalence detector; surfacing every
// distinct-by-content tie either way is the safe default (the solved-cube
// case just costs the customer one extra, harmless click among
// equally-valid options; silently guessing on the 4x4 case could hand
// back the wrong cube).
function toOrientationSolution(best: BestCandidates | null): OrientationSolution | null {
  if (!best) return null
  return {
    faces: best.alternatives[0].faces,
    rotations: best.alternatives[0].rotations,
    cornerScore: best.cornerScore,
    edgeScore: best.edgeScore,
    fullyValid: best.fullyValid,
    alternatives: best.alternatives,
    truncated: best.truncated,
  }
}

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

  let best: BestCandidates | null = null
  for (let rU = 0; rU < 4; rU++) for (let rR = 0; rR < 4; rR++) for (let rF = 0; rF < 4; rF++)
  for (let rD = 0; rD < 4; rD++) for (let rL = 0; rL < 4; rL++) for (let rB = 0; rB < 4; rB++) {
    const rot: Record<FaceKey, number> = { U: rU, R: rR, F: rF, D: rD, L: rL, B: rB }
    const rotated: Record<FaceKey, string[][]> = {} as Record<FaceKey, string[][]>
    for (const f of FACE_KEYS) rotated[f] = rotateGrid(faces[f], rot[f])
    best = considerCandidate(rotated, rot, best)
  }
  return toOrientationSolution(best)
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
// U is the anchor specifically so the orientation wizard (see index.tsx)
// can treat it as the one face customers never have to answer a question
// about - Up is given, then F/R/L/D/B are asked about as needed.
function solveEvenSizeOrientations(capturedFaces: Record<string, string[][]>): OrientationSolution | null {
  const captures = Object.values(capturedFaces)
  if (captures.length !== 6) return null

  const [firstCapture, ...rest] = captures
  const otherKeys: FaceKey[] = ['R', 'F', 'D', 'L', 'B']

  // Precompute every capture's 4 rotations once, rather than re-rotating
  // inside the ~123K-combination search below.
  const firstRotated = rotateGrid(firstCapture, 0)
  const restRotations = rest.map((capture) => [0, 1, 2, 3].map((r) => rotateGrid(capture, r)))

  let best: BestCandidates | null = null
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
  return toOrientationSolution(best)
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

// ─────────────────────────────────────────────────────────────────────────────
// Guided capture: the 4 side faces are photographed in order while the cube
// is turned a quarter turn at a time around its vertical axis (either way,
// top row kept on top), then the top and bottom faces in either order and
// at any rotation. That leaves 2 turning directions x 2 top/bottom orders x
// 4 x 4 top/bottom rotations = 64 arrangements to check, instead of
// solveFaceOrientations' 4,096 (odd) or 122,880 (even) - and no assumption
// about which colors are on the sides or on top.
// ─────────────────────────────────────────────────────────────────────────────

export interface GuidedCapture {
  // The 4 side photos in capture order, each taken upright.
  sides: [string[][], string[][], string[][], string[][]]
  // The two remaining photos in capture order - top and bottom, either way
  // round, each at any rotation.
  caps: [string[][], string[][]]
}

// How the photos were put together for one arrangement.
export interface GuidedArrangement {
  // Which way the cube was turned between side photos: 'left' means the
  // face that was on the right came to the front next.
  turn: 'left' | 'right'
  // True if the second of the two cap photos is the top.
  capsSwapped: boolean
  // Quarter turns clockwise applied to cap photo 1 and 2.
  capRotations: [number, number]
}

export interface GuidedSolution extends OrientationSolution {
  // Parallel to `alternatives`: how each was put together.
  arrangements: GuidedArrangement[]
}

const OPPOSITE_COLOR: Record<string, string> = { W: 'Y', Y: 'W', R: 'O', O: 'R', G: 'B', B: 'G' }

// For either direction around the four upright sides, side 3 is opposite
// side 1 and side 4 is opposite side 2. This is only a preview; a user may
// present the faces in another order, and the final search resolves that.
export function predictGuidedSideCenter(photos: Array<string[][] | undefined>, nextSide: number): string | null {
  const n = photos[0]?.length
  if (n !== 3 && n !== 5 && n !== 7) return null
  if (nextSide !== 2 && nextSide !== 3) return null
  if (photos[1]?.length !== n || photos[nextSide]) return null
  const mid = Math.floor(n / 2)
  const first = photos[0]?.[mid]?.[mid]
  const second = photos[1]?.[mid]?.[mid]
  if (!first || !second || !OPPOSITE_COLOR[first] || !OPPOSITE_COLOR[second]) return null
  if (first === second || OPPOSITE_COLOR[first] === second) return null
  return OPPOSITE_COLOR[nextSide === 2 ? first : second]
}

// How many stickers already sit on the face of their own color - used to
// pick which of the 24 whole-cube orientations to present an arrangement
// in. Centers count far more on odd sizes, since they pin each face's
// identity; even sizes have none, so the orientation closest to the
// standard look is as good as any other (all are equally valid there).
function standardLookScore(faces: Record<FaceKey, string[][]>): number {
  const n = faces.U.length
  const mid = Math.floor(n / 2)
  let score = 0
  for (const f of FACE_KEYS) {
    const color = SOLVED_FACE_COLOR[f]
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (faces[f][r][c] === color) score++
    if (n % 2 === 1 && faces[f][mid][mid] === color) score += 1000
  }
  return score
}

// On odd sizes the cube's validity depends on how the whole cube is held:
// piece identities and parity are judged against the standard color
// scheme (SOLVED_FACE_COLOR), which puts white on U. So an arrangement in
// the capture's own frame - any color on top - must be turned into
// standard orientation before it's judged. (Even sizes have no fixed
// centers; every orientation of a valid cube is valid, so this only picks
// a familiar-looking one.)
function toStandardOrientation(faces: Record<FaceKey, string[][]>): Record<FaceKey, string[][]> {
  let best = faces
  let bestScore = -1
  for (const oriented of allOrientations(faces)) {
    const score = standardLookScore(oriented)
    if (score > bestScore) { best = oriented; bestScore = score }
  }
  return best
}

// Same content held differently is the same cube: the smallest signature
// over all 24 orientations identifies it regardless of how it's held.
export function orientationFreeSignature(faces: Record<FaceKey, string[][]>): string {
  return allOrientations(faces).map(faceSetSignature).sort()[0]
}

export function solveGuidedCapture(capture: GuidedCapture): GuidedSolution | null {
  const n = capture.sides[0]?.length
  if (!n || [...capture.sides, ...capture.caps].some((g) => g?.length !== n)) return null
  const [s1, s2, s3, s4] = capture.sides

  type Scored = { faces: Record<FaceKey, string[][]>; arrangement: GuidedArrangement; fullyValid: boolean; cornerScore: number; edgeScore: number }
  const scored: Scored[] = []
  for (const turn of ['left', 'right'] as const) {
    for (const capsSwapped of [false, true]) {
      for (let r1 = 0; r1 < 4; r1++) {
        for (let r2 = 0; r2 < 4; r2++) {
          const cap1 = rotateGrid(capture.caps[0], r1)
          const cap2 = rotateGrid(capture.caps[1], r2)
          // Turning left brings the right-hand face to the front, so the
          // second side photo is R; turning right, it's L.
          const frame: Record<FaceKey, string[][]> = {
            F: s1, R: turn === 'left' ? s2 : s4, B: s3, L: turn === 'left' ? s4 : s2,
            U: capsSwapped ? cap2 : cap1, D: capsSwapped ? cap1 : cap2,
          }
          const faces = toStandardOrientation(frame)
          scored.push({
            faces,
            arrangement: { turn, capsSwapped, capRotations: [r1, r2] },
            fullyValid: isFullyValid(faces),
            cornerScore: scoreCorners(faces),
            edgeScore: n > 2 ? scoreEdges(faces) : NaN,
          })
        }
      }
    }
  }

  const rank = (a: Scored) => [a.fullyValid ? 1 : 0, a.cornerScore, Number.isNaN(a.edgeScore) ? 0 : a.edgeScore]
  const compare = (a: Scored, b: Scored) => {
    const [ra, rb] = [rank(a), rank(b)]
    for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return rb[i] - ra[i]
    return 0
  }
  scored.sort(compare)
  const top = scored.filter((c) => compare(c, scored[0]) === 0)

  const seen = new Set<string>()
  const unique = top.filter((c) => {
    const signature = orientationFreeSignature(c.faces)
    if (seen.has(signature)) return false
    seen.add(signature)
    return true
  })
  const kept = unique.slice(0, MAX_ALTERNATIVES)
  const none = { U: 0, R: 0, F: 0, D: 0, L: 0, B: 0 }
  return {
    faces: kept[0].faces,
    rotations: none,
    cornerScore: kept[0].cornerScore,
    edgeScore: kept[0].edgeScore,
    fullyValid: kept[0].fullyValid,
    alternatives: kept.map((c) => ({ faces: c.faces, rotations: none })),
    arrangements: kept.map((c) => c.arrangement),
    truncated: unique.length > kept.length,
  }
}

// Photo positions in a guided capture: 0-3 the sides, 4-5 top/bottom.
export type GuidedCenterIssue =
  | { kind: 'same-center'; photos: [number, number] }
  | { kind: 'turned-twice'; photo: number }
  | { kind: 'not-opposite'; photos: [number, number] }

// Odd sizes only: the centers alone show several capture mistakes before
// any search - two photos of the same face, a side turned 180° instead of
// 90° (it shows the face opposite the one before it), or two photos that
// should face away from each other but don't. Empty when all is well, and
// always empty on even sizes (no fixed centers) or for missing photos.
export function checkGuidedCenters(photos: Array<string[][] | undefined>): GuidedCenterIssue[] {
  const n = photos.find(Boolean)?.length
  if (!n || n % 2 === 0) return []
  const mid = Math.floor(n / 2)
  const center = photos.map((p) => p?.[mid]?.[mid])
  const issues: GuidedCenterIssue[] = []
  for (let i = 0; i < center.length; i++) {
    for (let j = 0; j < i; j++) {
      if (center[i] && center[i] === center[j]) issues.push({ kind: 'same-center', photos: [j, i] })
    }
  }
  if (issues.length > 0) return issues
  const opposite = (a?: string, b?: string) => !!a && !!b && OPPOSITE_COLOR[a] === b
  for (let i = 1; i < 4; i++) {
    if (opposite(center[i - 1], center[i])) issues.push({ kind: 'turned-twice', photo: i })
  }
  for (const [a, b] of [[0, 2], [1, 3], [4, 5]] as Array<[number, number]>) {
    if (center[a] && center[b] && !opposite(center[a], center[b])) issues.push({ kind: 'not-opposite', photos: [a, b] })
  }
  return issues
}

// Pairs of photos that look like the same face taken twice: at some
// rotation nearly every sticker matches. Works on every size, unlike the
// center check above. Up to ~10% of stickers may differ (at least 1 on 3x3
// and up) so a single misread doesn't hide a repeat - two genuinely
// different faces of a well-scrambled cube never come close (the most
// alike seen in simulation: 6/9 on 3x3, 9/16 on 4x4, 18/49 on 7x7). A 2x2
// needs an exact match, and still alarms falsely about once in 1,500 face
// pairs - fine for a warning that can be dismissed.
export function findRepeatedFaces(photos: Array<string[][] | undefined>): Array<[number, number]> {
  const repeats: Array<[number, number]> = []
  for (let i = 0; i < photos.length; i++) {
    const a = photos[i]
    if (!a) continue
    const n = a.length
    const allowed = n === 2 ? 0 : Math.max(1, Math.floor(n * n * 0.1))
    for (let j = 0; j < i; j++) {
      const b = photos[j]
      if (!b || b.length !== n) continue
      const alike = Math.max(...[0, 1, 2, 3].map((turns) => {
        const rb = rotateGrid(b, turns)
        let same = 0
        for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (a[r][c] === rb[r][c]) same++
        return same
      }))
      if (alike >= n * n - allowed) repeats.push([j, i])
    }
  }
  return repeats
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

/**
 * server/Server.ts — CubeAssembler Hono + Bun Server
 *
 * Architecture:
 *   - Hono handles routing (zero dependencies beyond hono + cubing)
 *   - Bun serves ReScript compiled .js and static web/ assets directly
 *   - Heavy assembly pipeline runs in a Bun Worker thread
 *   - Results streamed back to client via Server-Sent Events (SSE)
 *
 * Routes:
 *   GET  /                         → serves index.html
 *   GET  /lib/*                    → serves ReScript compiled ESM (.js)
 *   GET  /web/*                    → serves web assets (CSS, client TS)
 *   POST /api/assemble             → SSE stream of assembly pipeline stages
 *   POST /api/parity               → synchronous parity check result
 *   POST /api/apply-alg            → apply WCA alg to cube state
 *   GET  /api/scramble?size=4      → generate WCA scramble for puzzle size
 *   POST /api/parse-wrg            → parse WRG string → cube IR JSON
 *   POST /api/parse-urf            → parse URF string → cube IR JSON
 *   GET  /api/formats/:ir          → convert IR to all notation formats
 *   POST /api/fixtures             → save a human-verified capture to
 *                                     test/fixtures/ as a regression fixture
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { serveStatic } from "hono/bun";
import { streamSSE } from "hono/streaming";
import { randomScrambleForEvent } from "cubing/scramble";
import { Alg } from "cubing/alg";
import { puzzles } from "cubing/puzzles";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { wrgFaceletsToGrids } from "../src/client/notationOutput";

// ─── Types shared with client ─────────────────────────────────────────────────

export type FaceColor = "W" | "O" | "G" | "R" | "B" | "Y";
export type FaceGrid = { n: number; data: FaceColor[] };
export type CubeIR = {
  size: number;
  u: FaceGrid; r: FaceGrid; f: FaceGrid;
  d: FaceGrid; l: FaceGrid; b: FaceGrid;
};

export type AssembleRequest = {
  faces: FaceGrid[]; // 6 face grids in any order (unlabelled)
  size: number;      // puzzle size N (2..7)
};

export type AssembleSSEEvent =
  | { type: "start";   total: number }
  | { type: "stage";   stage: string; count: number; tested: number }
  | { type: "result";  states: CubeIR[] }
  | { type: "error";   message: string };

export type ParityRequest  = { cube: CubeIR };
export type FaceletRef = { face: string; index: number };
// One corner/edge/wing "reading" implicated in a parity failure: its own
// facelets, plus `group` - the color combination (or matched piece name)
// it read as. Multiple entries sharing the same `group` are the SAME
// physical piece read at different positions (a duplicate) or different
// wings that all matched the same over-represented pair - i.e. exactly
// the set a client should cross-highlight when the user hovers one of
// them, since they're the candidates for "which of these is actually the
// misread one".
export type HighlightGroup = { group: string; facelets: FaceletRef[] };
export type ParityResponse = {
  valid: boolean;
  result: string;
  checks: Record<string, boolean>;
  // Which specific stickers are implicated in `result`, when the failure
  // is localized enough to point at (an unknown/duplicate corner or edge
  // triplet, or the over-represented wing-edge pairs hiding a misread
  // sticker) - so a human can go look at exactly those cubies instead of
  // re-deriving positions from the text. Omitted for failures that are
  // inherently global rather than pointing at specific stickers
  // (colorBalance, an orientation-sum parity mismatch, or corner-vs-edge
  // permutation parity itself - see each return site's own comment).
  highlight?: HighlightGroup[];
};

export type ApplyAlgRequest  = { cube: CubeIR; alg: string };
export type ApplyAlgResponse = { cube: CubeIR } | { error: string };

// ─── Puzzle loaders via registry ─────────────────────────────────────────────

/** Load a KPuzzle by NxN size using the cubing.js puzzles registry. */
async function loadKPuzzle(n: number) {
  const key = `${n}x${n}x${n}` as keyof typeof puzzles;
  const loader = puzzles[key];
  if (!loader) throw new Error(`No puzzle registered for ${n}x${n}x${n}`);
  return loader.kpuzzle();
}

const wcaEventIds: Record<number, string> = {
  2: "222", 3: "333", 4: "444", 5: "555", 6: "666", 7: "777",
};

// ─── Color / IR utilities (server-side JS — mirrors ReScript IR) ──────────────

const SOLVED_COLORS: Record<string, FaceColor> = {
  U: "W", R: "R", F: "G", D: "Y", L: "O", B: "B",
};

function makeSolidFace(n: number, color: FaceColor): FaceGrid {
  return { n, data: Array(n * n).fill(color) };
}

function makeIdentity(n: number): CubeIR {
  return {
    size: n,
    u: makeSolidFace(n, "W"), r: makeSolidFace(n, "R"),
    f: makeSolidFace(n, "G"), d: makeSolidFace(n, "Y"),
    l: makeSolidFace(n, "O"), b: makeSolidFace(n, "B"),
  };
}

/** Rotate a face grid 90° clockwise, k times. */
function rotateFace(grid: FaceGrid, rotations: number): FaceGrid {
  const k = ((rotations % 4) + 4) % 4;
  if (k === 0) return { n: grid.n, data: [...grid.data] };
  let cur = [...grid.data];
  const n = grid.n;
  for (let step = 0; step < k; step++) {
    const next = new Array(n * n);
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        // 90° CW: next[c][N-1-r] = cur[r][c]
        next[c * n + (n - 1 - r)] = cur[r * n + c];
      }
    }
    cur = next;
  }
  return { n, data: cur };
}

// ─── Color validation helpers ─────────────────────────────────────────────────

function countColors(cube: CubeIR): Record<FaceColor, number> {
  const counts: any = { W:0, O:0, G:0, R:0, B:0, Y:0 };
  for (const face of [cube.u, cube.r, cube.f, cube.d, cube.l, cube.b]) {
    for (const c of face.data) counts[c]++;
  }
  return counts;
}

function validateColorBalance(cube: CubeIR): boolean {
  const counts = countColors(cube);
  const expected = cube.size ** 2;
  return Object.values(counts).every((c) => c === expected);
}

// ─── Corner facelet-slot geometry (size-independent) ──────────────────────────
// Corner pieces are always single unit cubies regardless of puzzle size N -
// every NxN cube has exactly the same 8 corners, each occupying the same
// grid-corner slot (top-left/top-right/bottom-left/bottom-right) of each of
// its 3 faces; only the literal facelet index of a slot depends on N. Unlike
// center-block color uniformity (an earlier, removed check here that only
// holds for a *solved* cube - see runFullParity below), this is a genuine
// invariant for a scrambled cube of any size, so it's meaningful to check
// for every N.
type CornerSlot = "TL" | "TR" | "BL" | "BR";
function cornerFaceletIdx(n: number, slot: CornerSlot): number {
  switch (slot) {
    case "TL": return 0;
    case "TR": return n - 1;
    case "BL": return n * (n - 1);
    case "BR": return n * n - 1;
  }
}

// [faceA, slotA, faceB, slotB, faceC, slotC] per corner: UFR, UBR, UBL, UFL,
// DFR, DBR, DBL, DFL. The B (back) face is viewed from outside the cube
// (i.e. mirrored left/right relative to F), which the UBR/UBL entries'
// `b` and UBL's `l` slot originally got backwards in this table's old
// literal-3x3-index predecessor - confirmed against a real scrambled
// capture that a correct table accepts and the original one rejected with
// "Unknown corner color triplet" even though colorBalance passed.
const CORNER_SLOTS = [
  ["u","BR","r","TL","f","TR"], ["u","TR","b","TL","r","TR"], ["u","TL","l","TL","b","TR"], ["u","BL","f","TL","l","TR"],
  ["d","TR","f","BR","r","BL"], ["d","BR","r","BR","b","BL"], ["d","BL","b","BR","l","BL"], ["d","TL","l","BR","f","BL"],
] as const;

function getFace(cube: CubeIR, key: string): FaceGrid {
  return (cube as any)[key];
}

// ─── Permutation generator (Heap's algorithm) ─────────────────────────────────

function* heapPermutations<T>(arr: T[]): Generator<T[]> {
  const a = [...arr];
  const n = a.length;
  const c = new Array(n).fill(0);
  yield [...a];
  let i = 0;
  while (i < n) {
    if (c[i] < i) {
      const j = i % 2 === 0 ? 0 : c[i];
      [a[j], a[i]] = [a[i], a[j]];
      yield [...a];
      c[i]++;
      i = 0;
    } else {
      c[i] = 0;
      i++;
    }
  }
}

// ─── Parity checks ────────────────────────────────────────────────────────────

// The 8 canonical corner color-triples: fixed regardless of N, since every
// NxN cube has the same 8 corner pieces.
const SOLVED_CORNERS: Array<[FaceColor, FaceColor, FaceColor]> = [
  ["W","R","G"],["W","B","R"],["W","O","B"],["W","G","O"],
  ["Y","G","R"],["Y","R","B"],["Y","B","O"],["Y","O","G"],
];
// Index-parallel with SOLVED_CORNERS - the physical corner each entry
// represents, for naming a highlight group by piece identity rather than
// a bare index.
const CORNER_NAMES = ["UFR","UBR","UBL","UFL","DFR","DBR","DBL","DFL"];
// The 12 canonical edge color-pairs: fixed regardless of N, since every
// NxN cube has the same 12 edges (just N-2 independently-permutable
// "wing" pieces per edge on N>3 - see EDGE_LINES below).
const SOLVED_EDGES: Array<[FaceColor, FaceColor]> = [
  ["W","G"],["W","R"],["W","B"],["W","O"],
  ["Y","G"],["Y","R"],["Y","B"],["Y","O"],
  ["G","R"],["G","O"],["B","R"],["B","O"],
];
// Index-parallel with SOLVED_EDGES - same purpose as CORNER_NAMES above.
const EDGE_NAMES = ["UF","UR","UB","UL","DF","DR","DB","DL","FR","FL","BR","BL"];
// UF, UR, UB, UL, DF, DR, DB, DL, FR, FL, BR, BL. Same B-face mirroring
// mistake as CORNER_SLOTS above hit the BR/BL entries' `b` index.
const EDGE_FACELETS_3x3 = [
  ["u",7,"f",1],["u",5,"r",1],["u",1,"b",1],["u",3,"l",1],
  ["d",1,"f",7],["d",5,"r",7],["d",7,"b",7],["d",3,"l",7],
  ["f",5,"r",3],["f",3,"l",5],["b",3,"r",5],["b",5,"l",3],
] as const;

// ─── Wing-edge facelet geometry for N>3 (size-independent) ────────────────────
// On a 4x4+ cube, each of the 12 edges splits into N-2 independently
// permutable "wing" pieces (rather than 3x3's single fixed edge piece).
// A wing at "distance" w (1..N-2) from one of the edge's two corner
// endpoints has one sticker on each of the edge's two faces.
//
// [edgeName, faceA, lineA, reverseA, faceB, lineB, reverseB]: derived from
// explicit 3D coordinates for all 6 faces (each face's (row,col) mapped to
// a position on the cube's surface, cross-checked by finding which cells
// of the two faces at each edge share a position) - NOT from a shortcut
// pattern-matched against CORNER_SLOTS, which was tried first and got 4 of
// the 12 edges (UR, UB, DB, DL) wrong: the corner-adjacency reasoning it
// used can't distinguish a "forward" pairing from a "reversed" one, and
// the only cross-check available at the time (N=3's EDGE_FACELETS_3x3) has
// just one, self-symmetric wing position where forward and reversed
// formulas coincide by coincidence - so it looked right until tested
// against a real N=4 capture with 2 distinguishable wing positions per
// edge. `reverse=true` means the wing at distance w from the FIRST-listed
// corner endpoint reads that face's line at position (N-1-w), not w.
type EdgeLineType = "TOP" | "BOTTOM" | "LEFT" | "RIGHT";
function lineFaceletIdx(n: number, line: EdgeLineType, w: number): number {
  switch (line) {
    case "TOP": return w;
    case "BOTTOM": return n * (n - 1) + w;
    case "LEFT": return w * n;
    case "RIGHT": return w * n + (n - 1);
  }
}
const EDGE_LINES = [
  ["UF", "u", "BOTTOM", false, "f", "TOP", false],
  ["UR", "u", "RIGHT", false, "r", "TOP", true],
  ["UB", "u", "TOP", false, "b", "TOP", true],
  ["UL", "u", "LEFT", false, "l", "TOP", false],
  ["DF", "d", "TOP", false, "f", "BOTTOM", false],
  ["DR", "d", "RIGHT", false, "r", "BOTTOM", false],
  ["DB", "d", "BOTTOM", false, "b", "BOTTOM", true],
  ["DL", "d", "LEFT", false, "l", "BOTTOM", true],
  ["FR", "f", "RIGHT", false, "r", "LEFT", false],
  ["FL", "f", "LEFT", false, "l", "RIGHT", false],
  ["BR", "b", "LEFT", false, "r", "RIGHT", false],
  ["BL", "b", "RIGHT", false, "l", "LEFT", false],
] as const;
function edgeLineFaceletIdx(n: number, line: EdgeLineType, reverse: boolean, w: number): number {
  return lineFaceletIdx(n, line, reverse ? n - 1 - w : w);
}

// Validates wing-edge stickers by counting, not full permutation/
// orientation parity (see runFullParity for why): every wing sticker pair
// must be one of the 12 canonical color pairs (an "opposite colors
// touching" pair is physically impossible at any position, corner or
// wing), AND each canonical pair must appear exactly N-2 times across all
// wings - since a specific-colored wing piece has a fixed, unique pair of
// colors and a fixed total supply (N-2) of that type. This pools wings of
// every "depth" together rather than validating each depth-class
// separately (on N≥5, wings at different distances from an edge's two
// corners belong to distinct permutation orbits and can't mix with each
// other) - a real, known limitation, but one that can only make this
// check WEAKER (miss a cross-depth imbalance) than it ideally would be,
// never cause a false rejection of a valid cube, so it's an acceptable
// gap rather than something blocking this check from shipping.
function validateWingEdges(cube: CubeIR): { valid: boolean; result?: string; highlight?: HighlightGroup[] } {
  const n = cube.size;
  const counts = new Array(SOLVED_EDGES.length).fill(0);
  // Every wing reading's two facelets, grouped by which canonical pair
  // they matched - kept so an over-represented pair (see below) can
  // point at exactly the wings that might be the misread ones, not just
  // name the pair.
  const faceletsByPair: FaceletRef[][][] = SOLVED_EDGES.map(() => []);
  for (const [edgeName, faceA, lineA, reverseA, faceB, lineB, reverseB] of EDGE_LINES) {
    for (let w = 1; w <= n - 2; w++) {
      const idxA = edgeLineFaceletIdx(n, lineA as EdgeLineType, reverseA, w);
      const idxB = edgeLineFaceletIdx(n, lineB as EdgeLineType, reverseB, w);
      const c0 = getFace(cube, faceA).data[idxA] as FaceColor;
      const c1 = getFace(cube, faceB).data[idxB] as FaceColor;
      const facelets: FaceletRef[] = [{ face: faceA, index: idxA }, { face: faceB, index: idxB }];
      let found = false;
      for (let pi = 0; pi < SOLVED_EDGES.length; pi++) {
        const se = SOLVED_EDGES[pi];
        if ((c0 === se[0] && c1 === se[1]) || (c0 === se[1] && c1 === se[0])) {
          counts[pi]++; faceletsByPair[pi].push(facelets); found = true; break;
        }
      }
      if (!found) {
        // Names the actual two colors and exactly where they were read
        // from, not just "somewhere" - a human staring at this needs to
        // know which physical stickers to go re-check, not just that
        // *some* wing is wrong. Two same/opposite colors can never
        // physically touch on any real cube, so this always means at
        // least one of these two specific stickers was misread.
        return {
          valid: false,
          result: `Unknown wing edge color pair "${c0}-${c1}" at edge ${edgeName} (wing ${w} of ${n - 2}, reading ${faceA}+${faceB}) - two same or opposite colors can never physically touch, so one of these two stickers was misread`,
          highlight: [{ group: `${c0}-${c1}`, facelets }],
        };
      }
    }
  }
  const expected = n - 2;
  if (!counts.every((c) => c === expected)) {
    // Lists every pair that's actually off (not the 12-line full table),
    // each with its real count vs. the expected one - the specific
    // over/under pattern across pairs (e.g. one color's count short by
    // exactly what another's is over by) is usually the fastest way for a
    // human to spot which two colors are being confused for each other,
    // without re-deriving this same table by hand from the raw facelets.
    const offending = SOLVED_EDGES
      .map((se, i) => ({ pair: se.join("-"), count: counts[i] }))
      .filter((p) => p.count !== expected)
      .map((p) => `${p.pair} has ${p.count} (expected ${expected})`);
    // A pair with FEWER than expected has nothing to point at - it's
    // simply missing, not sitting on the cube anywhere. The misread
    // stickers are hiding among the OVER-represented pairs' actual wings,
    // so those are what get highlighted (can't narrow further than "one
    // of these" without more information - the count alone doesn't say
    // which specific wing among them is the wrong one). Each wing is its
    // own entry, all sharing the pair name as `group` - a client hovering
    // one can cross-highlight the rest of the same over-represented pool.
    const highlight: HighlightGroup[] = counts.flatMap((c, i) =>
      c > expected ? faceletsByPair[i].map((facelets) => ({ group: SOLVED_EDGES[i].join("-"), facelets })) : []
    );
    return {
      valid: false,
      result: `Wing edge color-pair counts unbalanced: ${offending.join(", ")}`,
      highlight,
    };
  }
  return { valid: true };
}

function permParity(perm: number[]): boolean {
  const visited = new Array(perm.length).fill(false);
  let cycles = 0;
  for (let i = 0; i < perm.length; i++) {
    if (!visited[i]) {
      let j = i;
      while (!visited[j]) { visited[j] = true; j = perm[j]; }
      cycles++;
    }
  }
  return (perm.length - cycles) % 2 === 0;
}

function runFullParity(cube: CubeIR): ParityResponse {
  const checks: Record<string, boolean> = {};
  const n = cube.size;

  checks.colorBalance = validateColorBalance(cube);
  if (!checks.colorBalance)
    return { valid: false, result: "Invalid color balance", checks };

  // Corner analysis — meaningful for every N (see CORNER_SLOTS above).
  const cornerPieces: number[] = [];
  const cornerOrients: number[] = [];
  // Facelets backing each slot's corner, same order as cornerPieces - kept
  // around purely so a failure below can point at exactly the stickers
  // involved instead of just naming the problem.
  const cornerFacelets: FaceletRef[][] = [];
  for (const [fa, ca, fb, cb, fc, cc] of CORNER_SLOTS) {
    const idxA = cornerFaceletIdx(n, ca as CornerSlot);
    const idxB = cornerFaceletIdx(n, cb as CornerSlot);
    const idxC = cornerFaceletIdx(n, cc as CornerSlot);
    const colors: FaceColor[] = [
      getFace(cube, fa).data[idxA] as FaceColor,
      getFace(cube, fb).data[idxB] as FaceColor,
      getFace(cube, fc).data[idxC] as FaceColor,
    ];
    const facelets: FaceletRef[] = [{ face: fa, index: idxA }, { face: fb, index: idxB }, { face: fc, index: idxC }];
    let found = false;
    for (let pi = 0; pi < SOLVED_CORNERS.length; pi++) {
      const sc = SOLVED_CORNERS[pi];
      for (let rot = 0; rot < 3; rot++) {
        if (colors[rot%3]===sc[0] && colors[(rot+1)%3]===sc[1] && colors[(rot+2)%3]===sc[2]) {
          cornerPieces.push(pi);
          cornerOrients.push(rot);
          cornerFacelets.push(facelets);
          found = true; break;
        }
      }
      if (found) break;
    }
    if (!found) {
      checks.cornerColors = false;
      return { valid: false, result: "Unknown corner color triplet", checks, highlight: [{ group: colors.join("-"), facelets }] };
    }
  }
  // Each triple above only checked "is this SOME real corner" independently
  // per slot - two slots matching the SAME physical piece (impossible on a
  // real cube) isn't automatically excluded by that alone, and would make
  // permParity(cornerPieces) below meaningless, since it assumes the array
  // is an actual permutation of 0..7. A real capture demonstrated this
  // exact gap: every individual triple read as a valid corner, yet the
  // piece list was [0,1,1,0,7,6,6,7] - not a permutation at all (2026-09-23
  // design discussion; same fix mirrored in AssemblyWorker.ts's
  // checkFullParity and src/client/cubeAssembly.ts's isFullyValid).
  {
    const firstSlotForPiece = new Map<number, number>();
    for (let slot = 0; slot < cornerPieces.length; slot++) {
      const piece = cornerPieces[slot];
      const firstSlot = firstSlotForPiece.get(piece);
      if (firstSlot !== undefined) {
        checks.cornerColors = false;
        const pieceName = CORNER_NAMES[piece];
        return {
          valid: false,
          result: "Duplicate corner piece (two positions read the same physical corner)",
          checks,
          highlight: [
            { group: pieceName, facelets: cornerFacelets[firstSlot] },
            { group: pieceName, facelets: cornerFacelets[slot] },
          ],
        };
      }
      firstSlotForPiece.set(piece, slot);
    }
  }
  checks.cornerColors = true;

  // Corner orientation-twist invariant: also meaningful for every N, since
  // it's a purely local per-corner mechanical fact (unaffected by slice
  // turns on bigger cubes). The sum is a property of ALL 8 corners
  // together, not any one of them, so there's no single corner to point
  // at - highlighting all 24 corner facelets ("the problem is somewhere
  // in here") is honest about that, unlike guessing one. Each corner gets
  // its OWN matched piece as its group (not shared with any other, unlike
  // the duplicate-piece case above), so hovering one won't cross-
  // highlight another - there's nothing "related" to point at beyond
  // itself for a genuinely global check like this.
  const cornerOrientSum = cornerOrients.reduce((a, b) => a + b, 0);
  checks.cornerOrientation = cornerOrientSum % 3 === 0;
  if (!checks.cornerOrientation)
    return {
      valid: false,
      result: `Corner orientation sum ${cornerOrientSum} ≢ 0 (mod 3)`,
      checks,
      highlight: cornerFacelets.map((facelets, slot) => ({ group: CORNER_NAMES[cornerPieces[slot]], facelets })),
    };

  if (n === 2) {
    // 2x2 has only corners (no edges/centers), so the checks above are the
    // complete parity model. Unlike n===3, corner permutation carries no
    // parity constraint of its own to check here: with no edges to compare
    // against, and since a single quarter turn is already an odd corner
    // permutation (so both parities are freely reachable), there's nothing
    // further to validate.
    return { valid: true, result: "Valid — all parity checks passed", checks };
  }

  if (n !== 3) {
    // 4x4-7x7: edges split into N-2 independently-permutable "wing" pieces
    // per edge - validated by counting (see validateWingEdges), not full
    // permutation/orientation parity, which is future work (see README).
    // Centers get no check at all: colorBalance + the exact corner/wing
    // counts above already force each color's center-facelet count to be
    // exactly (N-2)² (there's no room left for it to be anything else),
    // and individual center pieces aren't distinguishable by color anyway
    // (several genuinely different pieces share the same solved color), so
    // there's nothing further a color-only check could validate. Center-
    // block *uniformity* was tried as a stand-in for all of this and
    // removed: on a genuinely scrambled even cube, a face's center pieces
    // are routinely a mix of colors (that's why "center reduction" is a
    // required first step of the standard big-cube solving method), so
    // requiring uniformity rejected valid scrambles.
    const wingResult = validateWingEdges(cube);
    checks.wingEdgeColors = wingResult.valid;
    if (!wingResult.valid) {
      return { valid: false, result: wingResult.result!, checks, highlight: wingResult.highlight };
    }
    return { valid: true, result: "Valid (structural + corner + wing-edge count check)", checks };
  }

  // Edge analysis
  const edgePieces: number[] = [];
  const edgeOrients: number[] = [];
  const edgeFacelets: FaceletRef[][] = [];
  for (const [fa, ia, fb, ib] of EDGE_FACELETS_3x3) {
    const c0 = getFace(cube, fa).data[ia] as FaceColor;
    const c1 = getFace(cube, fb).data[ib] as FaceColor;
    const facelets: FaceletRef[] = [{ face: fa, index: ia }, { face: fb, index: ib }];
    let found = false;
    for (let pi = 0; pi < SOLVED_EDGES.length; pi++) {
      const se = SOLVED_EDGES[pi];
      if (c0===se[0] && c1===se[1]) { edgePieces.push(pi); edgeOrients.push(0); edgeFacelets.push(facelets); found=true; break; }
      if (c0===se[1] && c1===se[0]) { edgePieces.push(pi); edgeOrients.push(1); edgeFacelets.push(facelets); found=true; break; }
    }
    if (!found) {
      checks.edgeColors = false;
      return { valid: false, result: "Unknown edge color pair", checks, highlight: [{ group: `${c0}-${c1}`, facelets }] };
    }
  }
  // Same distinctness gap as the corner check above, mirrored for edges.
  {
    const firstSlotForPiece = new Map<number, number>();
    for (let slot = 0; slot < edgePieces.length; slot++) {
      const piece = edgePieces[slot];
      const firstSlot = firstSlotForPiece.get(piece);
      if (firstSlot !== undefined) {
        checks.edgeColors = false;
        const pieceName = EDGE_NAMES[piece];
        return {
          valid: false,
          result: "Duplicate edge piece (two positions read the same physical edge)",
          checks,
          highlight: [
            { group: pieceName, facelets: edgeFacelets[firstSlot] },
            { group: pieceName, facelets: edgeFacelets[slot] },
          ],
        };
      }
      firstSlotForPiece.set(piece, slot);
    }
  }
  checks.edgeColors = true;

  // Edge orientation sum (corner orientation was already checked above,
  // for every N) - a property of all 12 edges together, same reasoning as
  // the corner orientation sum above for why every edge facelet is
  // highlighted (each under its own matched piece as group, not shared)
  // rather than guessing one.
  const edgeOrientSum = edgeOrients.reduce((a, b) => a + b, 0);
  checks.edgeOrientation = edgeOrientSum % 2 === 0;
  if (!checks.edgeOrientation)
    return {
      valid: false,
      result: `Edge orientation sum ${edgeOrientSum} ≢ 0 (mod 2)`,
      checks,
      highlight: edgeFacelets.map((facelets, slot) => ({ group: EDGE_NAMES[edgePieces[slot]], facelets })),
    };

  const cpParity = permParity(cornerPieces);
  const epParity = permParity(edgePieces);
  checks.permutationParity = cpParity === epParity;
  if (!checks.permutationParity)
    return { valid: false, result: "Corner perm parity ≠ edge perm parity", checks };

  return { valid: true, result: "Valid — all parity checks passed", checks };
}

// ─── Hono app ─────────────────────────────────────────────────────────────────

const app = new Hono();

app.use("*", logger());
app.use("/api/*", cors({ origin: "*" }));

// ── Static assets (no bundler needed) ──────────────────────────────────────
app.use("/lib/*", serveStatic({ root: "./" }));   // ReScript compiled ESM
app.use("/web/*", serveStatic({ root: "./" }));   // CSS + client TS
app.use("/public/*", serveStatic({ root: "./" }));

app.get("/", serveStatic({ path: "./index.html" }));

// ── GET /api/scramble?size=4 ─────────────────────────────────────────────────
app.get("/api/scramble", async (c) => {
  const size = Number(c.req.query("size") ?? "3");
  const eventId = wcaEventIds[size];
  if (!eventId) return c.json({ error: `Unsupported size: ${size}` }, 400);
  try {
    const alg = await randomScrambleForEvent(eventId);
    return c.json({ scramble: alg.toString(), size });
  } catch (e) {
    return c.json({ error: String(e) }, 500);
  }
});

// ── POST /api/parity ─────────────────────────────────────────────────────────
app.post("/api/parity", async (c) => {
  const body = await c.req.json<ParityRequest>();
  const result = runFullParity(body.cube);
  return c.json(result);
});

// ── POST /api/apply-alg ──────────────────────────────────────────────────────
app.post("/api/apply-alg", async (c) => {
  const { cube, alg: algStr } = await c.req.json<ApplyAlgRequest>();
  try {
    const kpuzzle = await loadKPuzzle(cube.size);
    const alg = new Alg(algStr);
    const transformation = kpuzzle.algToTransformation(alg);
    const defaultPattern = kpuzzle.defaultPattern();
    const newPattern = defaultPattern.applyTransformation(transformation);

    // Reconstruct CubeIR from KPatternData (simplified: return the KPattern JSON
    // as-is for now; client reconstructs color view)
    return c.json({
      kPatternData: newPattern.patternData,
      algStr: alg.toString(),
      size: cube.size,
    });
  } catch (e) {
    return c.json({ error: String(e) }, 400);
  }
});

// ── POST /api/assemble — SSE streaming pipeline ───────────────────────────────
app.post("/api/assemble", async (c) => {
  const body = await c.req.json<AssembleRequest>();
  const { faces, size } = body;

  if (faces.length !== 6 || !wcaEventIds[size]) {
    return c.json({ error: "Need exactly 6 faces and valid size (2–7)" }, 400);
  }

  return streamSSE(c, async (sse) => {
    const TOTAL = 720 * 4096; // 6! × 4^6 candidates

    await sse.writeSSE({ data: JSON.stringify({ type: "start", total: TOTAL }) });

    // Run in a Bun Worker to avoid blocking the event loop
    const worker = new Worker(
      new URL("./AssemblyWorker.ts", import.meta.url),
      { type: "module" }
    );

    worker.postMessage({ faces, size });

    const done = new Promise<void>((resolve, reject) => {
      worker.onmessage = async (e) => {
        const msg = e.data as AssembleSSEEvent;
        await sse.writeSSE({ data: JSON.stringify(msg) });

        if (msg.type === "result" || msg.type === "error") {
          worker.terminate();
          resolve();
        }
      };
      worker.onerror = (err) => { reject(err); worker.terminate(); };
    });

    await done;
  });
});

// ── POST /api/parse-wrg ───────────────────────────────────────────────────────
app.post("/api/parse-wrg", async (c) => {
  const { notation, size } = await c.req.json<{ notation: string; size: number }>();
  const tokens = notation.trim().split(/\s+/).filter(Boolean);
  const n = size;
  const expected = n * n * 6;
  if (tokens.length !== expected) {
    return c.json({ error: `Expected ${expected} tokens for ${n}x${n}, got ${tokens.length}` }, 400);
  }
  const COLORS = new Set(["W","O","G","R","B","Y"]);
  const invalid = tokens.filter(t => !COLORS.has(t.toUpperCase()));
  if (invalid.length > 0) {
    return c.json({ error: `Unknown color tokens: ${invalid.slice(0,3).join(", ")}` }, 400);
  }
  const faceSize = n * n;
  const faces = ["u","r","f","d","l","b"];
  const cube: any = { size: n };
  faces.forEach((face, i) => {
    cube[face] = {
      n,
      data: tokens.slice(i * faceSize, (i + 1) * faceSize).map(t => t.toUpperCase()),
    };
  });
  return c.json({ cube });
});

// ── POST /api/parse-urf ───────────────────────────────────────────────────────
app.post("/api/parse-urf", async (c) => {
  const { notation } = await c.req.json<{ notation: string }>();
  // Tokenize and classify: 3-char = corner, 2-char = edge, 1-char = center
  const tokens = notation.replace(/Corners:|Edges:|Centers:/g, "").trim().split(/\s+/).filter(Boolean);
  const corners = tokens.filter(t => t.length === 3);
  const edges   = tokens.filter(t => t.length === 2);
  const centers = tokens.filter(t => t.length === 1);
  return c.json({
    parsed: { corners, edges, centers },
    counts: { corners: corners.length, edges: edges.length, centers: centers.length },
    note: "Full 3x3 URF reconstruction is available client-side via the ReScript IRBridge module",
  });
});

// ── GET /api/formats/:encoding ───────────────────────────────────────────────
app.get("/api/formats/:encoding", async (c) => {
  const encoding = c.req.param("encoding");
  return c.json({ encoding, note: "Pass cube IR via POST /api/parse-wrg first" });
});

// ── POST /api/fixtures ───────────────────────────────────────────────────────
// Saves a real, human-verified capture (each face's actual photo plus the
// color grid after any manual corrections) to test/fixtures/<name>/, so a
// misclassification a human caught in the review wizard becomes a
// permanent regression fixture instead of a one-off bug report - see
// test/fixtures.test.ts, which runs the real detection pipeline
// (extractColorsFromImageData) against every saved fixture and checks it
// against the stored, human-verified colors.
type SaveFixtureRequest = {
  name?: string;
  gridSize: number;
  // Human-verified colors of all 6 faces as one WRG facelets string in
  // U R F D L B order (each face row-major, as photographed), e.g.
  // "GRRYOYWYW WYWROGORB ...". `detectedURFDLB` is the same for what
  // detection produced before any hand correction.
  colorsURFDLB: string;
  detectedURFDLB?: string;
  // Any other per-face fields (crop, camera settings, ...) are
  // informational and stored as-is, like `meta`.
  faces: Record<string, { photo: string } & Record<string, unknown>>;
  // Informational capture context (camera, white balance, etc) - opaque to
  // the server, stored as-is alongside the fixture for later debugging.
  meta?: unknown;
};

const FIXTURES_DIR = join(import.meta.dir, "..", "test", "fixtures");
const REQUIRED_FACES = ["u", "r", "f", "d", "l", "b"];

function stampCommit(meta: unknown): Record<string, unknown> {
  const capture = meta && typeof meta === "object" ? (meta as Record<string, unknown>) : {};
  const app = capture.app && typeof capture.app === "object" ? capture.app : {};
  return { ...capture, app: { ...app, commit: gitCommit() } };
}

// Which code produced a saved fixture: short commit hash, plus "-dirty"
// for uncommitted changes, read when the fixture is saved. Stamped here
// rather than baked into the client bundle, which the dev server computes
// once at startup and hot reload never refreshes - so it went stale as
// soon as anything was committed. "unknown" outside a git checkout.
function gitCommit(): string {
  const git = (...args: string[]) => {
    const result = Bun.spawnSync(["git", ...args], { cwd: import.meta.dir });
    return result.success ? result.stdout.toString().trim() : null;
  };
  const hash = git("rev-parse", "--short", "HEAD");
  if (!hash) return "unknown";
  const status = git("status", "--porcelain", "--untracked-files=no");
  return status ? `${hash}-dirty` : hash;
}

app.post("/api/fixtures", async (c) => {
  const body = await c.req.json<SaveFixtureRequest>();

  const faceEntries = Object.entries(body.faces ?? {}).map(
    ([key, value]) => [key.toLowerCase(), value] as const
  );
  const faceKeys = new Set(faceEntries.map(([key]) => key));
  if (!REQUIRED_FACES.every((f) => faceKeys.has(f))) {
    return c.json({ error: "Expected all 6 faces (U, R, F, D, L, B)" }, 400);
  }
  if (!Number.isInteger(body.gridSize) || body.gridSize < 2 || body.gridSize > 7) {
    return c.json({ error: "gridSize must be an integer between 2 and 7" }, 400);
  }
  for (const key of ["colorsURFDLB", "detectedURFDLB"] as const) {
    const value = body[key];
    if (value === undefined && key === "detectedURFDLB") continue;
    const grids = typeof value === "string" ? wrgFaceletsToGrids(value) : null;
    if (!grids || grids.U.length !== body.gridSize) {
      return c.json({ error: `${key} must be 6 space-separated ${body.gridSize}x${body.gridSize} faces of W/O/G/R/B/Y` }, 400);
    }
  }

  // Written directly to disk below, so strip anything but a safe
  // directory-name character set - never trust a client-provided name as
  // a path component as-is.
  const rawName = body.name ?? `capture-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const safeName = rawName.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 80);
  if (!safeName) {
    return c.json({ error: "Invalid fixture name" }, 400);
  }

  const dir = join(FIXTURES_DIR, safeName);
  await mkdir(dir, { recursive: true });

  const meta: {
    gridSize: number;
    colorsURFDLB: string;
    detectedURFDLB?: string;
    faces: Record<string, { photo: string } & Record<string, unknown>>;
    capture?: unknown;
  } = {
    gridSize: body.gridSize,
    colorsURFDLB: body.colorsURFDLB,
    ...(body.detectedURFDLB !== undefined ? { detectedURFDLB: body.detectedURFDLB } : {}),
    faces: {},
    capture: stampCommit(body.meta),
  };

  for (const [faceKey, faceData] of faceEntries) {
    const match = /^data:image\/(jpeg|jpg|png);base64,(.+)$/.exec(faceData.photo ?? "");
    if (!match) {
      return c.json({ error: `Face ${faceKey.toUpperCase()}: photo must be a JPEG/PNG data URL` }, 400);
    }
    const ext = match[1] === "png" ? "png" : "jpg";
    const buffer = Buffer.from(match[2], "base64");
    const photoFilename = `face-${faceKey}.${ext}`;
    await Bun.write(join(dir, photoFilename), buffer);
    const { photo: _photo, ...extra } = faceData;
    meta.faces[faceKey] = { photo: photoFilename, ...extra };
  }

  await Bun.write(join(dir, "meta.json"), JSON.stringify(meta, null, 2));

  return c.json({ success: true, name: safeName, path: `test/fixtures/${safeName}` });
});

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = Number(process.env.PORT ?? 3000);
export default {
  port: PORT,
  fetch: app.fetch,
};

console.log(`🧩 CubeAssembler running on http://localhost:${PORT}`);

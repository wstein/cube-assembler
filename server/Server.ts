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
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { serveStatic } from "hono/bun";
import { streamSSE } from "hono/streaming";
import { randomScrambleForEvent } from "cubing/scramble";
import { Alg } from "cubing/alg";
import { puzzles } from "cubing/puzzles";

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
export type ParityResponse = {
  valid: boolean;
  result: string;
  checks: Record<string, boolean>;
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
const SOLVED_EDGES_3x3: Array<[FaceColor, FaceColor]> = [
  ["W","G"],["W","R"],["W","B"],["W","O"],
  ["Y","G"],["Y","R"],["Y","B"],["Y","O"],
  ["G","R"],["G","O"],["B","R"],["B","O"],
];
// UF, UR, UB, UL, DF, DR, DB, DL, FR, FL, BR, BL. Same B-face mirroring
// mistake as CORNER_SLOTS above hit the BR/BL entries' `b` index.
const EDGE_FACELETS_3x3 = [
  ["u",7,"f",1],["u",5,"r",1],["u",1,"b",1],["u",3,"l",1],
  ["d",1,"f",7],["d",5,"r",7],["d",7,"b",7],["d",3,"l",7],
  ["f",5,"r",3],["f",3,"l",5],["b",3,"r",5],["b",5,"l",3],
] as const;

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
  for (const [fa, ca, fb, cb, fc, cc] of CORNER_SLOTS) {
    const colors: FaceColor[] = [
      getFace(cube, fa).data[cornerFaceletIdx(n, ca as CornerSlot)] as FaceColor,
      getFace(cube, fb).data[cornerFaceletIdx(n, cb as CornerSlot)] as FaceColor,
      getFace(cube, fc).data[cornerFaceletIdx(n, cc as CornerSlot)] as FaceColor,
    ];
    let found = false;
    for (let pi = 0; pi < SOLVED_CORNERS.length; pi++) {
      const sc = SOLVED_CORNERS[pi];
      for (let rot = 0; rot < 3; rot++) {
        if (colors[rot%3]===sc[0] && colors[(rot+1)%3]===sc[1] && colors[(rot+2)%3]===sc[2]) {
          cornerPieces.push(pi);
          cornerOrients.push(rot);
          found = true; break;
        }
      }
      if (found) break;
    }
    if (!found) {
      checks.cornerColors = false;
      return { valid: false, result: "Unknown corner color triplet", checks };
    }
  }
  checks.cornerColors = true;

  // Corner orientation-twist invariant: also meaningful for every N, since
  // it's a purely local per-corner mechanical fact (unaffected by slice
  // turns on bigger cubes).
  const cornerOrientSum = cornerOrients.reduce((a, b) => a + b, 0);
  checks.cornerOrientation = cornerOrientSum % 3 === 0;
  if (!checks.cornerOrientation)
    return { valid: false, result: `Corner orientation sum ${cornerOrientSum} ≢ 0 (mod 3)`, checks };

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
    // per edge, and centers into (N-2)² per face - modeling their full
    // permutation/orientation parity is future work (see README). Center-
    // block color uniformity is deliberately NOT used as a stand-in for
    // that: on a genuinely scrambled even cube in particular, a face's
    // center pieces are routinely a mix of colors (that's why "center
    // reduction" is a required first step of the standard big-cube solving
    // method) - requiring uniformity here would reject valid scrambles.
    return { valid: true, result: "Valid (structural + corner check)", checks };
  }

  // Edge analysis
  const edgePieces: number[] = [];
  const edgeOrients: number[] = [];
  for (const [fa, ia, fb, ib] of EDGE_FACELETS_3x3) {
    const c0 = getFace(cube, fa).data[ia] as FaceColor;
    const c1 = getFace(cube, fb).data[ib] as FaceColor;
    let found = false;
    for (let pi = 0; pi < SOLVED_EDGES_3x3.length; pi++) {
      const se = SOLVED_EDGES_3x3[pi];
      if (c0===se[0] && c1===se[1]) { edgePieces.push(pi); edgeOrients.push(0); found=true; break; }
      if (c0===se[1] && c1===se[0]) { edgePieces.push(pi); edgeOrients.push(1); found=true; break; }
    }
    if (!found) {
      checks.edgeColors = false;
      return { valid: false, result: "Unknown edge color pair", checks };
    }
  }
  checks.edgeColors = true;

  // Edge orientation sum (corner orientation was already checked above,
  // for every N).
  const edgeOrientSum = edgeOrients.reduce((a, b) => a + b, 0);
  checks.edgeOrientation = edgeOrientSum % 2 === 0;
  if (!checks.edgeOrientation)
    return { valid: false, result: `Edge orientation sum ${edgeOrientSum} ≢ 0 (mod 2)`, checks };

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

  if (faces.length !== 6 || !loaders[size]) {
    return c.json({ error: "Need exactly 6 faces and valid size (2–7)" }, 400);
  }

  return streamSSE(c, async (sse) => {
    const TOTAL = 720 * 4096; // 6! × 4^6 candidates
    let tested = 0;
    let afterBalance = 0;
    let afterCenters = 0;
    let afterEdges = 0;
    let afterCorners = 0;
    const validStates: CubeIR[] = [];

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

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = Number(process.env.PORT ?? 3000);
export default {
  port: PORT,
  fetch: app.fetch,
};

console.log(`🧩 CubeAssembler running on http://localhost:${PORT}`);

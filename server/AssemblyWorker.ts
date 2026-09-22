/**
 * server/AssemblyWorker.ts
 * Bun Worker thread for the 720 × 4096 assembly search.
 * Streams progress back to Server.ts via postMessage.
 *
 * Message protocol:
 *   IN:  { faces: FaceGrid[], size: number }
 *   OUT: AssembleSSEEvent (start | stage | result | error)
 */

import type { FaceColor, FaceGrid, CubeIR, AssembleSSEEvent } from "./Server.ts";

// ─── Mirror of server-side helpers (avoid circular imports) ──────────────────

function rotateFace(grid: FaceGrid, rotations: number): FaceGrid {
  const k = ((rotations % 4) + 4) % 4;
  if (k === 0) return { n: grid.n, data: [...grid.data] };
  let cur = [...grid.data];
  const n = grid.n;
  for (let step = 0; step < k; step++) {
    const next = new Array<FaceColor>(n * n);
    for (let r = 0; r < n; r++)
      for (let c = 0; c < n; c++)
        next[c * n + (n - 1 - r)] = cur[r * n + c]; // 90° CW
    cur = next;
  }
  return { n, data: cur };
}

function countColors(cube: CubeIR): Record<FaceColor, number> {
  const counts: any = { W:0, O:0, G:0, R:0, B:0, Y:0 };
  for (const f of [cube.u, cube.r, cube.f, cube.d, cube.l, cube.b])
    for (const c of f.data) counts[c]++;
  return counts;
}

function validateColorBalance(cube: CubeIR): boolean {
  const expected = cube.size ** 2;
  return Object.values(countColors(cube)).every(c => c === expected);
}

function centerIdx(n: number): number[] {
  if (n % 2 === 1) return [Math.floor(n / 2) * n + Math.floor(n / 2)];
  const h = n / 2;
  return [(h-1)*n+(h-1), (h-1)*n+h, h*n+(h-1), h*n+h];
}

function validateCenters(cube: CubeIR): boolean {
  const idxs = centerIdx(cube.size);
  for (const face of [cube.u, cube.r, cube.f, cube.d, cube.l, cube.b]) {
    const ref = face.data[idxs[0]];
    if (!idxs.every(i => face.data[i] === ref)) return false;
  }
  return true;
}

const VALID_CORNERS = new Set([
  "W-G-R","W-R-B","W-B-O","W-O-G","Y-G-O","Y-O-B","Y-B-R","Y-R-G",
  "G-R-W","R-B-W","B-O-W","O-G-W","R-W-G","B-W-R","O-W-B","G-W-O",
  "G-O-Y","O-B-Y","B-R-Y","R-G-Y","O-Y-G","B-Y-O","R-Y-B","G-Y-R",
]);

const VALID_EDGES = new Set([
  "W-G","W-R","W-B","W-O","Y-G","Y-R","Y-B","Y-O","G-R","G-O","B-R","B-O",
  "G-W","R-W","B-W","O-W","G-Y","R-Y","B-Y","O-Y","R-G","O-G","R-B","O-B",
]);

// Corner & edge facelet positions for 3x3
const CORNERS = [
  ["u",8,"r",0,"f",2],["u",2,"b",2,"r",2],["u",0,"l",2,"b",0],["u",6,"f",0,"l",2],
  ["d",2,"f",8,"r",6],["d",8,"r",8,"b",6],["d",6,"b",8,"l",6],["d",0,"l",8,"f",6],
] as const;

const EDGES = [
  ["u",7,"f",1],["u",5,"r",1],["u",1,"b",1],["u",3,"l",1],
  ["d",1,"f",7],["d",5,"r",7],["d",7,"b",7],["d",3,"l",7],
  ["f",5,"r",3],["f",3,"l",5],["b",5,"r",5],["b",3,"l",3],
] as const;

function gf(cube: CubeIR, key: string): FaceGrid { return (cube as any)[key]; }

function validateEdges(cube: CubeIR): boolean {
  if (cube.size !== 3) return true; // simplified for non-3x3
  for (const [fa, ia, fb, ib] of EDGES) {
    const key = `${gf(cube,fa).data[ia]}-${gf(cube,fb).data[ib]}`;
    if (!VALID_EDGES.has(key)) return false;
  }
  return true;
}

function validateCorners(cube: CubeIR): boolean {
  for (const [fa, ia, fb, ib, fc, ic] of CORNERS) {
    const key = `${gf(cube,fa).data[ia]}-${gf(cube,fb).data[ib]}-${gf(cube,fc).data[ic]}`;
    if (!VALID_CORNERS.has(key)) return false;
  }
  return true;
}

// Full parity (orientation + permutation)
const SOLVED_C: Array<[FaceColor,FaceColor,FaceColor]> = [
  ["W","R","G"],["W","B","R"],["W","O","B"],["W","G","O"],
  ["Y","G","R"],["Y","R","B"],["Y","B","O"],["Y","O","G"],
];
const SOLVED_E: Array<[FaceColor,FaceColor]> = [
  ["W","G"],["W","R"],["W","B"],["W","O"],
  ["Y","G"],["Y","R"],["Y","B"],["Y","O"],
  ["G","R"],["G","O"],["B","R"],["B","O"],
];

function permParity(p: number[]): boolean {
  const v = new Array(p.length).fill(false);
  let cycles = 0;
  for (let i = 0; i < p.length; i++) {
    if (!v[i]) { let j = i; while (!v[j]) { v[j]=true; j=p[j]; } cycles++; }
  }
  return (p.length - cycles) % 2 === 0;
}

function checkFullParity(cube: CubeIR): boolean {
  if (cube.size !== 3) return true; // non-3x3: structural checks sufficient
  // Corner analysis
  const cp: number[] = [], co: number[] = [];
  for (const [fa,ia,fb,ib,fc,ic] of CORNERS) {
    const colors: FaceColor[] = [gf(cube,fa).data[ia] as FaceColor, gf(cube,fb).data[ib] as FaceColor, gf(cube,fc).data[ic] as FaceColor];
    let found = false;
    for (let pi = 0; pi < SOLVED_C.length && !found; pi++) {
      for (let rot = 0; rot < 3; rot++) {
        if (colors[rot%3]===SOLVED_C[pi][0] && colors[(rot+1)%3]===SOLVED_C[pi][1] && colors[(rot+2)%3]===SOLVED_C[pi][2]) {
          cp.push(pi); co.push(rot); found = true; break;
        }
      }
    }
    if (!found) return false;
  }
  // Edge analysis
  const ep: number[] = [], eo: number[] = [];
  for (const [fa,ia,fb,ib] of EDGES) {
    const c0 = gf(cube,fa).data[ia] as FaceColor, c1 = gf(cube,fb).data[ib] as FaceColor;
    let found = false;
    for (let pi = 0; pi < SOLVED_E.length && !found; pi++) {
      if (c0===SOLVED_E[pi][0]&&c1===SOLVED_E[pi][1]) { ep.push(pi); eo.push(0); found=true; }
      else if (c0===SOLVED_E[pi][1]&&c1===SOLVED_E[pi][0]) { ep.push(pi); eo.push(1); found=true; }
    }
    if (!found) return false;
  }
  const coSum = co.reduce((a,b)=>a+b,0);
  if (coSum % 3 !== 0) return false;
  const eoSum = eo.reduce((a,b)=>a+b,0);
  if (eoSum % 2 !== 0) return false;
  return permParity(cp) === permParity(ep);
}

// ─── Heap's algorithm ─────────────────────────────────────────────────────────

function* heapPerms<T>(arr: T[]): Generator<T[]> {
  const a = [...arr], c = new Array(a.length).fill(0);
  yield [...a];
  let i = 0;
  while (i < a.length) {
    if (c[i] < i) {
      const j = i % 2 === 0 ? 0 : c[i];
      [a[j], a[i]] = [a[i], a[j]];
      yield [...a];
      c[i]++; i = 0;
    } else { c[i] = 0; i++; }
  }
}

// ─── Worker main ──────────────────────────────────────────────────────────────

self.onmessage = async (e: MessageEvent) => {
  const { faces, size }: { faces: FaceGrid[]; size: number } = e.data;

  const TOTAL = 720 * 4096;
  let tested = 0, afterBalance = 0, afterCenters = 0, afterEdges = 0, afterCorners = 0;
  const valid: CubeIR[] = [];

  const send = (msg: AssembleSSEEvent) => self.postMessage(msg);
  send({ type: "start", total: TOTAL });

  const REPORT_EVERY = 50_000;
  let nextReport = REPORT_EVERY;

  for (const perm of heapPerms(faces)) {
    for (let rU = 0; rU < 4; rU++) for (let rR = 0; rR < 4; rR++) for (let rF = 0; rF < 4; rF++)
    for (let rD = 0; rD < 4; rD++) for (let rL = 0; rL < 4; rL++) for (let rB = 0; rB < 4; rB++) {
      tested++;
      const cube: CubeIR = {
        size,
        u: rotateFace(perm[0], rU), r: rotateFace(perm[1], rR),
        f: rotateFace(perm[2], rF), d: rotateFace(perm[3], rD),
        l: rotateFace(perm[4], rL), b: rotateFace(perm[5], rB),
      };

      if (!validateColorBalance(cube)) continue;
      afterBalance++;
      if (!validateCenters(cube)) continue;
      afterCenters++;
      if (!validateEdges(cube)) continue;
      afterEdges++;
      if (!validateCorners(cube)) continue;
      afterCorners++;
      if (!checkFullParity(cube)) continue;
      valid.push(cube);

      if (tested >= nextReport) {
        send({ type: "stage", stage: "running", count: valid.length, tested });
        nextReport += REPORT_EVERY;
        // Yield to event loop
        await new Promise(r => setTimeout(r, 0));
      }
    }
  }

  send({ type: "stage", stage: "balance",  count: afterBalance,  tested });
  send({ type: "stage", stage: "centers",  count: afterCenters,  tested });
  send({ type: "stage", stage: "edges",    count: afterEdges,    tested });
  send({ type: "stage", stage: "corners",  count: afterCorners,  tested });
  send({ type: "stage", stage: "parity",   count: valid.length,  tested });
  send({ type: "result", states: valid });
};

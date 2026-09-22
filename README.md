# CubeAssembler

> Assemble valid Rubik's Cube states from unlabelled face images — 2×2 to 7×7.

![License: MIT](https://img.shields.io/badge/License-MIT-cyan.svg)
![npm](https://img.shields.io/badge/runtime-npm-black)
![ReScript](https://img.shields.io/badge/lang-ReScript-e6484f)
![Tests](https://img.shields.io/badge/tests-23%2F23%20%E2%9C%85-brightgreen)

A full-stack library and web app that solves two geometric ambiguities when reconstructing a physical cube from 6 unordered face photographs:

1. **Face Placement** — which of the 6! = 720 position assignments is valid?
2. **Face Orientation** — which of the 4⁶ = 4,096 rotation combinations is valid?

The multi-stage pipeline filters 2,949,120 candidates down to physically reachable states using color balance, center uniformity, edge/corner adjacency, and full parity checks.

---

## Stack

| | |
|---|---|
| **Runtime** | [npm](https://npm.sh) ≥ 1.3 |
| **Server** | [Hono](https://hono.dev) — HTTP + SSE streaming, no middleware bloat |
| **Domain logic** | [ReScript](https://rescript-lang.org) → ES modules (served directly, no npmdler) |
| **Puzzle engine** | [cubing.js](https://github.com/cubing/cubing.js) — WCA scrambles, KPuzzle, TwistyPlayer |
| **Tests** | [Vitest](https://vitest.dev) |

---

## Quick Start

```bash
# Install
npm install

# Dev server with hot-reload
npm run dev
# → http://localhost:3000

# Run tests
npm test

# Build ReScript (optional — npm serves compiled .js directly)
npm run build:res
```

---

## Project Structure

```
cube-assembler/
├── index.html                     Web app (served by Hono, no npmdler)
│
├── server/
│   ├── Server.ts                  Hono app + all API routes
│   └── AssemblyWorker.ts          npm Worker: 2.9M-candidate search off main thread
│
├── src/                           ReScript domain library
│   ├── Index.res                  Public API
│   ├── ir/
│   │   ├── CubeIR.res             Core IR: puzzleSize, faceGrid, cubeIR, rotateFace
│   │   └── CubeIRUtils.res        Color balance, orbit extraction, adjacency tables
│   ├── notation/
│   │   └── Notation.res           Unified WRG + URF parser/printer (alphabet-parameterised)
│   ├── cubingjs/
│   │   ├── CubingJsBindings.res   @module bindings to cubing.js
│   │   ├── IRBridge.res           cubeIR ↔ KPatternData (3×3 full, NxN stub)
│   │   └── WCANotation.res        Full WCA move parser: face/wide/slice/rotation/depth
│   └── assembler/
│       ├── PermGen.res            Heap's algorithm — 720 permutations
│       ├── Parity.res             Full 4-condition parity check
│       └── CubeAssembler.res      5-stage pipeline orchestrator
│
└── test/
    └── notation.test.ts           23 Vitest tests
```

---

## API

All endpoints are served by the Hono server on `http://localhost:3000`.

### `GET /api/scramble?size=N`
Generate a WCA-quality random scramble for puzzle size N (2–7).

```json
{ "scramble": "R U R' U' F' U F ...", "size": 4 }
```

### `POST /api/assemble` → SSE stream
Run the full assembly pipeline. Sends Server-Sent Events:

```
data: {"type":"start","total":2949120}
data: {"type":"stage","stage":"balance","count":1024,"tested":500000}
data: {"type":"stage","stage":"parity","count":2,"tested":2949120}
data: {"type":"result","states":[...cubeIR...]}
```

**Request body:**
```json
{ "faces": [ { "n": 4, "data": ["W","W",...] }, ... ], "size": 4 }
```

### `POST /api/parity`
Full 4-condition parity check for a `cubeIR`.

```json
{
  "valid": true,
  "result": "Valid — all parity checks passed",
  "checks": {
    "colorBalance": true,
    "centerCores": true,
    "cornerColors": true,
    "edgeColors": true,
    "cornerOrientation": true,
    "edgeOrientation": true,
    "permutationParity": true
  }
}
```

### `POST /api/apply-alg`
Apply a WCA algorithm string to a cube state (via cubing.js KPuzzle).

```json
{ "cube": { ...cubeIR... }, "alg": "R U R' U'" }
```

### `POST /api/parse-wrg`
Parse WRG/Kociemba/Numeric notation into a `cubeIR`.

```json
{ "notation": "W W W W W W W W W  R R R...", "size": 3 }
```

---

## Notation System

The `Notation` module is alphabet-parameterised — WRG and URF are the same parser with a different 6-character symbol map:

| Notation | Alphabet | Format |
|---|---|---|
| **WRG** (default) | `W O G R B Y` | Flat / labeled facelet |
| **URF** (Singmaster) | `W O G R B Y` | Grouped by cubie type |
| **Kociemba** | `U L F R B D` | Flat facelet (solver input) |
| **Numeric** | `0 1 2 3 4 5` | ML / computer vision |
| **Custom** | any 6 distinct chars | Both formats |

```typescript
// Transcode Kociemba → WRG
Notation.transcode(s, ~from_=kociembaAlphabet, ~to_=wrgAlphabet, ())

// Print in URF cubie-grouped format
Notation.print(cube, ~format=Cubie, ())
// → Corners: UFR:WRG  UBR:WBR  ...
//   Edges:   UF:WG  UR:WR  ...
//   Centers: U:W  R:R  F:G  D:Y  L:O  B:B
```

---

## Parity Validation

For 3×3×3, four necessary and sufficient conditions are checked:

1. **Color balance** — each color appears exactly 9 times
2. **Corner orientation sum** ≡ 0 (mod 3)
3. **Edge orientation sum** ≡ 0 (mod 2)
4. **Permutation parity** — corner perm parity = edge perm parity

For 2×2, conditions 1 and 2 apply (edges are implicit).
For 4×4–7×7, structural + color balance + center uniformity checks are applied (full big-cube parity is future work).

---

## Bug Fixes vs. Original Code

The starting `CubeAssembler.res` sketch had 7 bugs, all corrected:

| # | Bug | Fix |
|---|-----|-----|
| 1 | `let p =` — no initialiser | Heap's initialises `[0..5]` |
| 2 | `rotateFace` was counter-clockwise | `dst[c][N-1-r] = src[r][c]` (CW) |
| 3 | `extractEdges` returned face-grid tuples | Returns facelet color pairs |
| 4 | `extractCorners` same issue | Returns color triplets with correct indices |
| 5 | `validateCenterCores` always returned `true` | Per-face center-block uniformity |
| 6 | `candidateCube` applied rotation to whole `perm` | Indexes `perm[0]`…`perm[5]` |
| 7 | No real parity check | Full 4-condition (orientation + permutation) |

---

## License

MIT © 2026 Werner Stein. See [LICENSE](LICENSE).

This project uses [cubing.js](https://github.com/cubing/cubing.js) which is dual-licensed MPL-2.0 / GPL-3.0.

# CubeAssembler

> Assemble valid Rubik's Cube states from unlabelled face images — 2×2 to 7×7.

![License: MIT](https://img.shields.io/badge/License-MIT-cyan.svg)
![npm](https://img.shields.io/badge/runtime-npm-black)
![ReScript](https://img.shields.io/badge/lang-ReScript-e6484f)
![Tests](https://img.shields.io/badge/tests-69%2F69%20%E2%9C%85-brightgreen)

A full-stack library and web app that solves two geometric ambiguities when reconstructing a physical cube from 6 unordered face photographs:

1. **Face Placement** — which of the 6! = 720 position assignments is valid?
2. **Face Orientation** — which of the 4⁶ = 4,096 rotation combinations is valid?

The multi-stage pipeline filters 2,949,120 candidates down to physically reachable states using color balance, center uniformity, edge/corner adjacency, and full parity checks.

---

## Stack

| | |
|---|---|
| **Runtime** | [Bun](https://bun.sh) ≥ 1.3 |
| **Server** | [Hono](https://hono.dev) — HTTP + SSE streaming, no middleware bloat |
| **Domain logic** | [ReScript](https://rescript-lang.org) → ES modules (served directly, no bundler) |
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
├── index.html                     Web app (served by Hono, no bundler)
│
├── server/
│   ├── Server.ts                  Hono app + all API routes
│   └── AssemblyWorker.ts          npm Worker: 2.9M-candidate search off main thread
│
├── src/
│   ├── client/                    Preact browser app: webcam capture, review, notation I/O
│   │   ├── index.tsx              App shell, capture/review flow, cube net view
│   │   ├── imageProcessing.ts     Canvas-based sticker color + grid-size detection, white balance
│   │   ├── cubeAssembly.ts        Face assembly + center-sticker identity/orientation solving
│   │   └── notationOutput.ts      Spaced-facelet notation (the app's sole manual I/O format)
│   │
│   └── (ReScript domain library, served as compiled ES modules)
│       ├── Index.res              Public API
│       ├── ir/
│       │   ├── CubeIR.res         Core IR: puzzleSize, faceGrid, cubeIR, rotateFace
│       │   └── CubeIRUtils.res    Color balance, orbit extraction, adjacency tables
│       ├── notation/
│       │   └── Notation.res       Unified WRG + URF parser/printer (alphabet-parameterised)
│       ├── cubingjs/
│       │   ├── CubingJsBindings.res  @module bindings to cubing.js
│       │   ├── IRBridge.res       cubeIR ↔ KPatternData (3×3 full, NxN stub)
│       │   └── WCANotation.res    Full WCA move parser: face/wide/slice/rotation/depth
│       └── assembler/
│           ├── PermGen.res        Heap's algorithm — 720 permutations
│           ├── Parity.res         Full 4-condition parity check
│           └── CubeAssembler.res  5-stage pipeline orchestrator
│
└── test/
    ├── notation.test.ts           23 tests — ReScript Notation module (WRG/URF/Kociemba/Numeric)
    ├── cubeAssembly.test.ts       15 tests — face identity/orientation solver (odd + even sizes)
    ├── notationOutput.test.ts     16 tests — spaced + URF (Kociemba) facelet formats
    ├── imageProcessing.test.ts    10 tests — OKLCH conversion + sticker-color learning
    └── parity.test.ts             5 tests — server-side corner/edge facelet-index tables
```

---

## Browser Capture & Review UI

The Preact app (`src/client/`) captures a real physical cube from 6 webcam
or imported photos and reconstructs its state:

1. **Capture** — one neutral entry point walks through 6 faces (labeled
   1–6, not U/R/F/D/L/B — the app has no way to know a face's identity
   from a photo alone). Grid size (2×2–7×7) is picked explicitly with a
   selector in the capture dialog (changing it mid-session clears any
   already-captured faces, since they'd otherwise mix grid sizes); a
   manual or auto-estimated white balance (gray-world light-source
   detection) is applied per shot.
2. **Review** — after all 6 faces are captured, a global recalibration
   pass re-clusters all stickers together (k-means, capacity-constrained
   to the physical invariant of exactly N² stickers per color) and a
   wizard lets you approve or correct each face's detected colors against
   its photo. A per-color count row (e.g. `9/9`, or `12/9` flagged red)
   shows how many stickers were assigned to each color against the N²
   expected, so a systematic mixup between two colors is visible at a
   glance instead of requiring a cell-by-cell count. Every step of color
   classification — per-sticker sampling, k-means, and confidence scoring
   — measures color "closeness" in OKLCH (`rgbToOKLCH` in
   `imageProcessing.ts`), not raw RGB: separating hue from
   lightness/chroma matters because canonical Red and Orange sit only 127
   RGB units apart (entirely on the G channel) but are ~23° apart in hue,
   a far more reliable signal under real lighting variation.
3. **Orientation solving** — on confirm, `solveFaceOrientations` (in
   `cubeAssembly.ts`) resolves true face identity and each face's
   0°/90°/180°/270° rotation by maximizing valid corner cubies first, edge
   cubies second. Odd puzzle sizes (3×3, 5×5, 7×7) get identity for free
   from each face's fixed center sticker, needing only rotation solved.
   Even sizes (2×2, 4×4, 6×6) have no such fixed reference — their center
   stickers belong to independently-rotatable center cubies — so identity
   is searched jointly with rotation instead, using the same corner/edge
   validity scoring. Falls back to capture order, with a warning, only if
   fewer/more than 6 faces were captured (or, for odd sizes, a duplicate
   or unreadable center).
4. **Cube net** — the resolved state renders as a standard unfolded net
   (U top, L-F-R-B row, D bottom) alongside the 3D viewer.

Manual entry and the notation output panel offer two interchangeable
formats, toggled with the same switch in both places (see
`src/client/notationOutput.ts`):

- **Spaced facelets** — 6 space-separated N²-letter blocks of WOGRBY color
  letters, in U R F D L B order, e.g. for a solved 3×3: `WWWWWWWWW
  RRRRRRRRR GGGGGGGGG YYYYYYYYY OOOOOOOOO BBBBBBBBB`.
- **URF facelets** — the standard Kociemba/solver facelet string: one
  unspaced run of 6·N² URFDLB letters, where each letter names the face
  whose solved color that sticker matches (not the color itself), e.g. for
  a solved 3×3: `UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB`.

Both are client-only formats, distinct from the ReScript `Notation`
module described below, which the server-side parity/assembly pipeline
uses instead.

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

`CORNER_FACELETS_3x3`/`EDGE_FACELETS_3x3` (`server/Server.ts`) map each
corner/edge cubie to its facelet positions on the B (back) face, which is
viewed from outside the cube — mirrored left/right relative to F. A
previous version of these tables got that mirroring backwards for the
UBR/UBL corners and BR/BL edges, which could reject a genuinely valid
scrambled cube with "Unknown corner color triplet" even though color
balance and center cores both checked out; see `test/parity.test.ts` for
the real capture that caught it.

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

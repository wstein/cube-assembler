# CubeAssembler

> Assemble valid Rubik's Cube states from unlabelled face images — 2×2 to 7×7.

![License: MIT](https://img.shields.io/badge/License-MIT-cyan.svg)
![npm](https://img.shields.io/badge/runtime-npm-black)
![ReScript](https://img.shields.io/badge/lang-ReScript-e6484f)
![Tests](https://img.shields.io/badge/tests-123%2F123%20%E2%9C%85-brightgreen)

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
│   │   ├── imageProcessing.ts     Sticker color extraction (OKLCH), white balance, sticker-color learning
│   │   ├── cubeAssembly.ts        Face assembly + center-sticker identity/orientation solving
│   │   └── notationOutput.ts      WRG/URF facelet notation + format auto-detection
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
    ├── notationOutput.test.ts     22 tests — WRG/URF facelet formats + format auto-detection
    ├── imageProcessing.test.ts    41 tests — OKLCH conversion/formatting, range math, hue-overlap detection, optimal assignment, outlier-robust sampling, sticker-color learning
    ├── parity.test.ts             14 tests — server-side corner/edge/wing-edge facelet-index tables
    ├── assemblyWorker.test.ts     7 tests — /api/assemble worker's corner/edge validation
    ├── fixtures.test.ts           1+ tests — real captures vs. human-verified colors (see below)
    └── fixtures/                  Saved captures for fixtures.test.ts (see fixtures/README.md)
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
   detection) is applied per shot. Auto mode estimates live while framing
   face 1, then locks to whatever it was at the moment face 1 was
   captured — faces 2–6 reuse that same gain instead of each
   re-estimating from their own (possibly differently-framed) shot. The
   live overlay is a plain wireframe — just each cell's confidence-
   colored border over the raw camera feed, no fill or text — so the
   photo itself stays fully visible for framing; the full per-sticker
   OKLCH breakdown (and a color swatch) shows up once you're in the
   review wizard instead, where there's room for it.
2. **Review** — after all 6 faces are captured, a global recalibration
   pass re-clusters all stickers together (k-means, with each iteration's
   assignment step solved as a genuine optimal balanced assignment —
   `hungarianAssignment` in `imageProcessing.ts` — rather than a greedy
   heuristic, so the N² -per-color physical invariant is enforced exactly
   without ever leaving a cheaper global rearrangement on the table) and a
   wizard lets you approve or correct each face's detected colors against
   its photo. A color-stats table (one row per color: swatch, count,
   lightness/chroma/hue range) shows both how many stickers were assigned
   to each color against the N² expected — so a systematic mixup between
   two colors is visible at a glance instead of requiring a cell-by-cell
   count — and the actual observed OKLCH range across that color's
   currently-assigned stickers (e.g. hue `73°–78°`; hue specifically via
   `hueCircularRange`, computed as the minimal enclosing arc so a cluster
   straddling the 0°/360° wraparound still reports its true, short span
   instead of a spurious ~350° one), so a color's readings drifting
   toward a neighbor's territory is visible before that neighbor's count
   actually goes wrong — and when two colors' hue ranges actually overlap
   this capture (`hueRangesOverlap`), both rows get a ⚠ flag naming which
   other color to check for mixups against, rather than leaving you to
   spot the overlap by comparing ranges across rows yourself. That same
   overlap signal, plus each cell's own detection confidence, also flags
   the specific affected stickers directly in the "Detected" grid (dashed
   border + badge, with a running "N flagged for review" count next to the
   pane label) — so correcting one ambiguous sticker doesn't first require
   noticing it was ambiguous. The "Detected" grid likewise labels every
   sticker with its own OKLCH value, not just its classified color. Each
   sticker's color is itself a trimmed mean (`trimmedMeanColor`), not a
   plain average, over its sampled pixels — the brightest/darkest 15% by
   luminance are discarded before averaging, so a specular highlight off
   the sticker's glossy plastic (or a shadow at its edge) can't pull the
   reading toward itself. Every step of color classification — per-
   sticker sampling, k-means, and confidence scoring — measures color
   "closeness" in OKLCH (`rgbToOKLCH` in `imageProcessing.ts`), not raw
   RGB: separating hue from lightness/chroma matters because canonical
   Red and Orange sit only 127 RGB units apart (entirely on the G
   channel) but are ~23° apart in hue, a far more reliable signal under
   real lighting variation.
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
5. **Send to Server** — once a cube is confirmed, saves that exact
   capture (every face's actual photo plus its color grid after any
   manual corrections) as a permanent regression test fixture (`POST
   /api/fixtures`, `test/fixtures/<name>/`). A misclassification a human
   caught once in the review wizard stays caught: `test/fixtures.test.ts`
   re-runs the real detection pipeline against every saved fixture and
   fails if it stops matching. Fixtures can be hand-tagged (surfaced in
   each test's title, so a pattern across failures — e.g. one lighting
   condition — is visible straight from `npm test` output) or marked
   `expectedFail` for a known, not-yet-fixed limitation (runs via Vitest's
   `it.fails`, so the moment it's actually fixed the test itself fails
   until the flag is removed). See
   [`test/fixtures/README.md`](test/fixtures/README.md).

Manual entry and the notation output panel offer two interchangeable
formats, toggled with the same switch in both places (see
`src/client/notationOutput.ts`):

- **WRG facelets** — 6 space-separated N²-letter blocks of WOGRBY color
  letters, in U R F D L B order, e.g. for a solved 3×3: `WWWWWWWWW
  RRRRRRRRR GGGGGGGGG YYYYYYYYY OOOOOOOOO BBBBBBBBB`.
- **URF facelets** — the same block structure, but using the standard
  Kociemba/solver alphabet: each letter is U/R/F/D/L/B, naming the face
  whose solved color that sticker matches (not the color itself), e.g.
  for a solved 3×3: `UUUUUUUUU RRRRRRRRR FFFFFFFFF DDDDDDDDD LLLLLLLLL
  BBBBBBBBB`.

Both are client-only formats, distinct from the ReScript `Notation`
module described below, which the server-side parity/assembly pipeline
uses instead.

Pasting into the manual-entry textarea auto-detects which of the two
formats the pasted text is in and switches the toggle to match, so you
don't have to select the right one first: WOGRBY's W/Y/O/G and URFDLB's
U/F/D/L never appear in the other alphabet, so `detectNotationFormat`
(`notationOutput.ts`) can tell them apart from content alone (R and B are
shared by both alphabets, so text using only those two letters is left
alone rather than guessed).

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
Full 4-condition parity check for a `cubeIR` (3×3×3 shown; 4×4–7×7 return
`colorBalance`, `cornerColors`, `cornerOrientation`, and `wingEdgeColors`
only — see [Parity Validation](#parity-validation)).

```json
{
  "valid": true,
  "result": "Valid — all parity checks passed",
  "checks": {
    "colorBalance": true,
    "cornerColors": true,
    "cornerOrientation": true,
    "edgeColors": true,
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

### `POST /api/fixtures`
Saves a human-verified capture (each face's actual photo plus its color
grid after any manual corrections) as a regression test fixture under
`test/fixtures/<name>/` — see [Regression fixtures](test/fixtures/README.md).
Reachable from the app itself via the **Send to Server** button once a
cube has been confirmed. `meta` is optional, opaque capture context
(camera, white balance, sampling setup, etc.) stored as-is under `capture`
in the fixture's `meta.json`. `colorsURFDLB` is the human-verified colors of
all 6 faces in U R F D L B order (WRG facelets, each face row-major as
photographed); `detectedURFDLB`, optional, is detection's result before
any hand correction. Per-face fields beyond `photo` (crop, camera settings
at capture, ...) are stored as-is on that face.

```json
{
  "name": "optional-name (defaults to a timestamp)",
  "gridSize": 3,
  "colorsURFDLB": "GRRYOYWYW WYWROGORB GRRYOYWYW YWYBROGWR GBGBGBOBO BGRGBOBWO",
  "detectedURFDLB": "RRRYOYWYW WYWROGORB GRRYOYWYW YWYBROGWR GBGBGBOBO BGRGBOBWO",
  "faces": {
    "U": {
      "photo": "data:image/jpeg;base64,...",
      "crop": { "x": 636, "y": 216, "width": 648, "height": 648 }
    },
    "R": { ... }, "F": { ... }, "D": { ... }, "L": { ... }, "B": { ... }
  },
  "meta": {
    "app": { "version": "0.1.0", "commit": "460a4d1" },
    "camera": { "label": "FaceTime HD Camera", "requested": { ... }, "granted": { "width": 1920, "height": 1080, ... }, "supported": { ... } },
    "profile": { "id": "cube-mfx2k1-8q3d", "name": "Rubik's 3×3" },
    "sampling": { "backgroundGap": 0.05, "stickerCore": 0.6 },
    "colorCalibration": { "applied": true, "learnedColors": { "W": [214.2, 211.8, 205.1], "R": [196.3, 40.7, 45.9], ... } }
  }
}
```

```json
{ "success": true, "name": "capture-2026-01-15T10-30-00-000Z", "path": "test/fixtures/capture-2026-01-15T10-30-00-000Z" }
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

Corners are always single unit cubies regardless of puzzle size — every
NxN cube has the same 8 corners, each occupying the same grid-corner slot
on 3 faces, just at a different literal facelet index — so conditions 1,
2, and the corner-triplet-identity check behind them apply to **every**
size (2×2–7×7), not just 3×3×3.

For 4×4–7×7, edges split into N−2 independently-permutable "wing" pieces
per edge. These are validated by **counting**, not full
permutation/orientation parity (conditions 3/4's generalization is future
work — see below): every wing sticker pair must be one of the 12
canonical edge color pairs (an "opposite colors touching" pair is
physically impossible anywhere, corner or wing), and each canonical pair
must appear exactly N−2 times across all wings, since a specific-colored
wing piece has a fixed pair of colors and a fixed total supply. This
pools wings of every "depth" together rather than validating each
depth-class separately — on N≥5, wings at different distances from an
edge's two corners belong to distinct permutation orbits and can't mix —
a known gap that can only make the check *weaker* (miss a cross-depth
imbalance), never cause a false rejection, so it was an acceptable
starting point rather than something blocking this check from shipping.
Centers get no check at all: color balance plus the exact corner/wing
counts above already force each color's center-facelet count to be
exactly (N−2)² (there's no room left for it to be anything else), and
individual center pieces aren't distinguishable by color anyway (several
genuinely different pieces share the same solved color).

2×2 (which has no edges or centers at all) gets the complete model for
free from the corner checks alone.

Center-block color uniformity was tried as a stand-in for all of this and
removed: unlike a 3×3's single fixed center sticker, a face's center
pieces on an even cube are independently movable, so a genuinely
scrambled 4×4/6×6 routinely has a mix of colors in what would be "the
center block" — that's exactly why "center reduction" is a required
first step of the standard big-cube solving method. Enforcing uniformity
there rejected valid scrambles with "Center cores not uniform"; see
`test/parity.test.ts` for the real 4×4 capture that caught it.

`CORNER_SLOTS`/`EDGE_FACELETS_3x3` (`server/Server.ts`) map each
corner/edge cubie to its facelet positions on the B (back) face, which is
viewed from outside the cube — mirrored left/right relative to F. A
previous version of these tables got that mirroring backwards for the
UBR/UBL corners and BR/BL edges, which could reject a genuinely valid
scrambled cube with "Unknown corner color triplet" even though color
balance checked out; see `test/parity.test.ts` for the real capture that
caught it.

The wing-edge geometry (`EDGE_LINES`) hit a related but distinct bug
during development: a first attempt derived each edge's facelet
correspondence by pattern-matching against `CORNER_SLOTS` (reasoning
about which named corner sits at which slot on each face), which got 4 of
the 12 edges' direction backwards (UR, UB, DB, DL) — invisible against
the only available cross-check (3×3's `EDGE_FACELETS_3x3`, which has just
one, self-symmetric wing position per edge where a forward and a reversed
formula produce an identical result), so it looked correct until tested
against a real 4×4 capture with 2 distinguishable wing positions per
edge. Re-derived from explicit 3D coordinates for all 6 faces instead
(matching each face's (row, col) to a position on the cube's surface and
finding which cells of two adjacent faces coincide), which is what
`EDGE_LINES`'s `reverse` flags now encode.

`server/AssemblyWorker.ts` (the `/api/assemble` brute-force face-
orientation search, currently unreachable from the UI) mirrors this same
corner/edge/color-balance logic in a separate copy to avoid a circular
import, and had drifted: it still had the old B-face-mirroring bug, the
same removed center-uniformity check, and its own `VALID_CORNERS` lookup
table used the *opposite* chirality from the corner triples it's checked
against — rejecting every cube, including a solved one. All three are
fixed now too, with their own regression coverage in
`test/assemblyWorker.test.ts`. Separately (not fixed, since it's
unrelated to any of the above): the `/api/assemble` route itself
currently throws on every request (`loaders is not defined` in
`server/Server.ts`), so this pipeline is fully inert regardless.

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

# CubeAssembler

> Assemble valid Rubik's Cube states from unlabelled face images — 2×2 to 7×7.

[Open the static scanner demo](https://wstein.github.io/cube-assembler/) · [Source repository](https://github.com/wstein/cube-assembler)

Scanning, review, parity checks, and fixture ZIP import/export run in the
browser. Local development also offers an optional upload-only fixture server
that saves reviewed captures directly into `test/fixtures/`.

![License: MIT](https://img.shields.io/badge/License-MIT-cyan.svg)
![npm](https://img.shields.io/badge/runtime-npm-black)
![Tests](https://img.shields.io/badge/tests-vitest-brightgreen)

A web app that reads a physical Rubik's cube (2×2–7×7) from six camera photos
and reconstructs its state. Two ambiguities have to be resolved:

1. **Face placement** — which photo shows which face?
2. **Face orientation** — how was each photo rotated?

On odd cubes each face's center color says which face it is, leaving
4⁶ = 4,096 rotation combinations; on even cubes identity and rotation are
searched together (122,880 combinations); a guided capture narrows it to 64
arrangements. The browser keeps the arrangements whose corners and edges are
valid, asks when more than one fits, and the full parity check verifies the
result.

The scanner defaults to **Detect face**: it finds sticker seams near the camera
guide, aligns and straightens the face, then reads its colors. **Guide grid**
is a manual switch that reads the fixed center square shown on screen. Both
modes use the same color classifier, and neither requires a downloaded model.
Cube and Colors are separate settings. The Cube menu groups sizes by cube name:
Generic always offers 2×2 through 7×7, each with a 60% sticker core and 40%
total gap. Choosing a cube sets the size. Colors can be reused across sizes.
Sampling setup adjusts the gap around each sticker on a named cube. **New colors**
copies the current palette into a named profile such as GoCube, ready to learn
from its first valid capture; its name can be edited in Sampling setup. Built-in
cubes and Generic colors are read-only; capture learning never changes Generic colors.
**Automatic colors** starts each capture without a saved palette, learns from
all six faces, and uses a saved profile as a classification reference only
after a clear match. If none matches, the result is named **Colors from this
capture**. A previous Automatic match does not preselect the next capture.
Selecting a profile by name keeps that manual choice. After review, the
Capture card shows the profile used beside the cube profile, its six-color
fit score when a saved profile matched, and the first-pass camera hue method.
The fit score describes palette similarity, not the probability of a brand.
Backdrop white balance excludes a 25% band around the detected face. Once two
faces have backdrop readings, the live preview and next camera capture use a
rolling median of those readings and the current frame; the preview badge shows
"median WB" when active. The final six-face pass still recalibrates all faces.
Older saved backdrop-gap settings are accepted but ignored.
**New cube** copies the selected cube's size and sticker gap and asks for a
name. After a valid, confident reviewed camera capture, **Create sticker color
profile** in the Capture card saves the six-face learned palette under a new
name, even if Automatic colors matched an existing profile. Later approved
captures update a manually selected profile gradually when the readings are
close enough. Automatic colors only selects a profile. After a valid, confident
reviewed capture, **Update NAME profile** explicitly blends the new colors into
the detected profile; without that click, Automatic never changes its stored
RGB values or capture count. Automatic matches only with a clear margin;
ambiguous colors use the capture's own learned palette. Color similarity never
identifies the cube itself.
Settings can be downloaded and restored as JSON. The v3 storage key preserves
the previous combined-profile key for older app versions.

The update gate uses a mean palette distance of 0.08 and a per-color limit
of 0.14 in the classifier's OKLab metric, after a valid reviewed camera
capture with at least 80% confident cells and no more than 2% hand-corrected
cells. In a sweep of 23 saved capture
palettes, all 31 same-name/same-size pairs passed this gate, while 214 of
222 other pairs also passed. That overlap is why palette distance is used
for cautious learning and Auto matching, not for cube identification.

---

## The scanner

The capture dialog has two modes; neither needs a downloaded model.

- **Detect face** (default) finds the cube face on its own near the dashed
  area and reads it. It never falls back to the fixed square: if no face
  is found it says *Align face in view* and waits.
- **Guide grid** reads exactly the square drawn on screen.

On the first face in Detect face mode, the app counts repeating seams in
both directions to identify a 2×2–7×7 grid. It changes the size only after
two agreeing live readings of a visible face. A manually selected size takes
precedence, and the size stays fixed after the first face is captured.

### How Detect face finds a face

The dashed frame is a 70% wide placement guide; detection can reach beyond it.
`src/client/gridAlignment.ts` first estimates the face outline, then searches
near that outline for sticker seams. If the outline is unclear, it searches
around the centered guide:

- **Position and size** - the outline scan covers faces 0.7–1.3 times the
  guide size and centers up to 22% of a guide width away. The seam search
  then stays within half a cell of that estimate to avoid slipping a row
  on 5×5–7×7 faces.
- **Seams by each pixel's strongest channel**, not brightness: red and blue
  stickers are as dark as grey-brown plastic in brightness, but stand far
  above it in their own color.
- **Tilt** up to 35 degrees, measured from the face's edge directions and
  kept only when a grid shows under it; the face is then read upright.
- **Wider perimeter cubies** on big cubes (measured up to 1.56x the inner
  ones on 6x6/7x7): the search and the color sampling use that layout.

The live check (`faceVisibility` in `imageProcessing.ts`) then requires
evenly colored sticker cells and a visible face outline (Guide grid accepts
a sticker pattern instead of the outline). A
confirmed face stays shown through up to two weak frames (display only,
`liveHold.ts`). **Auto capture** takes the face after five matching readings
at 60% confidence or more (`autoCapture.ts`). Missed or weaker frames pause
the count; a changed sticker pattern starts a new count. The preview ring
shows progress, and capture flashes the preview and plays a short click when
sound is enabled. The sound setting is saved in this browser. After a capture, the turn cue
stays visible while the last captured face remains in view. It closes after
three consecutive live checks show a changed pattern, a missing face, or a
substantial change in face position, size, or angle. Continue confirms the
turn and releases the capture gate when two sides look identical. A color pattern matching
an earlier capture is shown as a warning in the camera and capture net, since
different faces can look identical, especially on even cubes. It does not
prevent the next capture.

On the real-capture benchmark (`test/gridAlignmentRealCrops.test.ts`) a
7x7 held 4% off-center goes from 16% misread stickers to 0%, and tilted
10 degrees from 23% to 0%.

### Centers of odd cubes

The center cell of 3x3, 5x5 and 7x7 is read past its logo (the larger of
two color groups over a wider zone), and after all six sides the six
centers are assigned one of each color, so a misread center can't push a
real sticker to the wrong color (`classifyAcrossFaces`).

---

## Stack

| | |
|---|---|
| **App** | [Preact](https://preactjs.com), built and served by [Vite](https://vitejs.dev) |
| **Tests** | [Vitest](https://vitest.dev) |

---

## Quick Start

```bash
# Install
npm install

# Dev server with hot-reload
npm run dev
# → app on http://localhost:5173

# Optional, in another terminal: enable fixture upload
npm run fixture:server
# → upload-only endpoint on 127.0.0.1:7100

# Run tests
npm test
```

### GitHub Pages deployment

The `Publish Pages` workflow builds the Vite client with the repository's
subpath as its asset base and deploys `dist/` on pushes to `main`. The `CI`
workflow builds and tests pushes and pull requests. The publishing source is
**Settings → Pages → Build and deployment → GitHub Actions**. To
preview the static build locally, run
`VITE_BASE_PATH=/cube-assembler/ npm run build` and `npx vite preview`.

---

## Project Structure

```
cube-assembler/
├── index.html                     App entry, built and served by Vite
│
├── src/
│   └── client/                    Preact browser app: webcam capture, review, notation I/O
│       ├── index.tsx              App shell, capture/review flow, cube net view
│       ├── imageProcessing.ts     Sticker color extraction (OKLCH), live face check, cross-face color learning
│       ├── gridAlignment.ts       Detect face: grid position, size, tilt and perimeter layout from seams
│       ├── liveAnalysis.ts        One live frame analyzed on raw pixels (colors + cube check)
│       ├── liveAnalysis.worker.ts Runs that analysis off the page's thread, at 720p
│       ├── autoCapture.ts         Captures once live detections stay stable
│       ├── liveHold.ts            Holds a confirmed face through weak live frames
│       ├── cubeAssembly.ts        Face assembly, guided capture, orientation solving
│       ├── parity.ts              Parity check, with the stickers to look at when it fails
│       ├── orientationWizard.ts   "Choose each side": which face to ask about next
│       ├── cubeGeometry.ts        Whole-cube rotations and layer turns
│       ├── profileSettings.ts     Separate cube geometry and color profiles
│       ├── profileStorage.ts      v3 settings storage and legacy conversion
│       ├── colorProfileLearning.ts Quality gate and weighted color learning
│       ├── capturePresentation.ts Capture dialog wording and layout helpers
│       ├── fixtureFormat.ts       Reading saved fixtures, old formats included
│       ├── fixtureZip.ts          Test fixtures as zip files: save (download) and upload
│       ├── fixtureUpload.ts       Dev-only multipart upload client
│       └── notationOutput.ts      WRG/URF facelet notation + format auto-detection
│
├── scripts/
│   └── fixtureUploadServer.mjs     Localhost-only fixture upload endpoint
│
└── test/
    ├── cubeAssembly.test.ts       Face identity/orientation solver (odd + even sizes)
    ├── guidedCapture.test.ts      Guided capture arrangements, predicted centers
    ├── orientationWizard.test.ts  "Choose each side" on an ambiguous pattern cube
    ├── imageProcessing.test.ts    Color extraction, live face check, logo-safe centers
    ├── crossFace.test.ts          Cross-face color assignment, one of each center
    ├── gridAlignment.test.ts      Grid search: offset, size, tilt, perimeter, grey seams
    ├── gridAlignmentRealCrops.test.ts  Benchmark on saved captures held off-center/tilted
    ├── liveAnalysis.test.ts       Live frame analysis, incl. a 720p copy of a 1080p frame
    ├── liveHold.test.ts, autoCapture.test.ts
    ├── notationOutput.test.ts     WRG/URF facelet formats + format auto-detection
    ├── parity.test.ts             Parity check: corner/edge/wing-edge facelet-index tables
    ├── fixtureZip.test.ts         Fixture zips: layout, names, hand-made zips
    ├── fixtures.test.ts           Real captures vs. human-verified colors (see below)
    ├── liveFaceAppearance.test.ts Live face check on every saved capture
    └── fixtures/                  Saved captures for fixtures.test.ts (see fixtures/README.md)
```

Real captures in `test/fixtures/capture-*` are gitignored; the tests that
need them skip without.

---

## Browser Capture & Review UI

The Preact app (`src/client/`) captures a real physical cube from 6 webcam
or imported photos and reconstructs its state:

1. **Capture** — one neutral entry point walks through 6 faces (labeled
   1–6, not U/R/F/D/L/B — the app has no way to know a face's identity
   from a photo alone). Detect face estimates the grid size from the first
   visible face; the 2×2–7×7 selector remains available for manual choice.
   Changing size after a capture clears the saved faces. The first two
   adjacent odd-size faces keep their photographed slots. If the second
   face is opposite the first, it goes to slot 3 and slot 2 waits for an
   adjacent face. Later 3×3, 5×5 and 7×7 faces are placed by their fixed
   center colors even when photographed out of order. Even cubes have no
   fixed center, so they stay in capture order. The saved net always shows
   the captured colors, including with Mirror enabled.
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
   or unreadable center). When the photos fit together more than one way,
   *No, let me choose each side* asks about one face at a time, starting
   from every arrangement - the turned-down suggestion included, so a
   face that fits either way is always asked about.
4. **Cube net** — the resolved state renders as a standard unfolded net
   (U top, L-F-R-B row, D bottom) alongside the 3D viewer.
5. **Save as test fixture** — once a cube is confirmed, saves that exact
   capture (every face's actual photo plus its color grid after any
   manual corrections) as a zip to unzip into `test/fixtures/<name>/`,
   a permanent regression test fixture. A misclassification a human
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

Both are client-only formats.

Pasting into the manual-entry textarea auto-detects which of the two
formats the pasted text is in and switches the toggle to match, so you
don't have to select the right one first: WOGRBY's W/Y/O/G and URFDLB's
U/F/D/L never appear in the other alphabet, so `detectNotationFormat`
(`notationOutput.ts`) can tell them apart from content alone (R and B are
shared by both alphabets, so text using only those two letters is left
alone rather than guessed).

---

## Test fixtures

**Save as test fixture** (once a cube is confirmed) previews `<name>.zip`
with `<name>/meta.json` and the six face photos. Download and unzip it into
`test/fixtures/`, or select **Upload to localhost** while both dev servers are running.
The button stays disabled until the upload server responds and rechecks while
the fixture dialog is open. Availability uses an empty `GET /ping` response;
there is no fixture download route.
The local server accepts only `POST /upload`, never serves files, refuses
overwrites, and binds only to `127.0.0.1`. **Upload fixture** loads a ZIP
or fixture folder back into the app. The `fixture:server` terminal logs each
ping or upload request with its status and elapsed time; successful uploads
include the saved fixture name, without logging the photos or metadata.
`meta.json` holds the
human-verified colors (`colorsURFDLB`), detection's own result before any
hand correction (`detectedURFDLB`), per-face capture details, and `capture`,
informational context (app version and commit, camera, sampling, learned
colors). `capture.colorProfile` records one resolved profile name, selection
mode, RGB values, and any profile color fit score for the complete six-face capture. `capture.colorReference`
records a saved or manually selected profile when it was used as the
classification reference. The learned palette used to classify every face
together remains in `capture.colorCalibration`. See [Regression fixtures](test/fixtures/README.md).

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

`CORNER_SLOTS`/`EDGE_FACELETS_3x3` (`src/client/parity.ts`) map each
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

---

## License

MIT © 2026 Werner Stein. See [LICENSE](LICENSE).

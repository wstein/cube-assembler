# TODO

Backlog from the "testing against real fixtures / improving detection from
real cubes" design discussion. Numbering matches that discussion's ratings;
1 and 2 are already shipped.

## Done

1. **Fixture tagging + known-hard (xfail) fixtures** — `meta.json` supports
   `tags` and `expectedFail`; test titles in `test/fixtures.test.ts` surface
   both so failure patterns (e.g. one lighting condition) are visible
   directly in `npm test` output, and a known limitation runs via
   `it.fails` so a real fix can't go unnoticed. See
   `test/fixtures/README.md`.
2. **Flag low-confidence/hue-overlap cells in the review wizard** — the
   "Detected" grid (`src/client/index.tsx`) now highlights any cell that's
   either low-confidence or whose color's hue range overlaps another
   color's this capture, with a per-cell badge and a flagged-count summary
   next to the pane label. Turns every future capture's corrections into
   better-targeted training signal.


### Scanner (branch `feat/grid-alignment`)

- **Detect face finds the face itself** instead of trusting the guide:
  offset, size, tilt (up to 35 degrees) and the wider perimeter cubies of
  big cubes, from seams scored by each pixel's strongest channel.
- **Odd cubes' centers**: read past their logo, and assigned one of each
  color across the six sides.
- **"Choose each side"** starts from every arrangement, so a face that fits
  either way is asked about instead of filled in.
- **The live preview runs in a worker** at 720p; a confirmed face is held
  through two weak live frames; a clear message appears when the API server
  isn't running.
- **Removed what the app no longer used**: automatic cube-size detection,
  the server-side assembly worker, the scramble/algorithm/parse endpoints,
  the ReScript library, the vendored cubing.js, preact-router and the
  server's broken static page. The server keeps `/api/fixtures`.
- **Parity check runs in the browser** (`src/client/parity.ts`), so the
  GitHub Pages demo validates cubes too; `/api/parity` is gone.

## Next

3. **Consent + review queue for fixtures from other people.** Right now
   `POST /api/fixtures` writes straight to `test/fixtures/` on whatever
   machine is running the server - fine solo, not for a deployed instance.
   Needs a pending/ holding area + a review step before anything is
   promoted into the real suite. Only worth doing once fixtures are
   actually wanted from people other than the person running the server.

4. **Learned per-color centroids from the fixture corpus.** Offline script:
   average (in OKLab) every human-confirmed sample of each color across all
   fixtures, use that instead of (or alongside) the fixed WCA-vivid
   canonical anchors in `imageProcessing.ts`. Validate strictly against
   `test/fixtures.test.ts` before/after - do this once #1/#2 have had a
   chance to grow the fixture set a bit, otherwise there's not enough
   signal to learn from.

5. **Palette-type detection (vivid vs. pastel/muted).** Root cause of the
   white-patch (C1) regression found earlier: one fixed canonical anchor
   set can't represent both a standard WCA cube and a pastel/muted one.
   Estimate overall chroma range from the capture and pick/blend anchor
   sets accordingly. Do this after #4 and after a few more pastel-cube
   fixtures exist to validate against - don't repeat the C1 mistake of
   shipping a correction with nothing real to check it against.

6. **Small learned classifier (logistic regression / shallow NN) trained on
   the corpus.** Only worth attempting once the fixture corpus is large and
   diverse enough (rough rule of thumb: tens of real captures across
   multiple lighting/camera conditions) - with fewer, it will overfit to
   whatever happened to be captured. Revisit later, not now.

## Next (scanner)

7. **Find out why the first saved missed faces fail.** Four frames saved on
   2026-09-25 (three `no-grid`, one `no-sticker-pattern`, all 3x3); the
   replay reproduces the live decision, so a fix can be checked on exactly
   these frames.

8. **Correct two fixtures saved with the old wizard bug.** Their approved
   cube has one face turned 90 degrees, so their reassembly tests fail:
   `capture-2026-09-25T11-38-36` (3x3, back face - confirmed by the user)
   and `capture-2026-09-25T11-42-40` (7x7, right face - found by the guided
   search, not yet confirmed).

9. **`capture-2026-09-25T11-00-11` (4x4) doesn't reassemble** into its
   approved cube; it failed before the center changes too.

10. **Ask to re-center when the grid snaps a row.** Beyond half a cell of
    offset (about 6% on a 7x7) the grid can slip one row and read worse
    than the guide (35% -> 45% misread at 8% off). The outer grid lines then
    miss the face's edge, which could keep the face from being accepted and
    show "Center the cube in the square". Never fall back to the guide.

11. **A browser test of the capture path** (Playwright, e.g. `npm run
    test:e2e`): canvas crop, saved photo and re-detection together, which
    the unit tests only cover piece by piece.

12. **Real captures in CI.** They are gitignored, so the benchmark and
    fixture tests skip there; a small committed subset (the owner's call:
    size, privacy) or the licensed vision fixtures could cover it.

13. **Speed up or opt out of the real-capture benchmark** - about 35 s of
    `npm test`.

14. **The long-standing fixture failures** (`17-33-06`, `17-37-13`, `19-14-39`,
    `20-10-05`, `20-55-24`, `21-08-47`): readings off by a few levels
    from the browser's, or single misreads - unchanged by this branch.

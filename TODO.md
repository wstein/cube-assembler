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

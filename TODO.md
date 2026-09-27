# TODO

Open scanner and fixture work, ordered by current priority. Item numbers refer
to the original real-fixture testing discussion. See
[`docs/architecture.md`](docs/architecture.md) for the current implementation.

## Done

- **#1 Fixture tags and known-hard cases:** `meta.json` supports `tags` and
  `expectedFail`; `test/fixtures.test.ts` surfaces them in test results.
- **#2 Review uncertain cells:** the Detected grid flags low-confidence cells
  and colors whose hue ranges overlap.
- **#3 Contributed fixtures:** the published app saves a fixture ZIP or uploads
  to the contributor's localhost server. `CONTRIBUTING.md` links ZIP submission
  to the bug-report form, and both it and the form warn that photos become
  public. Maintainers review each fixture before committing it.
- **#11 Browser upload coverage:** Playwright checks six-photo uploads with and
  without metadata in `e2e/upload.spec.ts`. A stubbed live-camera capture test
  is still open below.
- **#12 Real captures in CI:** real 2×2–5×5 and 7×7 fixtures plus a synthetic
  6×6 are checked in via Git LFS, and `.github/workflows/ci.yml` runs their
  tests.
- **#5 Evaluate vivid and muted palette anchors:** the eight built-in palettes
  already cover different surfaces. Replaying Automatic on the 14 committed
  real captures reads 1,303 of 1,308 stickers correctly in preview (99.6%).
  Only two errors are orange read as red, both on one 3×3 face; the other
  three are white logo centers read as blue. All committed fixture pipelines
  pass after six-face calibration. New broad palette anchors are not justified
  by this corpus; keep the two orange samples as a focused regression target.
- **#10 Detect slipped large-cube grids:** a seam fit that misses an outer
  face edge is rejected on 6×6 and 7×7, with a re-centering cue. Synthetic
  out-of-reach cases and the committed real-crop replay guard the change.

## Next

1. **Lazy-load the 3D viewer and Profiles page.** Measure the initial scanner
   bundle before and after splitting these routes from it.
2. **#13 Speed up the real-capture benchmark.** It adds about 35–50 s to
   `npm test`; profile the slow cases, then cache or optimize without dropping
   the committed capture coverage.
3. **#8–9 Resolve old assembly fixtures.** Recheck the two captures saved
   with a 90-degree wizard error and the 4×4 capture that did not reassemble.
4. **Stub the camera in Playwright.** Cover capture, canvas crop, saved photo,
   and re-detection together; the existing upload tests do not exercise a
   live camera.

## Later

- Add interactive layer turns and scramble animation to the 3D viewer so a
  user can inspect individual moves and the resulting state.
- Round the three-way outer corner apex on 3D pieces after the layer-turn
  model is settled; keep the cap subtle enough to preserve sticker shapes.
- **#4 Learn color centroids from confirmed fixtures.** Wait until the corpus
  spans more cubes and lighting conditions, then compare before/after on all
  fixtures.
- **#6 Evaluate a small learned classifier.** Only revisit when the corpus
  contains tens of diverse real captures; a smaller set would overfit.
- Continue splitting `src/client/index.tsx`: the fixture preview and its
  upload/download lifecycle now have a component and hook; extract the photo
  upload review and capture flows in further tested moves.
- Add a production-build Playwright test for localhost upload and CORS.
- Configure Vitest to flag slow tests before GitHub's 5-second timeout.
- Remove Git LFS download from Pages once its build is confirmed independent
  of fixture photos.

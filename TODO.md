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
- **#11 Browser capture and upload coverage:** Playwright checks six-photo
  uploads with and without metadata in `e2e/upload.spec.ts`. A canvas-backed
  camera stream in `e2e/camera.spec.ts` checks capture, re-detection, all six
  saved faces, and the cropped review photo.
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
- **Lazy-load 3D viewer and Profiles page:** split `CubeView3D` and `ProfilesPage`
  via `lazy()` and `<Suspense>`, reducing initial scanner bundle from 254.5 kB
  to 202.9 kB (gzip: 88.9 kB to 74.0 kB, -51.6 kB / -14.9 kB gzip).
- **#13 Speed up real-capture benchmark:** cached ground truth OKLCH extraction
  and removed subarray slicing allocations in `test/gridAlignmentRealCrops.test.ts`,
  reducing benchmark test time from ~48 s to ~31 s (~35% faster).
- **Interactive layer turns and scramble animation in 3D:** added layer turn
  simulation (`applyCubeMove`), smooth 60fps layer rotation animation in WebGL
  geometry, `U/D/L/R/F/B` clockwise and counter-clockwise controls, size-aware
  scramble, move history, Undo, and Reset.
- **Three-way outer corner spherical caps in 3D:** refined corner cubie outer
  chamfer geometry where 3 outer edges meet at the apex with spherical radius
  $R = r / \sqrt{2}$ matching 45° bevels and unit normals.
- **Mid-turn 3D visual checks:** Playwright snapshots compare exposed 2×2 and
  5×5 layer cuts while a turn is in progress.

## Next

- Continue splitting `src/client/index.tsx`: the fixture preview and its
  upload/download lifecycle now have a component and hook; extract the photo
  upload review and capture flows in further tested moves.

## Later
- **#4 Learn color centroids from confirmed fixtures.** Wait until the corpus
  spans more cubes and lighting conditions, then compare before/after on all
  fixtures.
- **#6 Evaluate a small learned classifier.** Only revisit when the corpus
  contains tens of diverse real captures; a smaller set would overfit.
- Add a production-build Playwright test for localhost upload and CORS.
- Configure Vitest to flag slow tests before GitHub's 5-second timeout.
- Remove Git LFS download from Pages once its build is confirmed independent
  of fixture photos.

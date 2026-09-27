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

## Next

1. **#5 Distinguish vivid and muted palettes.** Red/orange confusion remains a
   likely error source. Compare proposed anchors against the checked-in
   fixtures before changing classification.
2. **#10 Detect slipped grid rows.** When the outer grid lines miss the face
   edge, ask the user to re-center instead of accepting a shifted row.
3. **#7 Replay missed live faces.** Four saved 2026-09-25 frames (three
   `no-grid`, one `no-sticker-pattern`) reproduce the live decision. Use them
   to test a focused detector fix.
4. **#8–9 Resolve old assembly fixtures.** Recheck the two captures saved
   with a 90-degree wizard error and the 4×4 capture that did not reassemble.
5. **Stub the camera in Playwright.** Cover capture, canvas crop, saved photo,
   and re-detection together; the existing upload tests do not exercise a
   live camera.

## Later

- **#13 Speed up the local real-capture benchmark.** It can add about 35 s to
  `npm test`; measure the slow cases before changing its scope.
- **#4 Learn color centroids from confirmed fixtures.** Wait until the corpus
  spans more cubes and lighting conditions, then compare before/after on all
  fixtures.
- **#6 Evaluate a small learned classifier.** Only revisit when the corpus
  contains tens of diverse real captures; a smaller set would overfit.
- Split the large `src/client/index.tsx` upload, fixture, and capture flows
  into separate components and hooks, one tested move at a time.
- Load the 3D viewer and Profiles page only when opened; measure the main
  bundle size before and after.
- Add a production-build Playwright test for localhost upload and CORS.
- Configure Vitest to flag slow tests before GitHub's 5-second timeout.
- Remove Git LFS download from Pages once its build is confirmed independent
  of fixture photos.

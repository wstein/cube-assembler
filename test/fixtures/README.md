# Regression fixtures

Real captures and software-rendered cubes, saved with their images plus the
color grid after any manual corrections, become regression checks via
`test/fixtures.test.ts`. A misclassification a human caught once stays
caught, instead of only living in a bug report.

## Adding a fixture

In the app, capture and review a cube as normal, correcting any wrong
stickers via the review wizard's "tap a sticker to fix" flow. Once you've
confirmed the cube, use **Save as test fixture**. Download `<name>.zip` and
unzip it into `test/fixtures/`, or run `npm run fixture:server` alongside
`npm run dev` and choose **Upload to localhost** in the preview. The button
enables only while the upload server responds to `GET /ping`. Both paths create
`test/fixtures/<name>/` with the six cropped photos and corrected color grid.
New ZIPs and upload-server folders default to
`cube-<size>x<size>-YYYY-MM-DDTHH-MM-SS` using whole UTC seconds. Existing
`capture-*` folders remain loadable.
**Upload files** loads that ZIP or folder back into the app when `meta.json`
is present. With only six images selected, it opens the photo-order preview:

```
test/fixtures/<name>/
  meta.json       { gridSize, colorsURFDLB, detectedURFDLB, faces: { u: { photo, ... }, ... }, capture }
  face-u.jpg       (etc. for r, f, d, l, b)
```

The optional server listens on `127.0.0.1:7100` and accepts one multipart
`POST /upload` with a `name` field and seven `file` parts (one `meta.json`
and six face photos). It requires `X-Fixture-Upload: 1`, rejects duplicates,
and has no download route. `GET /ping` returns an empty 204 response without
serving files. The Vite dev server proxies the browser's upload
to it; the production site has no local-save button or upload server.

`colorsURFDLB` holds the human-verified colors of all 6 faces as one line,
in U R F D L B order with each face row-major as photographed (the app's
WRG facelets notation), e.g.
`"GRRYOYWYW WYWROGORB GRRYOYWYW YWYBROGWR GBGBGBOBO BGRGBOBWO"`.
`detectedURFDLB` is the same for what detection produced before any hand
correction. Despite the name, the six blocks are the capture slots in the
order the photos were taken, not the cube's U/R/F/D/L/B faces.

Captures made with the guided camera flow (4 sides turning one way, then
top and bottom) also record `capture.protocol` and `capture.assembledURFDLB`,
the cube the customer approved; `fixtures.test.ts` then additionally puts
the photos together with the guided search and checks it finds that cube.

`capture` is informational context about how the shots were taken - camera
label/resolution, the white balance mode and gains that were applied, the
estimated light source (Auto mode), and whether the post-capture global
recalibration kicked in. Not used by `fixtures.test.ts` (the regression
check only compares `colors`), but useful when a fixture's expected colors
need to be debugged later.

`capture.colorProfile` records the single profile resolved for the complete
capture: its name, whether Colors was Automatic or manually selected, its
six RGB values, and any saved-profile color fit score. Automatic previews
compare the live face with built-in and saved profiles, then recheck after
each captured face; the six-face result is resolved separately.
`capture.colorCalibration.learnedColors` records the separate
palette learned from all six photos and used to classify them together.
`capture.colorReference` records the saved or manual palette used as a
classification reference; it is absent or null when Automatic used only the
capture's own colors. Older fixtures without this field replay as before.

The fixture dialog creates a ZIP with `<name>/meta.json` and six face photos.
Camera captures default to a `cube-NxN-YYYY-MM-DDTHH-MM-SS` name in whole UTC
seconds. Software-rendered fixtures use `synt-` names and the `synthetic` and
`software-rendered` tags. The local server logs ping and upload status with
elapsed time, plus the saved fixture name for successful uploads; it does not
log photo or metadata contents. The button stays disabled until `GET /ping`
responds and rechecks while the dialog is open. Production has no upload
server.

Commit the new directory after reviewing its photos and metadata. JPEGs are
stored with Git LFS, so run `git lfs pull` if a checkout contains pointer
files instead of images.

## Running the checks

```
npx vitest run test/fixtures.test.ts
```

The committed `cube-*` directories, including a 7×7 capture, run in CI and
locally. Image checks skip only when a checkout has no real captures.
`bun test test/gridAlignmentRealCrops.test.ts` takes about 30 seconds locally
with the current corpus. Its seven cases have separate 60-second timeouts so
the complete benchmark can also finish on slower CI runners.

Reproduces the app's actual `runGlobalWhiteBalance` flow: extracts each
face with neutral gains, pools every sticker across all 6 faces, runs
`learnStickerColors` once, and compares the result against each fixture's
`meta.json`. With zero fixtures saved, this reports "no fixtures saved yet"
rather than failing - fixtures are opt-in, not required.

## Tagging and known-hard fixtures

As the corpus grows, two optional `meta.json` fields keep the suite
readable and honest instead of it turning into a flat, noisy pass/fail list
(hand-edit `meta.json` to add either):

- **`"tags": ["pastel", "office-lighting"]`** - free-text labels you add by
  hand. Combined with tags auto-derived from `capture` (camera label, cube
  profile, white balance mode, light source), they're appended to the test's title, e.g.
  `"my-cube" [light:Fluorescent (green cast), pastel]`. Tag software-rendered
  fixtures as `synthetic` and `software-rendered`, as in
  `synt-6x6-2026-09-27T17-01-48-164Z`, so they stay distinct from camera
  captures. That's enough for a pattern across failures (e.g. "every failure
  mentions Fluorescent") to be
  visible straight from `npm test` output - no separate report to run.
- **`"expectedFail": { "reason": "..." }`** - marks a fixture as a known,
  not-yet-fixed limitation (e.g. a genuine palette-geometry case with no
  close neighbor color) instead of a regression to guard against. The test
  runs via Vitest's `it.fails`: it must keep failing for the stated reason,
  and the moment it starts passing (someone actually fixes it), `it.fails`
  itself reports a failure ("expected test to fail but it passed") -
  forcing a human to notice and remove the flag, rather than the fix going
  unnoticed and the fixture just quietly turning green.

## `synthetic-sanity-check/`

Not a real capture - 6 solid-color JPEGs (one per canonical WCA color),
generated to exercise the fixture-loading and comparison machinery itself
(JPEG decode → extraction → clustering → comparison) even before any real
fixture has been added. Kept as a baseline; real fixtures from actual
captures are what make this suite valuable for catching real regressions.

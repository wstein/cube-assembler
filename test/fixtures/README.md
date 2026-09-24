# Regression fixtures

Real captures, saved with their actual photos plus the color grid after any
manual corrections - each one becomes a permanent regression check via
`test/fixtures.test.ts`. A misclassification a human caught once stays
caught, instead of only living in a bug report.

## Adding a fixture

In the app, capture and review a cube as normal, correcting any wrong
stickers via the review wizard's "tap a sticker to fix" flow. Once you've
confirmed the cube, use **Send to server** to save that capture - the app
POSTs each face's cropped photo plus its (corrected) color grid to
`POST /api/fixtures`, which writes a new `test/fixtures/<name>/` directory:

```
test/fixtures/<name>/
  meta.json       { gridSize, colorsURFDLB, detectedURFDLB, faces: { u: { photo, ... }, ... }, capture }
  face-u.jpg       (etc. for r, f, d, l, b)
```

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

Commit the new directory - these are small (cropped-region) JPEGs, meant to
be checked in like any other test fixture.

## Running the checks

```
npx vitest run test/fixtures.test.ts
```

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
  `"my-cube" [light:Fluorescent (green cast), pastel]`. That's enough for a
  pattern across failures (e.g. "every failure mentions Fluorescent") to be
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

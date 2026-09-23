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
  meta.json       { gridSize, faces: { u: { colors, photo }, r: {...}, ... } }
  face-u.jpg       (etc. for r, f, d, l, b)
```

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

## `synthetic-sanity-check/`

Not a real capture - 6 solid-color JPEGs (one per canonical WCA color),
generated to exercise the fixture-loading and comparison machinery itself
(JPEG decode → extraction → clustering → comparison) even before any real
fixture has been added. Kept as a baseline; real fixtures from actual
captures are what make this suite valuable for catching real regressions.

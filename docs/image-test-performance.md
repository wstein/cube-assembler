# Image-processing test performance

This follow-up to PR #30 removes measured duplicate test work. It changes no
production renderer, test inputs, correlation thresholds, expected failures or
skips. The shared caches are test-local, not a production cache.

## Reproduce

Use Node 24.19.0 and the locked Vitest 5.0.5 dependencies. The source-equivalent
baseline is `29c167163f72c52f5f97f8875a4d1f4b48eda5ff`; the optimized source is
`1c4c2d8cf5cd1b310f01f0b1ffd3d751fc68ab94`. Measurements were taken before moving
the two unpublished commits onto the newly merged PR #30; complete Git tree
comparison confirmed identical source after that history-only move.

```sh
npm ci
npm run rescript:build
npx vitest run test/syntheticFaceReal.test.ts test/syntheticFixture.test.ts --maxWorkers=1 --reporter=default --reporter=json --outputFile=/tmp/image-tests.json
```

Run the same command on each source revision, one process at a time. The JSON
contains individual assertion durations. The selected tests generate their own
images; the full photo regression suite additionally needs materialized Git LFS
fixtures (`git lfs install --local`, then `git lfs pull`).

## Observations

These are local observations, not a guaranteed CI latency or confidence interval.
Both serial runs passed all 22 tests with the same unique inputs. CI uses Node 22;
its shared-runner load differs from this local environment.

| Measurement                               |  Baseline | Optimized |
| ----------------------------------------- | --------: | --------: |
| Selected two-file wall time               |   42.03 s |   28.91 s |
| Fixture file                              |   31.49 s |   21.78 s |
| Real-preset file                          |    8.77 s |    6.24 s |
| Separate instrumented wall time           |   38.76 s |   28.78 s |
| Real-preset render calls / unique inputs  | 904 / 704 | 704 / 704 |
| Fixture render calls / unique inputs      |   90 / 38 |   72 / 38 |
| Fixture JPEG calls / unique inputs        |   90 / 38 |   72 / 38 |
| Full suite wall time, default parallelism |  108.91 s |  109.00 s |

The selected files improved by about 31%, but **no full-suite wall-time improvement
was measured**. Other end-to-end image-pipeline tests remain on the critical path.
Do not extrapolate the selected-file reduction to the whole CI job.

Scratch-only spies around the real renderer and JPEG encoder measured fixture
rendering at 21.83 s versus 3.93 s for encoding before optimization. Repeated
inputs accounted for 12.00 s rendering and 1.98 s encoding. Some duplicates are
required independent reconstruction oracles, so not all are removed. Instrument
keys include full render arguments or JPEG dimensions, quality and RGBA SHA-256;
all unique key sets were preserved. Instrumentation timings are separate from
the uninstrumented table above. Runner logs attribute 97–98% to tests and about
1% each to transform/import; no expensive explicit setup/cleanup hook was found.

## Changes and coverage boundaries

- [Statistical tests](../test/syntheticFaceReal.test.ts): four immutable color
  sample sets replace nine equivalent calculations. All 40 seeds, 7×7 grids,
  168px images and numeric thresholds remain. Vectors and their records are
  frozen; consumers accept read-only arrays.
- [Fixture tests](../test/syntheticFixture.test.ts): only four read-only metadata
  checks reuse one fixed default fixture. Every caller gets a `structuredClone`,
  including independent mutable byte buffers. Variable inputs, invalid states,
  the actual color-reading pipeline and reconstruction tests still use fresh
  builds. No general-purpose or cross-file cache is added.
- Each existing clean/bad-camera/real byte-for-byte reproduction test retains
  twelve real renders and twelve real JPEG encodes. Their ordered input keys
  and all RGBA pixel hashes match baseline. The reproduction oracle is not
  replaced by retrieval of its original encoded image.
- The metadata case has a narrowly documented 15 s budget: isolated execution
  still builds twelve 600px JPEGs. Its original 5 s limit failed locally and in
  CI without an assertion mismatch. No global timeout is increased.

Cache lifetime is bounded to the test module/describe: four sets of three
1960-element numeric vectors (nominal 188,160 bytes of numeric payload, excluding
JavaScript overhead) and one completed six-photo fixture. Raw RGBA frames are
not retained. Compressed cache size, GC behavior and RSS were not measured.

The full suite passed 80 files / 1141 tests with six expected failures and two
existing skips. Shuffled selected tests also passed with seed 23030, checking
that lazy caches do not depend on the default execution order. Fresh CI remains
required; see the follow-up PR checks for its final result.

## Individual test durations

Same single-worker uninstrumented runs, milliseconds rounded to the nearest unit.

| Test                                                                                                                                     | Baseline ms | Optimized ms |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ----------: | -----------: |
| the real preset is listed, and is scatter, tone, shading and face shift together                                                         |         433 |          151 |
| the real preset turns each part off on its own                                                                                           |         153 |          110 |
| shading: the light falls on the face from one side is off unless asked for                                                               |         134 |          115 |
| shading: the light falls on the face from one side is a plane, as steep as in the saved captures (8 percent per width)                   |        1044 |         1633 |
| shading: the light falls on the face from one side points a different way for another seed                                               |           7 |            8 |
| tone: brightness goes with hue and chroma as in the saved captures is off unless asked for                                               |         146 |          143 |
| tone: brightness goes with hue and chroma as in the saved captures spreads the brightness of a color by a few percent, blue the most     |        2018 |         2050 |
| tone: brightness goes with hue and chroma as in the saved captures makes brighter reds, greens and blues more saturated                  |        2153 |          849 |
| tone: brightness goes with hue and chroma as in the saved captures turns the hue with the brightness, the way each color does            |        1955 |          275 |
| face shift: each photo of a cube is lit a little differently is off unless asked for                                                     |         110 |          105 |
| face shift: each photo of a cube is lit a little differently moves blue by 8 percent of its brightness between photos, orange not at all |         606 |          800 |
| synthetic fixtures writes a fingerprint into every photo that says how it was made                                                       |        4557 |         2461 |
| synthetic fixtures is named and tagged synthetic, so people and tools both see it                                                        |        1775 |         1284 |
| synthetic fixtures validates against the published fixture schema                                                                        |        1893 |           65 |
| synthetic fixtures holds the cube's colors, and the app reads its photos back as them                                                    |        2167 |         1928 |
| synthetic fixtures names the lighting preset in the tags and the summary                                                                 |        1488 |         1312 |
| synthetic fixtures records an invalid state as such instead of refusing it                                                               |        1417 |         1172 |
| synthetic fixtures marks a valid state as valid, without the invalid tag                                                                 |        1523 |            1 |
| synthetic fixtures can be rendered again from its metadata names the size, the seed of every face and the options                        |        3215 |         1635 |
| synthetic fixtures can be rendered again from its metadata renders the clean photos byte for byte                                        |        2477 |         2232 |
| synthetic fixtures can be rendered again from its metadata renders the bad-camera photos byte for byte                                   |        6113 |         4954 |
| synthetic fixtures can be rendered again from its metadata renders the real photos byte for byte                                         |        4859 |         4729 |

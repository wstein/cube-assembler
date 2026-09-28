# Repository Guidelines

## Project Structure & Module Organization

`src/cube/` contains pure cube assembly, geometry, parity, and orientation logic; `src/cube/notation/` contains facelet and Orbit64 codecs. Their dedicated tests live under `test/cube/`. `src/client/` contains the Preact scanner, capture flow, color processing, and UI. The Detect face pipeline is in `gridAlignment.ts`; `imageProcessing.ts` classifies sticker colors. The live preview's per-frame analysis runs in a worker (`liveAnalysis.ts`, `liveAnalysis.worker.ts`). Fixtures are saved and loaded as zip files in `fixtureZip.ts`. `index.tsx` wires App together from hooks: `useCaptureSession.ts` (captured faces, turn cue, warnings), `useCaptureCalibration.ts` (six-face calibration results), `useProfileStore.ts` and `useOrientationReview.ts`; the capture flow's pure decisions live in `captureFlow.ts` and fixture building in `captureFixture.ts`, both unit-tested. Production runs in the browser. `scripts/fixtureUploadServer.mjs` is an optional localhost-only dev tool. Styles live in `web/style.css`, static assets in `public/`, and Vitest tests in `test/`. Saved capture photos and metadata live in `test/fixtures/`.

Cube geometry and sticker colors are independent settings: `profileSettings.ts` defines them, `profileStorage.ts` stores and exports them, and `colorProfileLearning.ts` gates updates after a reviewed capture. Each size has one read-only Generic cube with a 60% sticker core. The eight color palettes in `cube-assembler-profiles.json` are read-only built-ins; Automatic compares them with saved profiles. The profiles page (`#profiles`, `profilesPage.tsx`; the old `#colors` link opens it too) has a Colors tab (`colorReviewPage.tsx`) that compares and merges color profiles and a Cubes tab (`cubeReviewPage.tsx`, logic in `cubeProfileReview.ts`) that merges duplicate cubes; both tabs delete saved profiles singly or in bulk through `profileDeletion.tsx`; `colorProfileReview.ts` balances each profile on its own White before grouping, because captures are already white balanced. Store current data under `cube-assembler-profiles-v1`; ignore other storage keys.
`preferences.ts` keeps cube size, selected color profile ID, capture toggles, 2D/3D display choices, and the 3D view's hold times in cookies; the settings page (`#settings`, `settingsPage.tsx`) edits the hold times; custom profile definitions remain in browser storage.
Reader guides live in `docs/`; use `CONTRIBUTING.md` for setup and deployment, and `test/fixtures/README.md` for saved-capture instructions.

## Build, Test, and Development Commands

- `npm install` installs dependencies.
- `npm run dev` builds ReScript, then runs its watcher alongside Vite.
- `npm run fixture:server` starts the optional localhost-only fixture upload server for the **Upload to localhost** action in the dev UI and the published app.
- `npm run build` builds ReScript before the Vite client.
- `npm run typecheck` builds ReScript before checking strict TypeScript without emitting files.
- `npm test` builds ReScript before running Vitest once; `npm run test:watch` reruns tests during edits.
- `npm run test:e2e` runs the Playwright upload flow in Chromium; install its browser once with `npx playwright install chromium`.
- `npm run lint` runs type-aware typescript-eslint, selected Biome checks, and ReScript compiler warnings as errors.
- `npm run format:check` checks Biome and ReScript formatting; `npm run format` applies it.

## Coding Style & Naming Conventions

Use two-space indentation, single quotes, and semicolons only when needed in TypeScript and TSX. Biome enforces formatting, explicit button types, and basic CSS correctness; `eslint.config.mjs` applies type-aware typescript-eslint rules. Logic is written in ReScript: the cube domain in `src/cube/` and plain data-in, data-out capture, color, profile and view logic in `src/core/` (`app`, `capture`, `color`, `profiles`, `view`, and `vision` for the pixel pipelines on raw RGBA arrays: perspective, grid alignment, face sampling and detection, live frame analysis). Expose its public API through `.resi` and `@genType`; TypeScript reaches it through a thin typed adapter that keeps the module's existing path and exports (for example `src/cube/cubeGeometry.ts` or `src/client/netPresentation.ts`), so callers and tests import the same paths. Adapters re-export the generated functions and types directly and wrap only to add default arguments, keep a generic signature, or keep a mutable TypeScript shape. Everything that touches the browser stays TypeScript: Preact components and hooks, the DOM and canvases, WebGL, audio, the camera, workers, cookies, storage, zip and network I/O. Pixel loops use the unchecked typed-array accessors in `src/core/vision/Pixels.res`; when porting numeric code, keep the original's float operation order so results stay identical. `src/client` may import `src/core` and `src/cube`; they never import `src/client`. The generated `.res.mjs` and `.gen.tsx` files are ignored and rebuilt before TypeScript, Vite, and Vitest; do not edit or commit them. Name tests `<feature>.test.ts`. Keep geometry, color classification, capture state, and UI presentation in their existing modules rather than mixing them into components.

## Testing Guidelines

Use test-driven development for behavior changes: write a focused failing test, implement the smallest fix, then refactor with the test passing. Use synthetic cases for edge conditions and saved photos for regressions. Relevant suites include `test/gridAlignment.test.ts`, `test/gridAlignmentRealCrops.test.ts`, `test/liveAnalysis.test.ts`, and `test/autoCapture.test.ts`. Browser upload tests live in `e2e/upload.spec.ts`. Run a targeted suite, for example `npx vitest run test/gridAlignment.test.ts`, then `npm test`; run `npm run test:e2e` for upload UI changes. Include no-cube scenes when changing live face detection. Follow `test/fixtures/README.md` before adding capture images.

## Commit & Pull Request Guidelines

Make multiple atomic, focused commits when a task has distinct changes; keep each commit independently reviewable and avoid mixing unrelated work. Follow Conventional Commit messages such as `feat(capture): ...`, `fix(capture): ...`, and `docs(capture): ...`. In pull requests, explain the user-visible change, link an issue when applicable, list test results, and attach before-and-after screenshots for scanner or UI changes.

## Scanner Modes

Detect face is the default: it searches for sticker seams near the camera guide, aligns the grid for the selected cube size, then reads colors. Guide grid samples the fixed on-screen square when selected manually. Cube size is chosen from the Cube list; changing it after capturing faces asks before clearing them. Both modes use the same color classifier and require no downloaded model. Keep behavior and tests for both modes explicit when changing capture code.

The live analysis effect clears auto-capture progress when its settings change. Keep selected cube sampling and palette references stable across frame-driven renders; a new object each render prevents the auto-capture frame threshold (5 by default, set on the settings page) from being reached.

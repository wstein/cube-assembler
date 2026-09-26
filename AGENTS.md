# Repository Guidelines

## Project Structure & Module Organization

`src/client/` contains the Preact scanner, capture flow, color processing, and cube assembly UI. The Detect face pipeline is in `gridAlignment.ts`; `imageProcessing.ts` classifies sticker colors. The live preview's per-frame analysis runs in a worker (`liveAnalysis.ts`, `liveAnalysis.worker.ts`). The parity check is in `parity.ts`; fixtures are saved and loaded as zip files in `fixtureZip.ts`. Production runs in the browser. `scripts/fixtureUploadServer.mjs` is an optional localhost-only dev tool. Styles live in `web/style.css`, static assets in `public/`, and Vitest tests in `test/`. Saved capture photos and metadata live in `test/fixtures/`.

Cube geometry and sticker colors are independent settings: `profileSettings.ts` defines them, `profileStorage.ts` migrates old combined settings, and `colorProfileLearning.ts` gates updates after a reviewed capture. Each size has one read-only Generic cube with a 60% sticker core. Automatic colors matches saved profiles only with a clear margin; Generic colors remain read-only. The `#colors` page (`colorReviewPage.tsx`) compares and merges color profiles; `colorProfileReview.ts` balances each profile on its own White before grouping, because captures are already white balanced. Preserve the old localStorage key during migration.

## Build, Test, and Development Commands

- `npm install` installs dependencies.
- `npm run dev` starts the Vite dev server.
- `npm run fixture:server` starts the optional localhost-only fixture upload server for the dev UI's **Upload to localhost** action.
- `npm run build` builds the client with Vite.
- `npm test` runs Vitest once; `npm run test:watch` reruns tests during edits.

## Coding Style & Naming Conventions

Use two-space indentation and follow the surrounding file's quote and semicolon style. TypeScript and TSX generally use single quotes without semicolons. Name tests `<feature>.test.ts`. Keep geometry, color classification, capture state, and UI presentation in their existing modules rather than mixing them into components. There is no project-wide formatter.

## Testing Guidelines

Use test-driven development for behavior changes: write a focused failing test, implement the smallest fix, then refactor with the test passing. Use synthetic cases for edge conditions and saved photos for regressions. Relevant suites include `test/gridAlignment.test.ts`, `test/gridAlignmentRealCrops.test.ts`, `test/gridSizeDetection.test.ts`, and `test/autoCapture.test.ts`. Run a targeted suite, for example `npx vitest run test/gridAlignment.test.ts`, then `npm test`. Include no-cube scenes when changing live face detection. Follow `test/fixtures/README.md` before adding capture images.

## Commit & Pull Request Guidelines

Make multiple atomic, focused commits when a task has distinct changes; keep each commit independently reviewable and avoid mixing unrelated work. Follow Conventional Commit messages such as `feat(capture): ...`, `fix(capture): ...`, and `docs(capture): ...`. In pull requests, explain the user-visible change, link an issue when applicable, list test results, and attach before-and-after screenshots for scanner or UI changes.

## Scanner Modes

Detect face is the default: it searches for sticker seams near the camera guide, aligns the grid, then reads colors. Guide grid samples the fixed on-screen square when selected manually. With the cube list on Auto (the default), Detect face estimates the size before the first face (`estimateFaceGridSize`) and takes it only when 8 of 10 frames agree, with Undo; auto capture waits for it, and a size picked from the list is never changed; the estimate must stay silent rather than guess, so keep `test/gridSizeDetection.test.ts` free of wrong sizes. Both modes use the same color classifier and require no downloaded model. Keep behavior and tests for both modes explicit when changing capture code.

The live analysis effect clears auto-capture progress when its settings change. Keep selected cube sampling and palette references stable across frame-driven renders; a new object each render prevents the five-frame capture threshold from being reached.

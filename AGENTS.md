# Repository Guidelines

## Project Structure & Module Organization

`src/client/` contains the Preact scanner, capture flow, color processing, and cube assembly UI. The Detect face pipeline is in `gridAlignment.ts`; `imageProcessing.ts` classifies sticker colors. The live preview's per-frame analysis runs in a worker (`liveAnalysis.ts`, `liveAnalysis.worker.ts`). The parity check is in `parity.ts`; fixtures are saved and loaded as zip files in `fixtureZip.ts`. The app runs entirely in the browser, with no server. Browser styles live in `web/style.css`, static assets in `public/`, and Vitest tests in `test/`. Saved capture photos and metadata live in `test/fixtures/`.

## Build, Test, and Development Commands

- `npm install` installs dependencies.
- `npm run dev` starts the Vite dev server.
- `npm run build` builds the client with Vite.
- `npm test` runs Vitest once; `npm run test:watch` reruns tests during edits.

## Coding Style & Naming Conventions

Use two-space indentation and follow the surrounding file's quote and semicolon style. TypeScript and TSX generally use single quotes without semicolons. Name tests `<feature>.test.ts`. Keep geometry, color classification, capture state, and UI presentation in their existing modules rather than mixing them into components. There is no project-wide formatter.

## Testing Guidelines

Add focused Vitest coverage for scanner, color, and capture-flow changes. Use synthetic cases for edge conditions and saved photos for regressions. Relevant suites include `test/gridAlignment.test.ts`, `test/gridAlignmentRealCrops.test.ts`, `test/gridSizeDetection.test.ts`, and `test/autoCapture.test.ts`. Run a targeted suite, for example `npx vitest run test/gridAlignment.test.ts`, then `npm test`. Include no-cube scenes when changing live face detection. Follow `test/fixtures/README.md` before adding capture images.

## Commit & Pull Request Guidelines

Follow recent Conventional Commit messages such as `feat(capture): ...`, `fix(capture): ...`, and `docs(capture): ...`. Keep commits focused. In pull requests, explain the user-visible change, link an issue when applicable, list test results, and attach before-and-after screenshots for scanner or UI changes.

## Scanner Modes

Detect face is the default: it searches for sticker seams near the camera guide, aligns the grid, then reads colors. Guide grid samples the fixed on-screen square when selected manually. Both modes use the same color classifier and require no downloaded model. Keep behavior and tests for both modes explicit when changing capture code.

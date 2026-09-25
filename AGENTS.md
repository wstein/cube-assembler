# Repository Guidelines

## Project Structure & Module Organization

`src/client/` contains the Preact scanner, image processing, and cube assembly UI. ReScript domain code lives in `src/ir/`, `src/assembler/`, `src/notation/`, and `src/cubingjs/`; the Bun/Hono API and worker are in `server/`. Put browser styles in `web/style.css`, static assets in `public/`, scripts in `scripts/`, and tests in `test/`. `test/fixtures/` holds cropped capture regressions; `test/vision-fixtures/` holds labeled full-frame scenes and their attribution manifest.

## Build, Test, and Development Commands

- `npm install` installs dependencies. Bun 1.3 or newer is required to run the server.
- `npm run dev` starts Vite and the Bun API for local development.
- `npm run build` compiles ReScript and builds the client.
- `npm test` runs Vitest once; `npm run test:watch` reruns tests during edits.
- `npm run bench:vision` evaluates the detector on fixture images. Fetch optional assets with `npm run fixtures:vision:fetch` and `npm run model:vision:fetch`.

## Coding Style & Naming Conventions

Use two-space indentation. Follow each file's quote and semicolon style: client TypeScript and TSX generally use single quotes without semicolons; Bun server files use double quotes with semicolons. Name tests `<feature>.test.ts` and keep geometry and color logic separate from Preact components. `npm run lint` checks ReScript compilation; there is no project-wide formatter.

## Testing Guidelines

Add focused Vitest coverage for geometry, color, and capture-flow changes. Use synthetic cases for edge conditions and real photos in `test/fixtures/` or `test/vision-fixtures/` for regressions. Run the affected test file (for example, `npx vitest run test/faceGeometry.test.ts`) before `npm test`. Include negative scenes when changing face detection.

## Commit & Pull Request Guidelines

Follow the Conventional Commit pattern used in recent history, such as `feat(scanner): ...`, `fix(vision): ...`, and `test(vision): ...`. Keep commits focused. In pull requests, explain the user-visible change, link an issue when applicable, list test results, and attach before-and-after screenshots for UI or detection overlays.

## Models, Fixtures & Licensing

Downloaded ONNX models and external photos are local evaluation assets; keep them out of commits and production builds. Check `test/vision-fixtures/manifest.json` for source and license before adding images. Production scanner builds need a separately licensed model supplied at `/models/cube-detector.onnx` or through `VITE_CUBE_MODEL_URL`.

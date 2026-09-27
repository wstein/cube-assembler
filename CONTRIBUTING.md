# Contributing to CubeAssembler

Thanks for helping! Bug reports, saved captures that the scanner misreads,
and pull requests are all welcome. By taking part you agree to the
[Code of Conduct](CODE_OF_CONDUCT.md).

## Reporting a scanner problem

A misread cube is easiest to fix with the photos that caused it. After
review, use **Save as test fixture** in the app and attach the downloaded
ZIP to a [bug report](https://github.com/wstein/cube-assembler/issues/new/choose).
The ZIP contains the six cropped face photos and the color grid, so only
attach it if you're happy for those photos to become public. See
[`test/fixtures/README.md`](test/fixtures/README.md) for what it holds.

## Development setup

CI uses Node.js 22.

```sh
npm install
npm run dev          # ReScript watcher and Vite dev server
npm test             # Vitest, once
npx vitest run test/gridAlignment.test.ts   # a single suite
npx playwright install chromium             # once for browser tests
npm run test:e2e     # Playwright uploads and preferences
```

For local fixture uploads, start `npm run fixture:server` in another terminal.
It listens only on `127.0.0.1:7100`; the browser's development server proxies
uploads to it. Saved JPEGs use Git LFS, so run `git lfs pull` if a checkout has
pointer files instead of photos. Review the [fixture guide](test/fixtures/README.md)
before adding captures.

Before opening a pull request, run the same checks as CI:

```sh
npm run typecheck
npm run lint
npm run format:check   # npm run format fixes it
npm run build
npm test
```

`npm run typecheck` checks strict TypeScript. Lint combines type-aware
typescript-eslint, Biome checks, and ReScript warnings; `npm run format`
applies Biome and ReScript formatting. There are currently no `.res` files.
The browser suite starts a Vite server on port 4174 and uses Chromium.

## GitHub Pages

The `Publish Pages` workflow builds the static client with the repository
subpath as its asset base and deploys `dist/` after a push to `main`. The `CI`
workflow builds and tests pushes and pull requests. In repository settings,
Pages must use **Build and deployment → GitHub Actions**. Preview the static
build locally with:

```sh
VITE_BASE_PATH=/cube-assembler/ npm run build
npx vite preview
```

## How changes are made

- **Test first.** For a behavior change, write a focused failing test, make
  the smallest fix, then refactor with the test passing. Use synthetic cases
  for edge conditions and saved photos for regressions.
- **Both scanner modes.** Keep Detect face and Guide grid behavior and tests
  explicit when changing capture code, and include no-cube scenes when
  changing live face detection.
- **Keep modules separate.** Geometry, color classification, capture state,
  and UI presentation stay in their existing modules rather than inside
  components. [`AGENTS.md`](AGENTS.md) describes where things live.
- **Style.** Two-space indentation, single quotes, and semicolons only where
  needed. Biome and typescript-eslint enforce the rest.

## Commits and pull requests

- Make small, atomic commits with
  [Conventional Commit](https://www.conventionalcommits.org/) messages, such
  as `fix(capture): ...`, `feat(colors): ...`, or `docs(readme): ...`.
- In the pull request, explain the user-visible change, link the issue if
  there is one, and list the test results.
- Attach before-and-after screenshots for scanner or UI changes.

Contributions are released under the project's [MIT License](LICENSE).

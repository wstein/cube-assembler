# CubeAssembler

Scan a physical 2×2–7×7 puzzle cube from six photos and assemble its state in
your browser.

[Open the scanner](https://wstein.github.io/cube-assembler/) ·
[View the source](https://github.com/wstein/cube-assembler)

[![CI](https://github.com/wstein/cube-assembler/actions/workflows/ci.yml/badge.svg)](https://github.com/wstein/cube-assembler/actions/workflows/ci.yml)
[![Pages](https://github.com/wstein/cube-assembler/actions/workflows/pages.yml/badge.svg)](https://github.com/wstein/cube-assembler/actions/workflows/pages.yml)
![TypeScript: strict](https://img.shields.io/badge/TypeScript-strict-blue)
![License: MIT](https://img.shields.io/badge/License-MIT-cyan.svg)

CubeAssembler figures out which photo belongs to each face and how that face
was rotated. Guided capture narrows the possibilities to 64 arrangements; the
app checks corners, edges, and parity, then asks you when more than one
arrangement fits. Capture, review, and assembly run locally in the browser,
with no model download or production server.

## Scan a cube in five steps

1. **Choose a cube and colors.** Select a size from 2×2 to 7×7. Automatic
   colors compares the live face with built-in and saved palettes, or you can
   choose a palette yourself.
2. **Capture six faces.** Show four sides while turning the cube, then its top
   and bottom. Detect face finds and straightens the grid; Guide grid reads
   the square on screen when you prefer manual framing.
3. **Check the colors.** The app recalibrates all six photos together. Review
   any uncertain stickers against the photos and correct them if needed.
4. **Confirm the assembly.** If several face placements or rotations fit,
   choose each side when prompted.
5. **Use the cube net.** View the assembled cube, copy its facelets or compact
   state token, and save the reviewed photos as a test fixture if useful.

You can also [upload six photos or a saved fixture](docs/user-guide.md#use-photos-or-a-saved-fixture)
without using the camera. A matching face pattern warns you but does not block
capture, since different faces can look identical on even cubes.

## What works

- Camera capture or six uploaded photos, cropped or uncropped.
- Cube sizes 2×2–7×7, with manual color correction when needed.
- Physical-validity checks and an unfolded net plus 3D view.
- WRG/URF facelets and Orbit64 compact state tokens.
- Local, browser-only scanning; an optional development server saves fixtures.

## Run locally

```sh
npm install
npm run dev
npm test
```

The app opens at `http://localhost:5173`. See [Contributing](CONTRIBUTING.md)
for browser tests, lint and formatting, fixture uploads, and Pages deployment.

## Guides

- [User guide](docs/user-guide.md) — capture, review, uploads, the cube net,
  and facelet notation.
- [Cubes and color profiles](docs/color-profiles.md) — Automatic colors,
  learning, merging, and import/export.
- [Scanner and color detection](docs/scanner.md) — alignment, auto capture,
  white balance, and sticker classification.
- [Cube validity and parity](docs/parity.md) — what is checked on each size
  and what a failed check highlights.
- [Architecture](docs/architecture.md) — modules, worker, data flow, storage,
  and test layout.
- [Regression fixtures](test/fixtures/README.md) — save, upload, tag, and
  test real and synthetic captures.
- [Contributing](CONTRIBUTING.md) — development, CI, Pages, Git LFS, and pull
  requests.

## License and trademarks

MIT © 2026 Werner Stein. See [LICENSE](LICENSE). Bundled Space Grotesk and
IBM Plex fonts use the SIL Open Font License 1.1.

Rubik's, Rubik's Cube, GoCube, GAN, QiYi, and other brand names are trademarks
of their respective owners. CubeAssembler is independent and is not
endorsed or sponsored by any puzzle maker.

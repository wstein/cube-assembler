# Capture recovery Core

This private, self-contained npm archive comes from PuzlWerk's ReScript Core.
`capture-core.json` pins its exact source commit and SHA-256; `npm run verify:capture-core`
checks that artifact and the installed source/runtime hashes. No sibling checkout
or registry publication is needed. The archive includes generated TypeScript
bindings, runtime modules, rebuildable ReScript sources, and source provenance.

Core is licensed EUPL-1.2. The included CubeAssembler-derived material retains its
MIT license and attribution. These notices do not relicense the package as MIT.
Production distribution requires the owner's separate license acceptance gate.

# PuzlWerk viewer (spike)

`puzlwerk-viewer-0.1.0-dedf9d00.tgz` is the private `@puzlwerk/viewer` package packed from
wstein/puzlwerk commit `dedf9d00e160094cc92dd910a39821790adc7295` (`npm pack --workspace @puzlwerk/viewer`
after `npm run build`). SHA-256 of the archive:
`357260a86244a8a91134e5981f3bf760b1c14ff6af80b17242625f9b2d8bc571`. `viewer.json` pins it and
`npm run verify:viewer-vendor` checks the archive, the installed package, its `NOTICE` and the bridge. No
registry publication, no gitlink.

The package is AGPL-3.0-or-later (CubeAssembler is AGPL-3.0-or-later too). Its `NOTICE` and the license texts
inside the archive (`LICENSE`, `CUBE_ASSEMBLER_LICENSE.txt`, `THREE_LICENSE.txt`, `CORE_EUPL_LICENSE.txt`) stay
with it. `dist/bridge/core` holds compiled PuzlWerk Core modules under EUPL-1.2; production distribution of that
combination is an owner license gate. Three.js 0.187.0 (MIT) is a dependency of the viewer.

Used only by the spike view selected with `?viewer=puzlwerk` (`src/client/view3d/puzlwerkCubeView.tsx`).

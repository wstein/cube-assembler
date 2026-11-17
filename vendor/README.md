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

`puzlwerk-viewer-0.1.0-aa725fda.tgz` is the private `@puzlwerk/viewer` package packed from
wstein/puzlwerk commit `aa725fda20eea298b7ed0e3ec3dda569c176a6b7` (`npm pack --workspace @puzlwerk/viewer`
after `npm run build`). SHA-256 of the archive:
`a39c5e735fc6162592a7fb3d3c57103255389ce10ef04c4c190ae24a263e72e2`. `viewer.json` pins it and
`npm run verify:viewer-vendor` checks the archive, the installed package, its `NOTICE` and the bridge. No
registry publication, no gitlink.

The package is AGPL-3.0-or-later (CubeAssembler is AGPL-3.0-or-later too). Its `NOTICE` and the license texts
inside the archive (`LICENSE`, `CUBE_ASSEMBLER_LICENSE.txt`, `THREE_LICENSE.txt`, `CORE_EUPL_LICENSE.txt`) stay
with it. `dist/bridge/core` holds compiled PuzlWerk Core modules under EUPL-1.2; production distribution of that
combination is an owner license gate. Three.js 0.187.0 (MIT) is a dependency of the viewer.

Used only by the spike view selected with `?viewer=puzlwerk` (`src/client/view3d/puzlwerkCubeView.tsx`).

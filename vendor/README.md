# Capture recovery Core

This private, self-contained npm archive comes from PuzlWerk's ReScript Core.
`capture-core.json` pins its exact source commit and SHA-256; `npm run verify:capture-core`
checks that artifact and the installed source/runtime hashes. No sibling checkout
or registry publication is needed. The archive includes generated TypeScript
bindings, runtime modules, rebuildable ReScript sources, and source provenance.

Core is licensed `EUPL-1.2 OR AGPL-3.0-or-later` since archive 0.4.0 (the earlier archives 0.1.0
and 0.3.0 were EUPL-1.2 only). The included CubeAssembler-derived material retains its
MIT license and attribution. These notices do not relicense the package as MIT.
Production distribution requires the owner's separate license acceptance gate.

# PuzlWerk viewer (spike)

`puzlwerk-viewer-0.1.0-a3dfe2f0.tgz` is the private `@puzlwerk/viewer` package packed from
wstein/puzlwerk commit `a3dfe2f0449254aaf1b9a653cee9d2c5670ba577` (`npm pack --workspace @puzlwerk/viewer`
after `npm run build`). SHA-256 of the archive:
`035433edee53bef891a8f6f6907007981604165ff433903cfeace2f5c4eedacf`. `viewer.json` pins it and
`npm run verify:viewer-vendor` checks the archive, the installed package, its `NOTICE` and the bridge. No
registry publication, no gitlink.

The package is AGPL-3.0-or-later (CubeAssembler is AGPL-3.0-or-later too). Its `NOTICE` and the license texts
inside the archive (`LICENSE`, `CUBE_ASSEMBLER_LICENSE.txt`, `THREE_LICENSE.txt`, `CORE_EUPL_LICENSE.txt`) stay
with it. `dist/bridge/core` holds compiled PuzlWerk Core modules under EUPL-1.2 OR AGPL-3.0-or-later (owner decision 2026-11-17; this project uses the AGPL choice); production distribution of that
combination is an owner license gate. Three.js 0.187.0 (MIT) is a dependency of the viewer.

Used only by the spike view selected with `?viewer=puzlwerk` (`src/client/view3d/puzlwerkCubeView.tsx`).

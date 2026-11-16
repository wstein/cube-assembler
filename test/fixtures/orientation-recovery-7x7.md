# Patterned 7×7 orientation-recovery regression

`orientation-recovery-7x7.zip` is the original owner-supplied archive
`cube-7x7-2026-11-16T09-42-39.zip`, unchanged.

- SHA-256: `28cbd509939ceaf076292047b938910864f8546113534a31c7f252a04f8ce28e`
- Capture app commit: `8ac10f5` (baseline `8ac10f5ae65f68e56a08bad5bdb738efe0e5bd4f`).
- Six real JPEG photos, 7×7 source grids, `mirrored: true`, guided v1.
- Raw colors are capture slots; `capture.assembledURFDLB` is a separate saved
  outcome and is not an independently verified intended pose.

This archive regression is intentionally kept as the unchanged ZIP rather than
adding duplicate individual JPEG files outside the existing Git LFS workflow.
The browser test imports the archive itself, so the real photos are mandatory
and are not skipped when other LFS fixtures are unavailable. Pure mapping tests
also pin the archive hash and source metadata in `captureFaceMapping7x7.json`.

# Cube validity and parity

After face placement and orientation, [`parity.ts`](../src/cube/parity.ts)
checks whether the observed stickers can describe a physical cube. The cube
net highlights stickers involved in a failed check so they can be compared
with the photos.

## 3×3 checks

For a 3×3, four conditions are necessary and sufficient:

1. Each color appears exactly nine times.
2. Corner orientation sums to zero modulo 3.
3. Edge orientation sums to zero modulo 2.
4. Corner and edge permutation parity agree.

All cube sizes have eight corner cubies, so the corner color-triplet and
orientation checks apply from 2×2 through 7×7. A 2×2 has no edges or centers;
its complete model comes from corner checks alone.

## Larger cubes

On 4×4–7×7, each edge has N−2 wing pieces. Every wing's two colors must be
one of the 12 canonical neighboring color pairs, and each pair must occur
exactly N−2 times. Wings are counted across depths; the validator does not
yet check the distinct depth orbits or generalize full edge permutation parity
to large cubes. This can miss an invalid cross-depth arrangement but cannot
reject a valid scramble for that reason.

Center-block uniformity is not required: even-cube center pieces move
independently, and a scrambled 4×4 or 6×6 can have mixed center colors. Color
balance and the corner/wing counts already determine how many stickers of each
color remain for centers.

The facelet slot tables account for the back face being viewed from outside
the cube, with left and right reversed relative to the front. Wing directions
are derived from explicit 3D coordinates. Tests in
[`parity.test.ts`](../test/cube/parity.test.ts) include real captures that exposed
mistaken back-face mirroring and reversed wing positions.

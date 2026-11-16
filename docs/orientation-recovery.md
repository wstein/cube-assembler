# Reviewing captured face orientations

The correction workflow keeps all six recognized color grids beside the existing
interactive 3D cube. It offers arrangements retained by the existing ReScript
assembly search and validator. Resolved faces are skipped; ambiguous faces get
colored choices in Front → Right → Back → Left → Up → Down order.
Questions refer to canonical displayed faces, not capture-step IDs. It does not expose unrestricted rotation or assignment controls.

The current preview is shown first as **0°**. Other angles are clockwise changes
relative to that displayed face. These labels do not change the absolute source
photo rotations stored in the mapping. A preview is not a user answer: an
ambiguous, unsaved arrangement needs an explicit choice. Choosing a feasible
option atomically saves the draft answer and advances to the next unresolved
canonical face, skipping resolved faces. The dialog is titled **Match your cube**;
it has no Next, Undo, or Reset controls. Existing Back navigation lets an earlier
answer be chosen again.

After the last choice, a separate review offers **Use this cube**. Only that
explicit action commits the assembly; pointer double activation and repeated
keyboard activation cannot answer a following question or commit it. Focus moves
to the next question or review heading, never to the final action.

The viewer uses the canonical logical frame. Camera movement changes only the
view. Positive approval applies the cube actually displayed, without opening a
second correction dialog. Saved source identities and logical mappings are
restored without automatic reranking. Confirming an older capture writes the
canonical display choice while retaining its historical capture-pose metadata.
That history does not imply that an unknown physical pose was newly measured.

## Physical guided captures

New camera captures record one of two v3 conventions:

| Recorded mirror mode | Protocol                           | Source frames in slot order | Inverse photo rotations    |
| -------------------- | ---------------------------------- | --------------------------- | -------------------------- |
| Off                  | `left-front-right-back-up-down/v3` | L, F, R, B, U, D            | 0°, 0°, 0°, 0°, 180°, 180° |
| On                   | `right-back-left-front-up-down/v3` | R, B, L, F, U, D            | 0°, 0°, 0°, 0°, 0°, 0°     |

The live net stays numbered 1–6 in both modes: four source slots in a row,
Up above the second slot and Down below it. These source IDs are not canonical
color-face identities. After all six shots, the assembly uses their recorded
convention and applies one global canonical rotation. Photos and sampled grids
are never mirrored to create a puzzle state. The final canonical review can
therefore place a source photo on a different displayed face.

The accepted mirrored animation and all lateral cues are retained. Only the
unmirrored cap animations reverse their visible pitch. The source transforms
are independently checked with labeled facelets through all five physical
transitions. Six matching protocol, step and mirror observations are required;
a mixed mode, inconsistent flag, missing step or retake does not establish an
exact v3 assembly and cannot silently fall back to a different proposal.

A checked physical sequence supplies one capture-derived assembly and zero
alternatives. A failed seed remains a conflict. The capture mini-net and color
review use that same v3 seed and explicit source mapping, rather than a free
search or color-content photo rematching. Full large-cube reachability remains
unverified by the existing checks.

Acceptance requires unchanged live slot positions in both modes, all five
marked-face transitions, a source-ID/rotation-preserving v3 export/import,
unchanged v1/v2 interpretation, and rejection of mixed mirror observations.
Automated checks cover these contracts; physical-camera/owner acceptance remains
open until exercised with the actual cube.

Historical `sides-then-top-bottom/v2` keeps its original Front, Right, Back,
Left, Down, Up meaning and cap rotations of 270°/90°. Historical v1 remains
ambiguous. Imports and reexports retain these observations; they are never
upgraded to v3 by the current Mirror toggle. The original 2026-11-16 19:08:19
4×4 metadata is stored byte-for-byte as an assembly-only regression (SHA-256
`f76e61` prefix); its declared v2 seed conflicts, while the owner's explicitly
reported Up/Down interpretation passes the available checks. That test neither
changes the recorded protocol nor proves complete reachability or photo color
accuracy.

## Photos and color corrections

Hover, focus, or tap a face to inspect its explicitly linked source photograph.
The **Face · Photo** header uses the displayed face name. The full, rotated image
occupies the nearest unused net cell; changing stickers within one face does not
move it. Narrow layouts can place the inspector below the net. Notes appear
below the net rather than covering faces.

**Correct detected colors** opens the existing editor for that source face only.
The net and 3D stay visible. Color changes remain in the assembly draft until
**Use this cube**. Cancel, closing the matching dialog, or its Escape action
discards the entire unconfirmed transaction, including color edits. If matching
was opened from an approval dialog, its exact candidate, page, and notices are
restored without rerunning search. Otherwise matching simply closes. Escape
inside the nested color editor still closes that innermost editor and returns
focus. Original JPEGs and `detectedColors` remain unchanged.

## Constraints and persistence

Candidates have passed the repository's available checks. Larger NxN checks do
not establish complete reachability. Capped or empty searches remain explicit;
absence from a retained list is not proof that a physical cube is impossible.
When no guided arrangement is retained, review earlier answers and captured
colors. The interface does not silently substitute a free-search arrangement.

`capture.faceRecovery` remains version 1. Source slots, logical faces, absolute
quarter turns, source-photo transforms and historical capture observations remain
separate from display orientation. Older explicit mappings stay importable even
though unrestricted manual editing is no longer part of the interface.

## Regression inputs

- `orientation-recovery-7x7.zip`: original patterned capture from app `8ac10f5`.
- `orientation-recovery-5x5.zip`: byte-preserved owner capture from app `0e2b62f`.
- `cube-5x5-2026-11-16T14-42-31.assembly.json`: exact metadata copy, SHA-256
  `5fdc7b7123c396ae0ea315846b70ec07f42606139334566238d1584a776e5c70`.
  Its two guided arrangements differ in 64 stickers and are not related by a
  whole-cube rotation. The saved mapping identifies one; the export alone does
  not establish the owner's intended physical arrangement.

Unit checks cover all 24 proper display transforms and all six source faces,
including Back and cap rotations. Browser checks cover constrained choices,
canonical approval, source-photo identity, legacy metadata, touch, nested color
editing and export/reimport. Owner physical-cube acceptance remains separate.

## Synthetic 4×4 acceptance captures

Upload `synthetic-4x4-high.zip`, `synthetic-4x4-medium.zip`, or
`synthetic-4x4-unique.zip` using the ordinary fixture-upload control. The JPEGs
are generated sticker grids, not photographs. Their recognized colors and legal
Core move sequences come from `guided-4x4-acceptance.json`.

The legacy, unmeasured capture context retains respectively 3, 1, and 0 other
arrangements (4, 2, and 1 total); these searches were not truncated. “High” is the
largest found in 88 bounded trials with seed 461193, not a proven maximum. These
archives deliberately contain no v2 observation claims or saved approval.

Regenerate the archives with `node scripts/generateGuided4x4Fixtures.mjs`.
ZIP timestamps and image generation are fixed for reproducible bytes. The same
Core arrays, when tested separately under the fully specified physical v2
contract, each produce only their checked seed and zero alternatives.

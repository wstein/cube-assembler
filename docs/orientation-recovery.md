# Correcting captured face orientation and placement

Six correct photographs do not necessarily determine one arrangement. On the
assembly approval screen, **Adjust face orientations / assignments** opens an
editor independently of the number of retained search candidates. **Check the
colors** remains a different action; correction never requires opening a camera.
The same editor can be reopened after closing the approval dialog.

## Spatial candidate workflow

The primary recovery screen keeps six recognized color grids in an unfolded net
beside the existing interactive 3D viewer. The spatial pane stays visible while
candidate choices, validation, and advanced controls scroll separately. Outlines
identify the current face and its four neighbors without replacing sticker colors.
Camera orbit and zoom change the view only.

Candidates start with the first captured front photo, then follow capture-slot
order. Resolved choices are skipped. Choosing a colored grid previews it in both
views; **Next** records that answer. **Back** keeps the draft and exposes the
earlier alternatives using prefix constraints. Changing an earlier answer retains
compatible later answers and reports incompatible ones that need another answer.

Hover, keyboard focus, or tap on a net face opens its explicitly linked source
photo. **Correct detected colors** opens the existing color editor for that source
photo only. Returning preserves the other five faces, mapping, pose, and answers.
These color corrections remain part of the assembly draft: outer **Cancel changes**
discards them; outer **Confirm face mapping** applies them with the mapping.
Closing keeps the draft. The original JPEG and `detectedColors` remain provenance.

**Advanced manual orientation / assignment recovery** contains direct rotations
and assignments when the retained candidates do not include the physical cube.
The candidate set comes from the existing guided or free assembly solver and
existing validation; it is not a new solver. The UI reports capping, equivalence
reduction, inferred identity for symmetric grids, and incomplete large-cube checks.
A retained count is never presented as the number of all possible arrangements.

## Three separate records

- Original photos and detected-color provenance remain unchanged by rotation or assignment. Explicit color correction changes only the selected source photo’s reviewed `colors` grid.
- The editable mapping assigns each source photo to U/R/F/D/L/B with its own
  clockwise quarter-turn count. Edits are not restricted to solver alternatives.
- The assembled logical cube is validated using the repository's existing
  checks. Net and 3D capture views are derived presentations of that state.

Odd 3×3, 5×5, and 7×7 cubes use their fixed center colors for face identity.
Their assignment selectors are locked. Conflicting or unreadable centers produce
an explanation instead of an automatic reassignment. Even cubes allow six
independent assignment selectors. Duplicate targets are allowed while editing,
but confirmation requires a bijection and passing available checks.

In Advanced recovery, use −90°, +90°, or 180° for each photograph. Native buttons and selects work with
keyboard and touch; their names include the source photo, target face, and turn.
Undo reverses one edit. Reset restores the editor's initial draft. Closing or
Escape keeps the draft; **Cancel changes** rolls it back without changing the
current cube. Only **Confirm face mapping** commits an orientation decision.
Invalid drafts can be viewed and corrected, but cannot be confirmed as valid.

## Capture pose is not canonical color orientation

The previous guided protocol permitted either lateral direction, flexible tipping,
and swapped caps. Older captures therefore do not prove one absolute pose.
Choose the original front and top photos and confirm that pair, or explicitly
select the logical frame. By default the confirmed capture view shows Side 1
at the front. Net and 3D use the same display transform; picking and completed
turns return through its exact inverse. Camera actions do not change logical
state or history.

A mirrored camera preview does not mirror the cube. Camera sampling and the
original JPEG use sensor coordinates. Correction applies proper rotations only.
New camera shots record the requested step, displayed arrow, and mirrored
presentation. Retakes record `retake/v1` with no claimed guide arrow. For older
captures, unobserved turn direction, cap order, and per-photo observations stay
unknown until the user supplies confirmation.

## Validation and search limits

The approval screen reports retained candidate count and a capped-search flag.
These are not an exhaustive count of possible arrangements. A manual selection
is not reranked back to an automatic candidate.

Existing checks include color balance, pieces, orientation constraints, wings,
and applicable parity checks. Larger NxN checks do **not** certify complete
physical reachability. The editor, main view, and exported validation metadata
state that limit. Known invalid states remain invalid; uncertain relationships
remain unverified. The guided search also rejects improper odd-center frames
that corner and wing checks alone previously admitted.

Camera capture remains 2×2–7×7. Imported 8×8 fixtures support manual assignment,
rotation, validation, and export/reimport; this does not claim 8×8 camera support.

## Backward-compatible fixture metadata

`colorsURFDLB` and `detectedURFDLB` still describe capture slots. The canonical
current cube remains `capture.assembledURFDLB`. New exports additionally contain
`capture.faceRecovery`:

- `version: 1`, `transformConvention: "cube-geometry-orientations/v1"`.
- Exact source-slot `mapping`: `slot`, logical `target`, and `quarterTurns`.
- `captureFrame`: confirmed front/top, proper display and inverse canonical
  transforms, six source-photo-to-display transformations, mirror/protocol,
  physical direction/cap-order confirmation, and actual guide observations.
- `view`: `capture` or `canonical`.
- `stateRelation`: `capture` or `after-viewer-moves`.

The 24 transform indices are frozen by labeled baseline vectors in
`test/captureFrameConventionV1.json`. Changing that convention requires a new
version or an explicit migration. Unsupported versions, invalid enums, duplicate
assignments, invalid rotations, or inconsistent pose transforms do not silently
replace saved manual choices with solver output. Original photos remain
available for correction, with a warning.

The source mapping always describes the initial captured state. A current state
saved after viewport edits is checked separately and clearly marked as having
an unverified relationship to the photos; it is not a proof of a move sequence.
Reopening the orientation editor explains that confirming reconstructs the
original capture and discards later viewport edits. Cancel preserves that state.

Fixtures without recovery metadata remain importable through the legacy search.
An older saved assembly is evidence of a past outcome, not proof of the owner's
intended pose. `assemblyValidation` reports the scope and result of checks rather
than claiming a new reachability certificate.

## Regression evidence

The unchanged owner archive `test/fixtures/orientation-recovery-7x7.zip` pins
capture app commit `8ac10f5`. Its real patterned photographs are exercised by
browser import, manual rotations, confirmed front/top, exact-photo export, and
reimport. Synthetic cases supplement it for odd 3×3/5×5 and even 2×2/4×4/6×6/8×8,
including duplicate drafts and whole-face reassignment. Unit tests cover all 24
presentation frames and inverse turn mapping. Live owner acceptance remains
separate from automated evidence.

## Manual acceptance checklist

- Import `orientation-recovery-7x7.zip`; reject the suggestion without a camera.
- At desktop and touch widths, inspect all six net grids and the live 3D cube.
- Pick a first-front candidate, use Next and Back, and change the earlier answer.
- Inspect each original with hover/focus/tap; verify photo identity after assignment.
- Correct one face’s detected colors and return; cancel the assembly to discard it.
- Use Advanced rotation/assignment, Undo, Reset, and explicit front/top confirmation.
- Export/reimport a confirmed mapping and verify the exact selected source photos.
- Check invalid drafts and omitted candidates remain recoverable without recapture.

Browser tests supplement this checklist. Owner mouse/touch acceptance is separate.

## Interface comparison

The previous primary recovery screen required scrolling past six raw photos:

![Before: six-photo recovery layout](screenshots/orientation-spatial-before.png)

The spatial workflow keeps the recognized net beside the production 3D viewer:

![After: persistent recognized net and 3D candidate workflow](screenshots/orientation-spatial-after.png)

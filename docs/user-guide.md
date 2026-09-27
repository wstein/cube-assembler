# User guide

[Open CubeAssembler](https://wstein.github.io/cube-assembler/). Scanning, review,
assembly, and ZIP import/export run in the browser. Choose a cube size from 2×2
through 7×7 before taking photos.

## Scan a cube

1. Choose a **Cube** (which sets its size) and **Colors**. Automatic compares
   built-in and saved color profiles as faces arrive; you can also select one.
2. Open the camera and show one face near the dashed guide. **Detect face**
   finds and straightens it. If that fails, choose **Guide grid** to read the
   fixed square on screen. Neither mode downloads a model.
3. Capture four sides while turning the cube, then its top and bottom. Auto
   capture waits for five matching good readings. A matching earlier pattern
   warns you but does not prevent capture: even cubes can have identical faces.
4. Review the six faces. The app recalibrates colors across all six photos.
   **Edit colors** lets you compare each detected face with its photo and fix a
   sticker. If the assembled state is valid and every reading is confident,
   the app can take you straight to assembly approval.
5. Approve the proposed cube. If several arrangements fit, **Choose each
   side** asks which face belongs where. The unfolded net shows U above the
   L–F–R–B row and D below it; the 3D viewer shows the same state.

The first two adjacent odd-cube faces keep their photographed slots. If the
second is opposite the first, it goes to slot 3 while slot 2 waits for an
adjacent face. Later odd-cube faces can be placed by their fixed center colors
even when photographed out of order. Even cubes have no fixed center, so they
stay in capture order. The net always shows captured colors, even with Mirror
enabled. Changing size after a capture asks before clearing saved faces.

## Use photos or a saved fixture

**Upload files** accepts six cropped face images or full camera photos, with or
without `meta.json`, either selected together or packed in a ZIP. Without
metadata, it shows an order and framing preview: rearrange the faces and choose
Auto, Cropped face, or Full photo for each image. Files named `face-u.jpg`
through `face-b.jpg` start in capture-slot order. With metadata, it loads the
saved colors as a fixture. The chosen cube size applies to ordinary photos.

After confirming a cube, **Save as test fixture** downloads its six photos and
reviewed colors as a ZIP. Local developers can also send it to the optional
upload-only server. See the [fixture guide](../test/fixtures/README.md).

## Enter or copy facelets

**Type colors** and the notation output panel share a format switch:

- **WRG facelets:** six space-separated blocks of N² color letters (W/O/G/R/B/Y)
  in U R F D L B order. A solved 3×3 starts `WWWWWWWWW RRRRRRRRR`.
- **URF facelets:** the same structure using U/R/F/D/L/B for the face whose
  solved color each sticker matches. A solved 3×3 starts
  `UUUUUUUUU RRRRRRRRR`.

Pasting text usually selects the matching format. Inputs containing only R and
B are ambiguous, so the existing switch is kept. The notation panel can also
copy an [Orbit64.Net](https://github.com/wstein/flix-orbit64/blob/main/FORMAT.md#spaced-facelet-reference-vectors)
compact state token for 2×2–7×7. Paste facelets or a state token into **Type
colors**; move and algorithm tokens are separate formats and are not accepted.

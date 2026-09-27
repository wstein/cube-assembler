# Scanner and color detection

The capture dialog has two modes. **Detect face** estimates the cube outline,
aligns sticker seams, straightens the face, and reads it. It waits with
*Align face in view* if no face is found. **Guide grid** reads the fixed square
on screen. Neither mode needs a downloaded model. Choose the cube size first;
the detector does not change it. Live analysis runs every 200 ms.

## Finding a face

The dashed frame is a 70%-wide placement guide; detection can reach beyond
it. [`gridAlignment.ts`](../src/client/gridAlignment.ts) estimates an outline
before its fine seam search, or searches around the centered guide when an
outline is unclear. The outline scan covers faces 0.7–1.3 times guide size
with centers up to 22% of a guide width away. The seam search stays within
half a cell of that estimate to avoid slipping a row on 5×5–7×7 faces.
For 6×6 and 7×7, an additional outer-edge check rejects seam fits whose
grid lines miss the face. The live view then asks you to move the face toward
the center instead of accepting the shifted reading.

Seam scoring uses each pixel's strongest color channel so red or blue
stickers remain distinguishable from dark plastic. The detector accepts up to
35° of tilt when a grid supports it. It also accounts for the wider outer
cubies measured on large cubes. The live check requires even sticker colors
and an outline in Detect face mode; Guide grid can use a sticker pattern.

[`autoCapture.ts`](../src/client/autoCapture.ts) captures after five matching
readings at 60% confidence or better. Missing or weak frames pause progress;
a changed sticker pattern resets it. A ring shows progress, and an enabled
sound plays a short click on capture. A confirmed face can remain on screen
through two weak frames for display. The turn cue stays until three checks
show a changed, missing, or substantially moved face; Continue also releases
the gate when two sides look identical. A face matching an earlier capture is
warned about but accepted.

## Reading colors

The raw camera frame feeds capture and analysis. Mirroring flips only the CSS
preview. Backdrop white balance excludes a 25% band around the detected face;
after two backdrop readings, preview and capture use a rolling median with the
current frame. The final pass recalibrates all six faces together and enforces
N² stickers of each color. Sticker samples use a trimmed mean that discards
the brightest and darkest 15% of pixels. Color distance is measured in
OKLCH/OKLab rather than raw RGB.

On odd cubes, a wider sample reads the center past a printed logo. After six
captures, cross-face classification assigns the fixed centers one of each
color. Even cubes have no fixed center sticker. Review shows per-color counts,
observed OKLCH ranges, and warnings for overlapping hue ranges; individual
uncertain stickers are flagged for correction.

Regression tests cover off-center and tilted real photos in
[`gridAlignmentRealCrops.test.ts`](../test/gridAlignmentRealCrops.test.ts),
including the 7×7 row-slip case.

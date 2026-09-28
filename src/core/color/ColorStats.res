// Every captured sticker's detected color across all 6 faces, keyed by
// color letter: its count (against the expected per-color total for the
// puzzle size), each color's OKLCH lightness/chroma/hue spread, and which
// other colors' hue ranges it overlaps - the condition behind boundary
// misreads between two colors. Saved as fixture metadata for offline
// analysis; the review flags single stickers from cellLookalikes instead.
open StickerGeometry
open! ColorMath

type capturedFace = {colors: array<array<string>>, cellColors?: array<array<rgb>>}

type colorStat = {
  count: int,
  expected: int,
  lightness: Null.t<linearRange>,
  chroma: Null.t<linearRange>,
  hue: Null.t<hueRange>,
  hueOverlapsWith: array<string>,
}

let computeColorStats = (capturedFaces: Dict.t<capturedFace>, puzzleSize) => {
  let colorOrder = CaptureSteps.colorOrder
  let counts = Dict.fromArray(colorOrder->Array.map(color => (color, 0)))
  let samples = Dict.fromArray(colorOrder->Array.map(color => (color, [])))
  CaptureSteps.faceOrder->Array.forEach(face =>
    switch capturedFaces->Dict.get(face) {
    | Some({colors, ?cellColors}) =>
      colors->Array.forEachWithIndex((row, r) =>
        row->Array.forEachWithIndex(
          (color, c) =>
            switch counts->Dict.get(color) {
            | Some(count) =>
              counts->Dict.set(color, count + 1)
              switch cellColors->Option.flatMap(grid => grid[r])->Option.flatMap(row => row[c]) {
              | Some(rgb) => samples->Dict.getUnsafe(color)->Array.push(rgbToOKLCH(rgb))
              | None => ()
              }
            | None => ()
            },
        )
      )
    | None => ()
    }
  )
  let hueRanges = Dict.fromArray(
    colorOrder->Array.map(color => (
      color,
      hueCircularRange(samples->Dict.getUnsafe(color)->Array.map(o => o.h)),
    )),
  )
  let expected = puzzleSize * puzzleSize
  Dict.fromArray(
    colorOrder->Array.map(color => {
      let colorSamples = samples->Dict.getUnsafe(color)
      let range = hueRanges->Dict.getUnsafe(color)
      (
        color,
        {
          count: counts->Dict.getUnsafe(color),
          expected,
          lightness: linearRange(colorSamples->Array.map(o => o.l)),
          chroma: linearRange(colorSamples->Array.map(o => o.c)),
          hue: range,
          hueOverlapsWith: switch Null.toOption(range) {
          | Some(range) =>
            colorOrder->Array.filter(other =>
              other != color &&
                switch Null.toOption(hueRanges->Dict.getUnsafe(other)) {
                | Some(otherRange) => hueRangesOverlap(range, otherRange)
                | None => false
                }
            )
          | None => []
          },
        },
      )
    }),
  )
}

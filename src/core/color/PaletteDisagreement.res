// Stickers whose color the capture's reference palette reads differently.
// The learned colors can drift onto the wrong stickers while the camera
// stays confident (confidence is measured against the learned colors
// themselves), but the reference palette does not drift with them.
open StickerGeometry

type face = {
  cellColors: array<array<rgb>>,
  colors: array<array<string>>,
  // The palette that read this face while it was captured.
  palette: option<Dict.t<rgb>>,
}

// Saved captures: good ones disagreed on at most 8% of their stickers, a
// capture with a shifted palette on 32%.
let gate = 0.15

let labels = (face: face) =>
  switch face.palette {
  | None => None
  | Some(palette) =>
    Some(
      face.cellColors->Array.mapWithIndex((row, r) =>
        row->Array.mapWithIndex((rgb, c) => {
          let reference = ColorMath.classifySticker(rgb, Some(palette)).color
          reference != face.colors->Array.getUnsafe(r)->Array.getUnsafe(c)
            ? Null.make(reference)
            : Null.null
        })
      ),
    )
  }

// Per face the label the reference palette gives each disagreeing sticker
// (null elsewhere), or undefined for every face unless the disagreement is
// widespread enough to doubt the learned colors.
let suspectLabels = (faces: array<face>) => {
  let all = faces->Array.map(labels)
  let total =
    faces->Array.reduce(0, (sum, face) =>
      sum + Array.length(face.colors) * Array.length(face.colors)
    )
  let disagreeing = all->Array.reduce(0, (sum, face) =>
    switch face {
    | Some(grid) =>
      grid->Array.reduce(sum, (sum, row) =>
        row->Array.reduce(sum, (sum, label) => Null.toOption(label)->Option.isSome ? sum + 1 : sum)
      )
    | None => sum
    }
  )
  total > 0 && Int.toFloat(disagreeing) /. Int.toFloat(total) >= gate
    ? all
    : faces->Array.map(_ => None)
}

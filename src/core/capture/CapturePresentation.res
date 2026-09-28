// Mirror mode presents the face on the far side of the cube. A scrambled
// opposite face cannot be reconstructed sticker by sticker from its
// partner: this uses a captured opposite face, or shows only what its
// colors prove (empty strings for unknown stickers).
let oppositeFacePreview = (
  source: array<array<string>>,
  captured: array<option<array<array<string>>>>,
) => {
  let n = Array.length(source)
  let mid = n / 2
  let flat = source->Array.flat
  let first = flat[0]
  let uniform = Array.length(flat) == n * n && flat->Array.every(color => Some(color) == first)
  let sourceColor =
    mod(n, 2) == 1 ? source[mid]->Option.flatMap(row => row[mid]) : uniform ? first : None
  let unknown = () => Array.fromInitializer(~length=n, _ => Array.make(~length=n, ""))
  switch sourceColor->Option.flatMap(GuidedCaptureSetup.opposite) {
  | None => unknown()
  | Some(opposite) =>
    let matches = (face: array<array<string>>) =>
      face !== source &&
      Array.length(face) == n && (
        mod(n, 2) == 1
          ? face[mid]->Option.flatMap(row => row[mid]) == Some(opposite)
          : face->Array.flat->Array.every(color => color == opposite)
      )
    switch captured->Array.findMap(face => face->Option.filter(matches)) {
    | Some(saved) => saved
    | None =>
      let preview = unknown()
      if uniform {
        preview->Array.map(row => row->Array.map(_ => opposite))
      } else {
        if mod(n, 2) == 1 {
          preview->Array.getUnsafe(mid)->Array.setUnsafe(mid, opposite)
        }
        preview
      }
    }
  }
}

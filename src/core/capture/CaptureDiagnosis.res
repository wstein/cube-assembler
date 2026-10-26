// What went wrong with a capture, from the photos' raw sticker readings and
// how sure the camera was of each: a face shot twice (odd cubes only, see
// RepeatedFace) or a poor photo. Shown when saving a fixture and when the
// faces cannot be put together.
open StickerGeometry

let photoNames = ["Side 1", "Side 2", "Side 3", "Side 4", "Top", "Bottom"]

// A photo this unsure (percent) is called poor.
let poorPhotoBelow = 60.0

type diagnosis = {
  // False for an even cube, whose look-alike faces cannot be told apart.
  repeatsChecked: bool,
  repeated: array<(int, int)>,
  // The photo the camera was least sure of, and how sure (percent).
  weakest: Null.t<(int, float)>,
  cause: string,
}

@send external toFixed: (float, int) => string = "toFixed"

let diagnose = (
  size,
  readings: array<option<array<array<rgb>>>>,
  sureness: array<option<float>>,
  // The colors learned from this capture sit far from every known palette.
  paletteFar: bool,
) => {
  let repeatsChecked = mod(size, 2) == 1
  let repeated = repeatsChecked ? RepeatedFace.findRepeatShots(readings) : []
  let weakest = ref(None)
  sureness->Array.forEachWithIndex((sure, i) =>
    switch sure {
    | Some(sure) =>
      switch weakest.contents {
      | Some((_, best)) if best <= sure => ()
      | _ => weakest := Some((i, sure))
      }
    | None => ()
    }
  )
  let name = i => photoNames->Array.get(i)->Option.getOr("Photo")
  let cause = switch (Array.length(repeated) > 0, weakest.contents) {
  | (true, _) => "a face was shot twice - the photos themselves are fine"
  | (false, Some((i, sure))) if sure < poorPhotoBelow =>
    `the ${name(i)} photo is poor (${sure->toFixed(0)}% sure) - retake it in better light`
  | _ =>
    paletteFar
      ? "the colors learned from this capture are far from every known palette - two similar colors may be swapped"
      : "none found"
  }
  {repeatsChecked, repeated, weakest: Null.fromOption(weakest.contents), cause}
}

// "Side 4 and Top", or "none".
let repeatedText = (diagnosis: diagnosis) =>
  Array.length(diagnosis.repeated) == 0
    ? "none"
    : diagnosis.repeated
      ->Array.map(((a, b)) =>
        `${photoNames->Array.get(a)->Option.getOr("?")} and ${photoNames
          ->Array.get(b)
          ->Option.getOr("?")}`
      )
      ->Array.join("; ")

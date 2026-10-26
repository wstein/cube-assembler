@genType
let photoNames: array<string>

@genType
type diagnosis = {
  repeatsChecked: bool,
  repeated: array<(int, int)>,
  weakest: Null.t<(int, float)>,
  cause: string,
}

@genType
let diagnose: (
  int,
  array<option<array<array<StickerGeometry.rgb>>>>,
  array<option<float>>,
  bool,
) => diagnosis

@genType
let repeatedText: diagnosis => string

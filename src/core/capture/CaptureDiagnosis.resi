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

@genType let photoNamesForProtocol: Null.t<string> => array<string>
@genType let repeatedTextForProtocol: (diagnosis, Null.t<string>) => string

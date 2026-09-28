@genType let pieceKey: (int, string, int) => string
@genType let sourceIndex: (int, int, int) => int

@genType
type faceSource = {slot: string, turns: int}

@genType
let faceSources: (
  Dict.t<array<array<string>>>,
  Dict.t<array<array<string>>>,
) => Dict.t<Null.t<faceSource>>

@genType let presets: array<string>
@genType
type options = {scatter?: float}

@genType
let renderFace: (array<array<string>>, string, int, int, options) => Uint8ClampedArray.t

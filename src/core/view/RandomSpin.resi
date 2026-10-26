@genType let spinMs: float

@genType
type frame = {angle: float, swapped: bool, finished: bool}

// The spin `elapsed` milliseconds in: an eased full turn about the vertical
// axis; `swapped` from the midpoint, `finished` at the end.
@genType let spinFrame: float => frame

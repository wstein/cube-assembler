@genType
type largeTables = {
  corner: array<array<int>>,
  midge: array<array<int>>,
  wings: array<array<array<int>>>,
  centres: array<array<int>>,
}

// The 6x6 or 7x7 slot tables, derived from the 4x4 and 5x5 ones.
@genType let largeTables: int => largeTables
@genType let looksLikeOrbit64StateToken: string => bool
@genType let encodeOrbit64State: string => Null.t<string>
@genType let decodeOrbit64State: string => Null.t<string>

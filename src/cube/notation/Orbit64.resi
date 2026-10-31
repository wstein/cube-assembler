@genType
type largeTables = {
  corner: array<array<int>>,
  midge: array<array<int>>,
  wings: array<array<array<int>>>,
  centers: array<array<int>>,
}

// The 6x6 or 7x7 slot tables, derived from the 4x4 and 5x5 ones.
@genType let largeTables: int => largeTables
@genType let looksLikeOrbit64StateToken: string => bool
@genType let encodeOrbit64State: string => Null.t<string>
@genType let decodeOrbit64State: string => Null.t<string>

// Coordinate and token helpers, shared with the V2 codec (Orbit64V2.res).
let factorial: int => bigint
let permRank: array<int> => bigint
let permParity: array<int> => int
let permUnrank: (bigint, int) => array<int>
let permRankWithParity: array<int> => bigint
let permUnrankWithParity: (bigint, int, int) => array<int>
let orientationRank: (array<int>, int, int) => bigint
let orientationUnrank: (bigint, int, int) => array<int>
let centerRank: array<int> => bigint
let centerUnrank: bigint => array<int>
let toBase64: (bigint, int) => string
let fromBase64: string => option<bigint>

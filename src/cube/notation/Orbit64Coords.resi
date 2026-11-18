// Coordinate and token helpers of the Orbit64 V2 codec (Orbit64V2.res).
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

@genType
type model = Color | Picture

@genType
type pose = Canonical | Framed

@genType
type entry = {
  id: int,
  n: int,
  model: model,
  pose: pose,
  length: int,
  offset: bigint,
  count: bigint,
}

// The 54 entries of the initial registry in ID order, with their token
// lengths and offsets computed by the allocation rule.
@genType let entries: array<entry>
@genType let entryById: int => option<entry>
// The number of states of a type.
@genType let stateCount: (int, model, pose) => bigint

// Orbit coordinates of one cube in the slot convention of V1. Components a
// type lacks are empty. The caller normalizes the pose first: fixed centers of
// odd cubes are implicitly home, and `frame` carries the whole-cube
// orientation, which must be 0 unless the type is odd and framed.
// `rotations` holds r_U r_R r_F r_D r_L r_B (picture model, odd cubes).
@genType
type cube = {
  cornerPieces: array<int>,
  cornerTwists: array<int>,
  midgePieces: array<int>,
  midgeFlips: array<int>,
  wings: array<array<int>>,
  centers: array<array<int>>,
  rotations: array<int>,
  frame: int,
}

@genType
type decoded = {entry: entry, cube: cube}

// The solved state of a cube of size n and sticker model: every digit is zero.
@genType let solved: (int, model) => cube

// The token of a state of the registry entry `id`, or why it has none.
@genType let encodeOrbit64V2State: (int, cube) => result<string, string>

// The registry entry and state a token addresses, or why it addresses none.
@genType let decodeOrbit64V2State: string => result<decoded, string>

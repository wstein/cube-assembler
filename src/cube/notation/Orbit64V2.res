// Orbit64 V2 state tokens for n x n x n cubes, n = 2..15, in coordinates only:
// registry, state ranking and the token codec. There is no facelet bridge.
// Format: FORMAT-V2.md of flix-orbit64@8dc17fb (Apache-2.0); reference
// implementation: src/Orbit64/V2/{Registry,State,Codec}.flix there.
//
// A token is the rank of a state written at the length of its registry entry.
// Entries are placed in registry order. Each takes the shortest length whose
// unallocated values still hold all its states and starts directly after the
// entries already placed at that length.

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

// One digit of the rank layout; wing and center digits are numbered from 1.
type part =
  | CornerPerm
  | CornerTwist
  | MidgePerm
  | MidgeFlip
  | Wing(int)
  | Center(int)
  | FixedRot
  | FrameDigit

let range = count => Array.fromInitializer(~length=count, i => i)
let odd = n => mod(n, 2) == 1

// Even canonical cubes leave the DBL corner out: it is home by definition.
let dropsCorner = (n, pose) => !odd(n) && pose == Canonical
let storedCorners = (n, pose) => dropsCorner(n, pose) ? 7 : 8
let wingOrbits = n => (n - 2) / 2

// The (row, column) names of the center orbits, ordered by lowest facelet.
let centerOrbits = n =>
  range(n - 2)->Array.flatMap(r0 => {
    let r = r0 + 1
    range(Math.Int.max(0, n - 1 - 2 * r))->Array.map(c0 => (r, r + c0))
  })

let parts = (n, model, pose) => {
  let picture = odd(n) && model == Picture
  [
    [CornerPerm, CornerTwist],
    odd(n) ? [MidgePerm, MidgeFlip] : [],
    range(wingOrbits(n))->Array.map(i => Wing(i + 1)),
    range(Array.length(centerOrbits(n)))->Array.map(i => Center(i + 1)),
    picture ? [FixedRot] : [],
    odd(n) && pose == Framed ? [FrameDigit] : [],
  ]->Array.flat
}

let cornerPermRadix = (n, pose) => Orbit64.factorial(storedCorners(n, pose))
let cornerTwistRadix = (n, pose) => 3n ** BigInt.fromInt(storedCorners(n, pose) - 1)
let midgePermRadix = Orbit64.factorial(12) / 2n
let flipRadix = 2n ** 11n
let wingRadix = Orbit64.factorial(24)
let colorCenterRadix = Orbit64.factorial(24) / Orbit64.factorial(4) ** 6n
let pictureCenterRadix = Orbit64.factorial(24) / 2n

let radix = (n, model, pose, part) =>
  switch part {
  | CornerPerm => cornerPermRadix(n, pose)
  | CornerTwist => cornerTwistRadix(n, pose)
  | MidgePerm => midgePermRadix
  | MidgeFlip | FixedRot => flipRadix
  | Wing(_) => wingRadix
  | Center(_) => model == Color ? colorCenterRadix : pictureCenterRadix
  | FrameDigit => 24n
  }

let countOf = (n, model, pose) =>
  parts(n, model, pose)->Array.reduce(1n, (product, part) => product * radix(n, model, pose, part))

// The initial registry as (n, model, pose), in registry order. A 2x2x2 has no
// centers, so its picture model equals its color model and is not registered.
let initialTypes = range(14)->Array.flatMap(i => {
  let n = i + 2
  let color = [(n, Color, Canonical), (n, Color, Framed)]
  n == 2 ? color : [...color, (n, Picture, Canonical), (n, Picture, Framed)]
})

// The least length L >= 1 with used(L) + count <= 64^L.
let shortest = (used, count) => {
  let length = ref(1)
  let capacity = ref(64n)
  while used->Map.get(length.contents)->Option.getOr(0n) + count > capacity.contents {
    length := length.contents + 1
    capacity := capacity.contents * 64n
  }
  length.contents
}

let allocate = types => {
  let used = Map.make()
  types->Array.mapWithIndex(((n, model, pose), id) => {
    let count = countOf(n, model, pose)
    let length = shortest(used, count)
    let offset = used->Map.get(length)->Option.getOr(0n)
    used->Map.set(length, offset + count)
    {id, n, model, pose, length, offset, count}
  })
}

@genType
let entries = allocate(initialTypes)

@genType
let entryById = id => entries->Array.find(entry => entry.id == id)

@genType
let stateCount = (n, model, pose) => countOf(n, model, pose)

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

let get = (values, i) => values->Array.getUnsafe(i)
let big = BigInt.fromInt
let sum = values => values->Array.reduce(0, (a, b) => a + b)
let positiveMod = (x, m) => mod(mod(x, m) + m, m)

// The solved state of a type: every digit is zero. Color centers are ordered
// by color, four slots each.
@genType
let solved = (n, model) => {
  let identity = count => range(count)
  {
    cornerPieces: identity(8),
    cornerTwists: Array.make(~length=8, 0),
    midgePieces: odd(n) ? identity(12) : [],
    midgeFlips: odd(n) ? Array.make(~length=12, 0) : [],
    wings: range(wingOrbits(n))->Array.map(_ => identity(24)),
    centers: range(Array.length(centerOrbits(n)))->Array.map(_ =>
      model == Color ? identity(24)->Array.map(i => i / 4) : identity(24)
    ),
    rotations: odd(n) && model == Picture ? Array.make(~length=6, 0) : [],
    frame: 0,
  }
}

// ------------------------------------------------------------------ validation

let isInt = x => {
  let f = Int.toFloat(x)
  Float.isFinite(f) && Math.floor(f) == f
}

let isPermutation = (values, count) =>
  Array.length(values) == count &&
    range(count)->Array.every(piece => values->Array.filter(x => x == piece)->Array.length == 1)

let inRange = (values, size, bound) =>
  Array.length(values) == size && values->Array.every(x => isInt(x) && x >= 0 && x < bound)

let colorsBalanced = values =>
  inRange(values, 24, 6) &&
  range(6)->Array.every(color => values->Array.filter(x => x == color)->Array.length == 4)

let firstFault = checks => checks->Array.find(((ok, _)) => !ok)->Option.map(((_, why)) => why)

let layoutFault = (n, model, pose, cube) => {
  let picture = odd(n) && model == Picture
  let wings = wingOrbits(n)
  let centers = Array.length(centerOrbits(n))
  firstFault([
    (isPermutation(cube.cornerPieces, 8), "corner pieces are not a permutation of 8"),
    (inRange(cube.cornerTwists, 8, 3), "corner twists must be 8 values in 0..2"),
    (
      odd(n) ? isPermutation(cube.midgePieces, 12) : Array.length(cube.midgePieces) == 0,
      "midge pieces must be a permutation of 12 on odd cubes and empty otherwise",
    ),
    (
      odd(n) ? inRange(cube.midgeFlips, 12, 2) : Array.length(cube.midgeFlips) == 0,
      "midge flips must be 12 values in 0..1 on odd cubes and empty otherwise",
    ),
    (
      Array.length(cube.wings) == wings && cube.wings->Array.every(v => isPermutation(v, 24)),
      `expected ${Int.toString(wings)} wing permutations of 24`,
    ),
    (Array.length(cube.centers) == centers, `expected ${Int.toString(centers)} center orbits`),
    (
      cube.centers->Array.every(v => model == Color ? colorsBalanced(v) : isPermutation(v, 24)),
      "a center orbit is not a valid color multiset or permutation of 24",
    ),
    (
      picture ? inRange(cube.rotations, 6, 4) : Array.length(cube.rotations) == 0,
      "rotations must be 6 values in 0..3 on odd picture cubes and empty otherwise",
    ),
    (
      odd(n) && pose == Framed
        ? isInt(cube.frame) && cube.frame >= 0 && cube.frame < 24
        : cube.frame == 0,
      "frame must be 0..23 on odd framed cubes and 0 otherwise",
    ),
  ])
}

// The parity W_k of wing orbit k, zero when the cube has no wing orbit at depth k.
let wingParity = (n, wings, k) =>
  k >= 1 && k <= wingOrbits(n) ? Orbit64.permParity(wings->get(k - 1)) : 0

// The parity the index-th (from 1) center orbit must have in the picture
// model: Z[r,c] = C + W_r + W_d with d = min(c, n - 1 - c).
let requiredCenterParity = (n, cornerParity, wings, index) => {
  let (r, c) = centerOrbits(n)->get(index - 1)
  let d = Math.Int.min(c, n - 1 - c)
  mod(cornerParity + wingParity(n, wings, r) + wingParity(n, wings, d), 2)
}

// The laws index into the arrays, so they are only checked once the layout is sound.
let lawFault = (n, model, pose, cube) => {
  let c = Orbit64.permParity(cube.cornerPieces)
  firstFault([
    (mod(sum(cube.cornerTwists), 3) == 0, "corner twists must sum to 0 mod 3"),
    (!odd(n) || mod(sum(cube.midgeFlips), 2) == 0, "midge flips must sum to 0 mod 2"),
    (
      !dropsCorner(n, pose) || (cube.cornerPieces->get(6) == 6 && cube.cornerTwists->get(6) == 0),
      "a canonical even cube has its DBL corner home with twist 0",
    ),
    (!odd(n) || Orbit64.permParity(cube.midgePieces) == c, "midge parity must equal corner parity"),
    (
      !(odd(n) && model == Picture) || mod(sum(cube.rotations), 2) == c,
      "fixed-center rotation parity must equal corner parity",
    ),
    (
      model == Color ||
        cube.centers->Array.everyWithIndex((orbit, i) =>
          Orbit64.permParity(orbit) == requiredCenterParity(n, c, cube.wings, i + 1)
        ),
      "a center orbit parity breaks the picture relation",
    ),
  ])
}

let faultOf = (n, model, pose, cube) =>
  switch layoutFault(n, model, pose, cube) {
  | Some(why) => Some(why)
  | None => lawFault(n, model, pose, cube)
  }

// --------------------------------------------------------------------- ranking

// The corner slots that are stored: all eight, or all but DBL (slot 6).
let cornerSlots = (n, pose) => dropsCorner(n, pose) ? [0, 1, 2, 3, 4, 5, 7] : range(8)

// Pieces after DBL are renumbered down by one, so DRB becomes 6.
let storedPieces = (n, pose, cube) =>
  cornerSlots(n, pose)->Array.map(slot => {
    let piece = cube.cornerPieces->get(slot)
    dropsCorner(n, pose) && piece > 6 ? piece - 1 : piece
  })

// r_U + 4 r_R + 16 r_F + 64 r_D + 256 r_L + 1024 floor(r_B / 2)
let rotationDigit = rotations =>
  range(6)->Array.reduce(0n, (digit, i) =>
    digit + big(rotations->get(i) / (i == 5 ? 2 : 1)) * 4n ** big(i)
  )

let digitOf = (n, model, pose, cube, part) =>
  switch part {
  | CornerPerm => Orbit64.permRank(storedPieces(n, pose, cube))
  | CornerTwist =>
    let twists = cornerSlots(n, pose)->Array.map(slot => cube.cornerTwists->get(slot))
    Orbit64.orientationRank(twists, Array.length(twists) - 1, 3)
  | MidgePerm => Orbit64.permRankWithParity(cube.midgePieces)
  | MidgeFlip => Orbit64.orientationRank(cube.midgeFlips, 11, 2)
  | Wing(i) => Orbit64.permRank(cube.wings->get(i - 1))
  | Center(i) =>
    model == Color
      ? Orbit64.centerRank(cube.centers->get(i - 1))
      : Orbit64.permRankWithParity(cube.centers->get(i - 1))
  | FixedRot => rotationDigit(cube.rotations)
  | FrameDigit => big(cube.frame)
  }

// The rank of a valid state of the type, or the reason it is invalid.
let rankState = (n, model, pose, cube) =>
  switch faultOf(n, model, pose, cube) {
  | Some(why) => Error(why)
  | None =>
    Ok(
      parts(n, model, pose)->Array.reduce(0n, (rank, part) =>
        rank * radix(n, model, pose, part) + digitOf(n, model, pose, cube, part)
      ),
    )
  }

// ------------------------------------------------------------------- unranking

// Puts the left-out DBL corner (slot 6) back and undoes the piece renumbering.
let restoreDbl = (stored, dbl, renumber) => {
  let at = i => {
    let value = stored->get(i)
    renumber && value >= 6 ? value + 1 : value
  }
  range(8)->Array.map(slot => slot < 6 ? at(slot) : slot == 6 ? dbl : at(6))
}

let unrankRotations = (digit, cornerParity) => {
  let five = range(5)->Array.map(i => BigInt.toInt(mod(digit / 4n ** big(i), 4n)))
  // The low bit of r_B follows from R = C.
  let low = positiveMod(cornerParity - sum(five), 2)
  [...five, 2 * BigInt.toInt(digit / 1024n) + low]
}

// The state with the given rank, which must be in [0, count(n, model, pose)).
let unrankState = (n, model, pose, value) => {
  let all = parts(n, model, pose)
  let digits = Array.make(~length=Array.length(all), 0n)
  let rest = ref(value)
  for i in Array.length(all) - 1 downto 0 {
    let r = radix(n, model, pose, all->get(i))
    digits->Array.setUnsafe(i, mod(rest.contents, r))
    rest := rest.contents / r
  }
  let digit = part =>
    switch all->Array.findIndex(p => p == part) {
    | -1 => 0n
    | i => digits->get(i)
    }
  let stored = storedCorners(n, pose)
  let pieces = Orbit64.permUnrank(digit(CornerPerm), stored)
  let twists = Orbit64.orientationUnrank(digit(CornerTwist), stored - 1, 3)
  let cornerPieces = dropsCorner(n, pose) ? restoreDbl(pieces, 6, true) : pieces
  let cornerTwists = dropsCorner(n, pose) ? restoreDbl(twists, 0, false) : twists
  let c = Orbit64.permParity(cornerPieces)
  let wings = range(wingOrbits(n))->Array.map(i => Orbit64.permUnrank(digit(Wing(i + 1)), 24))
  let centers =
    range(Array.length(centerOrbits(n)))->Array.map(i =>
      model == Color
        ? Orbit64.centerUnrank(digit(Center(i + 1)))
        : Orbit64.permUnrankWithParity(
            digit(Center(i + 1)),
            24,
            requiredCenterParity(n, c, wings, i + 1),
          )
    )
  {
    cornerPieces,
    cornerTwists,
    midgePieces: odd(n) ? Orbit64.permUnrankWithParity(digit(MidgePerm), 12, c) : [],
    midgeFlips: odd(n) ? Orbit64.orientationUnrank(digit(MidgeFlip), 11, 2) : [],
    wings,
    centers,
    rotations: odd(n) && model == Picture ? unrankRotations(digit(FixedRot), c) : [],
    frame: odd(n) && pose == Framed ? BigInt.toInt(digit(FrameDigit)) : 0,
  }
}

// ----------------------------------------------------------------------- codec

let notAV2Token = "not a known V2 state token"

// Encodes a state of the registry entry `id`. Malformed input is an Error,
// never an exception.
@genType
let encodeOrbit64V2State = (id, cube) =>
  switch entryById(id) {
  | None => Error(`unknown registry entry ${Int.toString(id)}`)
  | Some(entry) =>
    try rankState(entry.n, entry.model, entry.pose, cube)->Result.map(rank =>
      Orbit64.toBase64(entry.offset + rank, entry.length)
    ) catch {
    | _ => Error("malformed state")
    }
  }

// Decodes a token to its registry entry and state. An unknown token, whether
// malformed or from a newer registry, is an Error.
@genType
let decodeOrbit64V2State = token =>
  try {
    let length = String.length(token)
    if !(entries->Array.some(entry => entry.length == length)) {
      Error(notAV2Token)
    } else {
      switch Orbit64.fromBase64(token) {
      | None => Error("token contains a character outside the base64url alphabet")
      | Some(value) =>
        switch entries->Array.find(entry =>
          entry.length == length && entry.offset <= value && value < entry.offset + entry.count
        ) {
        | None => Error(notAV2Token)
        | Some(entry) =>
          Ok({entry, cube: unrankState(entry.n, entry.model, entry.pose, value - entry.offset)})
        }
      }
    }
  } catch {
  | _ => Error(notAV2Token)
  }

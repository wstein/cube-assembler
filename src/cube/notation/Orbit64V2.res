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

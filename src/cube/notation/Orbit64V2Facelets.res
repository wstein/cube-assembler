// The facelet bridge of Orbit64 V2: a cube state to its stickers and back, for
// n x n x n cubes, n = 2..15, in the color model, and for n = 3..15 in the
// picture model.
// Format: FORMAT-V2.md of flix-orbit64@a046e34 (Apache-2.0); reference
// implementation: src/Orbit64/V2/Facelets.flix there.
//
// A facelet string writes the 6 n^2 stickers one per facelet (index
// `face * n^2 + row * n + col`), six face fields in the order U R F D L B
// separated by one space. The color model writes the letters U R F D L B. The
// picture model, where every sticker is distinct, writes one base64url symbol
// per facelet: the sticker's index within its class (corner `3 p + j`, midge
// and wing `2 p + j`, center orbit `p`, fixed center `4 p + r`, "Picture
// facelets" in FORMAT-V2.md). Reading ignores spaces. It does not reuse
// `NotationOutput`, which also trims and upper-cases, accepts any white space
// and answers with a warning instead of a reason.
//
// The slot tables follow the V1 slot convention and its extension to n >= 8
// ("Conventions" in FORMAT-V2.md). Three reference tables carry it: the
// corners and midges of the 5x5x5 and the wings of the 4x4x4. Every other size
// takes its slots by replacing each axis of a reference facelet, 0 by 0, 1 by
// the wing depth d, 2 (5x5x5 only) by n / 2, and the last two by n - 1 - d and
// n - 1. Center orbits come from geometry: the four quarter turn images of a
// cell, on six faces, ordered by facelet index. A piece is numbered by its home
// slot and the solved cube shows face colors, so a piece's colors are the faces
// of its home slot's facelets and no color table is needed.
//
// A whole-cube rotation is applied through the geometry of FORMAT.md, not
// through V1's x, z, y composition: frame r is the rotation that moves
// physical face frameFaces[r][i] into slot i.

type slots = {
  corners: array<array<int>>,
  midges: array<array<int>>,
  wings: array<array<array<int>>>,
  centers: array<array<int>>,
  fixed: array<int>,
}

type decodedFacelets = {entry: Orbit64V2.entry, facelets: string}

let range = count => Array.fromInitializer(~length=count, i => i)
let odd = n => mod(n, 2) == 1
let get = (values, i) => values->Array.getUnsafe(i)
let wingOrbits = n => (n - 2) / 2
let letters = ["U", "R", "F", "D", "L", "B"]

// ------------------------------------------------------------------ slot tables

// Corner slots of the 5x5x5: the facelet orientation counts from, then clockwise.
let cornerReference = [
  [24, 25, 54],
  [20, 50, 104],
  [0, 100, 129],
  [4, 125, 29],
  [79, 74, 45],
  [75, 124, 70],
  [95, 149, 120],
  [99, 49, 145],
]

// Midge slots of the 5x5x5.
let midgeReference = [
  [14, 27],
  [22, 52],
  [10, 102],
  [2, 127],
  [89, 47],
  [77, 72],
  [85, 122],
  [97, 147],
  [64, 35],
  [60, 114],
  [139, 110],
  [135, 39],
]

// Wing slots of the 4x4x4, the reference sticker first.
let wingReference = [
  [1, 82],
  [7, 18],
  [8, 66],
  [14, 34],
  [17, 11],
  [23, 84],
  [24, 43],
  [30, 59],
  [33, 13],
  [39, 20],
  [40, 75],
  [46, 50],
  [49, 45],
  [55, 29],
  [56, 77],
  [62, 93],
  [65, 4],
  [71, 36],
  [72, 91],
  [78, 52],
  [81, 2],
  [87, 68],
  [88, 27],
  [94, 61],
]

let expandAxis = (n, base, depth, value) =>
  (base == 4 ? [0, depth, n - 1 - depth, n - 1] : [0, depth, n / 2, n - 1 - depth, n - 1])->get(
    value,
  )

// Carries a reference facelet of a base x base cube to wing depth `depth` of an n x n x n.
let expandFacelet = (n, base, depth, index) => {
  let face = index / (base * base)
  let row = mod(index / base, base)
  let col = mod(index, base)
  face * n * n + expandAxis(n, base, depth, row) * n + expandAxis(n, base, depth, col)
}

let expandTable = (n, base, depth, table) =>
  table->Array.map(slot => slot->Array.map(index => expandFacelet(n, base, depth, index)))

let centerRepresentative = (n, row, col) => {
  let last = n - 1
  let rank = row * n + col
  rank <= col * n + last - row &&
  rank <= (last - row) * n + last - col &&
  rank <= (last - col) * n + row
}

// The four quarter turn images of a cell, on all six faces, by facelet index.
let centerTable = (n, row, col) => {
  let last = n - 1
  range(6 * n * n)->Array.filter(i => {
    let cell = mod(i, n * n)
    cell == row * n + col ||
    cell == col * n + last - row ||
    cell == (last - row) * n + last - col ||
    cell == (last - col) * n + row
  })
}

// Center orbits ordered by their lowest facelet; the fixed center of an odd
// cube is no orbit.
let centerTables = n =>
  range(n - 2)->Array.flatMap(r0 =>
    range(n - 2)->Array.filterMap(c0 => {
      let row = r0 + 1
      let col = c0 + 1
      centerRepresentative(n, row, col) && !(odd(n) && row == n / 2 && col == n / 2)
        ? Some(centerTable(n, row, col))
        : None
    })
  )

let fixedFacelets = n => odd(n) ? range(6)->Array.map(face => face * n * n + (n * n - 1) / 2) : []

let buildTables = n => {
  corners: expandTable(n, 5, 1, cornerReference),
  midges: odd(n) ? expandTable(n, 5, 1, midgeReference) : [],
  wings: range(wingOrbits(n))->Array.map(i => expandTable(n, 4, i + 1, wingReference)),
  centers: centerTables(n),
  fixed: fixedFacelets(n),
}

// The tables are internal: callers of `slotTables` get a fresh copy.
let tablesBySize = Map.make()

let tables = n =>
  switch tablesBySize->Map.get(n) {
  | Some(found) => found
  | None =>
    let built = buildTables(n)
    tablesBySize->Map.set(n, built)
    built
  }

// Only a number is looked at: the global isFinite would convert anything else
// first, and a hostile object or symbol would throw there.
let isInt = x =>
  Type.typeof(x) == #number &&
  Float.isFinite(Obj.magic(x)) &&
  Math.floor(Obj.magic(x)) == Obj.magic(x)

let validSize = n => isInt(n) && n >= 2 && n <= 15

@genType
let slotTables = n => validSize(n) ? Some(buildTables(n)) : None

// The face color of a facelet: in the solved cube a sticker shows its face.
let faceOf = (n, facelet) => facelet / (n * n)

// -------------------------------------------------------------------- geometry

type vec = (int, int, int)

// A rotation as the images of the unit vectors x, y and z.
type turn = (vec, vec, vec)

// Position (doubled grid, -m..m with m = n - 1) and outward normal of a facelet.
let geometry = (n, index): (vec, vec) => {
  let m = n - 1
  let face = index / (n * n)
  let a = 2 * mod(index, n) - m
  let b = 2 * mod(index / n, n) - m
  switch face {
  | 0 => ((a, m, b), (0, 1, 0))
  | 1 => ((m, -b, -a), (1, 0, 0))
  | 2 => ((a, -b, m), (0, 0, 1))
  | 3 => ((a, -m, -b), (0, -1, 0))
  | 4 => ((-m, -b, a), (-1, 0, 0))
  | _ => ((-a, -b, -m), (0, 0, -1))
  }
}

let faceOfNormal = (normal: vec) =>
  switch normal {
  | (0, 1, 0) => 0
  | (1, 0, 0) => 1
  | (0, 0, 1) => 2
  | (0, -1, 0) => 3
  | (-1, 0, 0) => 4
  | _ => 5
  }

// The (a, b) grid coordinates of a position on a face, as in `geometry`.
let gridOf = (face, (x, y, z): vec) =>
  switch face {
  | 0 => (x, z)
  | 1 => (-z, -y)
  | 2 => (x, -y)
  | 3 => (x, -z)
  | 4 => (z, -y)
  | _ => (-x, -y)
  }

// The inverse of `geometry`.
let faceletAt = (n, position, normal) => {
  let m = n - 1
  let face = faceOfNormal(normal)
  let (a, b) = gridOf(face, position)
  face * n * n + (b + m) / 2 * n + (a + m) / 2
}

let normalOf = (face): vec =>
  switch face {
  | 0 => (0, 1, 0)
  | 1 => (1, 0, 0)
  | 2 => (0, 0, 1)
  | 3 => (0, -1, 0)
  | 4 => (-1, 0, 0)
  | _ => (0, 0, -1)
  }

// The physical faces in slots U R F D L B of the 24 whole-cube frames, in the
// rank order of Orbit64 frames (FORMAT.md: x turns, then z turns, then y turns).
@scope("Object") @val external freeze: 'a => 'a = "freeze"

// Frozen, so no caller can change a frame.
@genType
let frameFaces = freeze([
  "URFDLB",
  "UBRDFL",
  "ULBDRF",
  "UFLDBR",
  "FRDBLU",
  "FURBDL",
  "FLUBRD",
  "FDLBUR",
  "DRBULF",
  "DFRUBL",
  "DLFURB",
  "DBLUFR",
  "BRUFLD",
  "BDRFUL",
  "BLDFRU",
  "BULFDR",
  "LUFRDB",
  "LBURFD",
  "LDBRUF",
  "LFDRBU",
  "RDFLUB",
  "RBDLFU",
  "RUBLDF",
  "RFULBD",
])

let faceIndex = letter => letters->Array.findIndex(l => l == letter)

// The physical faces in slots U R F D L B of a frame, as indices.
let facesOfFrame = frame => frameFaces->get(frame)->String.split("")->Array.map(faceIndex)

// The rotation of a frame: it moves physical face faces[i] onto slot i.
let turnOf = (frame): turn => {
  let faces = facesOfFrame(frame)
  let slotOf = f => normalOf(faces->Array.findIndex(x => x == f))
  (slotOf(1), slotOf(0), slotOf(2))
}

let dot = ((ax, ay, az): vec, (bx, by, bz): vec) => ax * bx + ay * by + az * bz

// The image of v under the rotation: x, y and z times their images.
let forward = (((ax, ay, az), (bx, by, bz), (cx, cy, cz)): turn, (x, y, z): vec): vec => (
  x * ax + y * bx + z * cx,
  x * ay + y * by + z * cy,
  x * az + y * bz + z * cz,
)

// The inverse of a rotation is its transpose.
let backward = ((ex, ey, ez): turn, v: vec): vec => (dot(v, ex), dot(v, ey), dot(v, ez))

// The stickers after the cube is rotated by `turn`: each sticker moves with its color.
let rotate = (n, turn, fs) =>
  fs->Array.mapWithIndex((_, i) => {
    let (p, q) = geometry(n, i)
    fs->get(faceletAt(n, backward(turn, p), backward(turn, q)))
  })

// The stickers of the cube rotated back: the inverse of `rotate`.
let unrotate = (n, turn, fs) =>
  fs->Array.mapWithIndex((_, i) => {
    let (p, q) = geometry(n, i)
    fs->get(faceletAt(n, forward(turn, p), forward(turn, q)))
  })

// -------------------------------------------------------- fixed center rotations

let cross = ((ax, ay, az): vec, (bx, by, bz): vec): vec => (
  ay * bz - az * by,
  az * bx - ax * bz,
  ax * by - ay * bx,
)

// The reference direction of a face: toward row 0, so toward B on U and F on D.
let reference = (face): vec =>
  switch face {
  | 0 => (0, 0, -1)
  | 3 => (0, 0, 1)
  | _ => (0, 1, 0)
  }

// A direction on a face turned k clockwise quarter turns, seen from outside.
let rec spin = (normal: vec, direction: vec, k) =>
  k <= 0 ? direction : spin(normal, cross(direction, normal), k - 1)

// The clockwise quarter turns from the reference direction of `face` to `direction`.
let quarterTurns = (face, direction: vec) =>
  range(4)
  ->Array.find(k => spin(normalOf(face), reference(face), k) == direction)
  ->Option.getOr(0)

// Where the fixed center of `face` with rotation r lands under `move`, and its new rotation.
let carryFixed = (move: vec => vec, face, r) => {
  let own = spin(normalOf(face), reference(face), r)
  let landed = faceOfNormal(move(normalOf(face)))
  (landed, quarterTurns(landed, move(own)))
}

// `permuted` is `before` with its facelets moved; carries the fixed centers along.
let turnFixed = (n, move, before, permuted) => {
  let out = Array.copy(permuted)
  let fixed = fixedFacelets(n)
  range(6)->Array.forEach(face => {
    let value = before->get(fixed->get(face))
    let (landed, r) = carryFixed(move, face, mod(value, 4))
    out->Array.setUnsafe(fixed->get(landed), 4 * (value / 4) + r)
  })
  out
}

// The picture of a cube turned by `turn`: stickers and fixed center rotations.
let rotatePicture = (n, turn, vs) => turnFixed(n, v => forward(turn, v), vs, rotate(n, turn, vs))

// The picture of a cube turned back by `turn`.
let unrotatePicture = (n, turn, vs) =>
  turnFixed(n, v => backward(turn, v), vs, unrotate(n, turn, vs))

// ---------------------------------------------------------------- cube to stickers

let symbols = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"

// The character of a sticker value: a letter in the color model, a base64url
// symbol in the picture model.
let symbolOf = (model: Orbit64V2.model, value) =>
  model == Picture ? symbols->String.charAt(value) : letters->get(value)

// What sticker k of the piece in slot `piece` of `table` shows: in the color
// model the face color of its home facelet, in the picture model its index
// `m piece + k` within its class.
let stickerValue = (n, model: Orbit64V2.model, table, piece, k) =>
  model == Picture
    ? Array.length(table->get(piece)) * piece + k
    : faceOf(n, table->get(piece)->get(k))

let writeOriented = (n, model, sticker, table, pieces, twists) =>
  table->Array.forEachWithIndex((slotFacelets, slot) => {
    let m = Array.length(slotFacelets)
    let piece = pieces->get(slot)
    let twist = twists->get(slot)
    for k in 0 to m - 1 {
      sticker->Array.setUnsafe(
        slotFacelets->get(k),
        stickerValue(n, model, table, piece, mod(k - twist + m, m)),
      )
    }
  })

let writeCenters = (sticker, table: array<int>, colors: array<int>) =>
  table->Array.forEachWithIndex((facelet, slot) =>
    sticker->Array.setUnsafe(facelet, colors->get(slot))
  )

// A fixed center shows its face color, or in the picture model its piece and rotation.
let fixedValue = (model: Orbit64V2.model, cube: Orbit64V2.cube, face) =>
  model == Picture ? 4 * face + cube.rotations->get(face) : face

// The stickers of a canonical-pose cube; fixed centers are home.
let paint = (n, model, t, cube: Orbit64V2.cube) => {
  let sticker = Array.make(~length=6 * n * n, 0)
  t.fixed->Array.forEachWithIndex((facelet, face) =>
    sticker->Array.setUnsafe(facelet, fixedValue(model, cube, face))
  )
  writeOriented(n, model, sticker, t.corners, cube.cornerPieces, cube.cornerTwists)
  if odd(n) {
    writeOriented(n, model, sticker, t.midges, cube.midgePieces, cube.midgeFlips)
  }
  t.wings->Array.forEachWithIndex((table, i) =>
    writeOriented(n, model, sticker, table, cube.wings->get(i), Array.make(~length=24, 0))
  )
  t.centers->Array.forEachWithIndex((table, i) =>
    writeCenters(sticker, table, cube.centers->get(i))
  )
  sticker
}

// Why a type has no facelet string, if it has none.
let typeFault = (n, model: Orbit64V2.model, pose: Orbit64V2.pose) =>
  if !isInt(n) {
    Some("the cube size is not an integer in 2..15")
  } else if !validSize(n) {
    Some(`no V2 type for the ${Int.toString(n)}x${Int.toString(n)}x${Int.toString(n)}`)
  } else if model == Picture && n == 2 {
    Some("the 2x2x2 has no picture entry: its picture model is the color model")
  } else if model != Color && model != Picture {
    Some("unknown sticker model")
  } else if pose != Canonical && pose != Framed {
    Some("unknown pose")
  } else {
    None
  }

let spell = (n, model, fs) =>
  range(6)
  ->Array.map(face =>
    range(n * n)->Array.map(i => symbolOf(model, fs->get(face * n * n + i)))->Array.join("")
  )
  ->Array.join(" ")

@genType
let toFacelets = (n, model, pose, cube) =>
  try {
    switch typeFault(n, model, pose) {
    | Some(why) => Error(why)
    | None =>
      let cube = Orbit64V2.snapshot(cube)
      switch Orbit64V2.faultOf(n, model, pose, cube) {
      | Some(why) => Error(why)
      | None =>
        let fs = paint(n, model, tables(n), cube)
        let turn = turnOf(cube.frame)
        Ok(
          spell(
            n,
            model,
            !odd(n) ? fs : model == Picture ? rotatePicture(n, turn, fs) : rotate(n, turn, fs),
          ),
        )
      }
    }
  } catch {
  | _ => Error("malformed state")
  }

// ---------------------------------------------------------------- stickers to cube

// The face index of a facelet letter, by code point; -1 for any other.
let colorIndex = code =>
  switch code {
  | 85 => 0
  | 82 => 1
  | 70 => 2
  | 68 => 3
  | 76 => 4
  | 66 => 5
  | _ => -1
  }

// The value of a base64url symbol, by code point; -1 for any other.
let symbolIndex = code =>
  if code >= 65 && code <= 90 {
    code - 65
  } else if code >= 97 && code <= 122 {
    code - 71
  } else if code >= 48 && code <= 57 {
    code + 4
  } else if code == 45 {
    62
  } else if code == 95 {
    63
  } else {
    -1
  }

let rec traverse = (items, f, index, out) =>
  if index == Array.length(items) {
    Ok(out)
  } else {
    switch f(items->get(index), index) {
    | Error(why) => Error(why)
    | Ok(value) =>
      out->Array.push(value)
      traverse(items, f, index + 1, out)
    }
  }

let traverseAll = (items, f) => traverse(items, f, 0, [])

// The values of a facelet string, spaces ignored, or why it is no string of n^2
// per face. A whole code point is quoted where the reference quotes a UTF-16
// unit; a tab or newline is a bad character like any other. The string is
// walked once and only the first 6 n^2 values are kept, so a huge string costs
// time but no memory: its first bad character is reported before its length.
let parse = (n, text, indexOf, bad) => {
  let expected = 6 * n * n
  let values = []
  let count = ref(0)
  let at = ref(0)
  let fault = ref(None)
  let size = String.length(text)
  while Option.isNone(fault.contents) && at.contents < size {
    let code = String.codePointAt(text, at.contents)->Option.getOr(32)
    // A code point outside the BMP is no symbol, so the walk ends there.
    at := at.contents + 1
    if code != 32 {
      switch indexOf(code) {
      | -1 => fault := Some(bad(String.fromCodePoint(code)))
      | index =>
        if count.contents < expected {
          values->Array.push(index)
        }
        count := count.contents + 1
      }
    }
  }
  switch fault.contents {
  | Some(why) => Error(why)
  | None =>
    count.contents == expected
      ? Ok(values)
      : Error(
          `expected ${Int.toString(expected)} facelets for the ${Int.toString(n)}x${Int.toString(
              n,
            )}x${Int.toString(n)}, got ${Int.toString(count.contents)}`,
        )
  }
}

let checkCounts = (n, fs) =>
  switch range(6)->Array.find(f => fs->Array.filter(x => x == f)->Array.length != n * n) {
  | Some(f) =>
    Error(
      `color ${letters->get(f)} occurs ${Int.toString(
          fs->Array.filter(x => x == f)->Array.length,
        )} times, expected ${Int.toString(n * n)}`,
    )
  | None => Ok()
  }

// The stickers on the facelets of one slot.
let seenAt = (table, slot, fs) => table->get(slot)->Array.map(at => fs->get(at))

// The piece and twist whose colors, read from the slot's first facelet, are `seen`.
let readPiece = (n, table, seen) => {
  let m = Array.length(seen)
  table
  ->Array.mapWithIndex((home, p) =>
    range(m)
    ->Array.find(o =>
      range(m)->Array.every(k => seen->get(k) == faceOf(n, home->get(mod(k - o + m, m))))
    )
    ->Option.map(o => (p, o))
  )
  ->Array.find(found => found != None)
  ->Option.flatMap(found => found)
}

let noPiece = (model, what, slot, seen) => {
  let shown = seen->Array.map(v => symbolOf(model, v))->Array.join("")
  `${what} slot ${Int.toString(slot)} shows ${shown}, which is no ${what} of this cube`
}

let pieces = found => found->Array.map(((p, _)) => p)
let twists = found => found->Array.map(((_, o)) => o)

let readOriented = (n, what, table, fs) =>
  range(Array.length(table))
  ->traverseAll((slot, _) => {
    let seen = seenAt(table, slot, fs)
    switch readPiece(n, table, seen) {
    | Some(found) => Ok(found)
    | None => Error(noPiece(Color, what, slot, seen))
    }
  })
  ->Result.map(found => (pieces(found), twists(found)))

// A wing carries no twist: its two stickers sit in the order of its home slot or not at all.
let readWingsStrict = (n, table, fs) => {
  let solved = range(6 * n * n)->Array.map(i => faceOf(n, i))
  let homes = range(Array.length(table))->Array.map(p => seenAt(table, p, solved))
  range(Array.length(table))->traverseAll((slot, _) => {
    let seen = seenAt(table, slot, fs)
    switch homes->Array.findIndex(home => home == seen) {
    | -1 => Error(noPiece(Color, "wing", slot, seen))
    | p => Ok(p)
    }
  })
}

// The coordinates of a canonical-pose string; the frame is `frame`.
let readCube = (n, t, frame, fs): result<Orbit64V2.cube, string> =>
  readOriented(n, "corner", t.corners, fs)->Result.flatMap(((cp, co)) =>
    (odd(n) ? readOriented(n, "midge", t.midges, fs) : Ok(([], [])))->Result.flatMap(((mp, mo)) =>
      t.wings
      ->traverseAll((table, _) => readWingsStrict(n, table, fs))
      ->Result.map(
        (wings): Orbit64V2.cube => {
          cornerPieces: cp,
          cornerTwists: co,
          midgePieces: mp,
          midgeFlips: mo,
          wings,
          centers: t.centers->Array.map(table => table->Array.map(at => fs->get(at))),
          rotations: [],
          frame,
        },
      )
    )
  )

// The frame whose faces, in slot order, are `shown`.
let frameShown = shown =>
  switch range(24)->Array.find(r => facesOfFrame(r) == shown) {
  | Some(r) => Ok(r)
  | None => Error("the six fixed centers are not a right-handed whole-cube frame")
  }

// Rotates an odd cube so that its fixed centers are home; the frame is the one they show.
let normalizeOdd = (n, t, fs) =>
  frameShown(t.fixed->Array.map(at => fs->get(at)))->Result.map(r => (
    r,
    unrotate(n, turnOf(r), fs),
  ))

// Rotates an even cube so that its DBL corner is in slot DBL with twist 0;
// `atHome` says whether a rotated string has it there.
let normalizeEven = (n, fs, atHome) =>
  switch range(24)->Array.findMap(r => {
    let rotated = unrotate(n, turnOf(r), fs)
    atHome(rotated) ? Some(rotated) : None
  }) {
  | Some(rotated) => Ok(rotated)
  | None => Error("no whole-cube rotation puts the DBL corner home")
  }

// The frame to record and the stickers in the pose the type reads them in.
let posedStickers = (n, pose: Orbit64V2.pose, t, fs) =>
  if odd(n) {
    normalizeOdd(n, t, fs)->Result.map(((r, posed)) => (pose == Framed ? r : 0, posed))
  } else if pose == Canonical {
    normalizeEven(n, fs, rotated =>
      readPiece(n, t.corners, seenAt(t.corners, 6, rotated)) == Some((6, 0))
    )->Result.map(posed => (0, posed))
  } else {
    Ok((0, fs))
  }

let readColorStickers = (n, pose, text) => {
  let t = tables(n)
  parse(n, text, colorIndex, letter => `facelet '${letter}' is not one of U R F D L B`)
  ->Result.flatMap(fs => checkCounts(n, fs)->Result.map(() => fs))
  ->Result.flatMap(fs => posedStickers(n, pose, t, fs))
  ->Result.flatMap(((frame, posed)) => readCube(n, t, frame, posed))
}

// ------------------------------------------------------------ picture to cube

// The stickers of one piece type: where they sit, how many values they can
// show, and `per`, how many values name the same piece.
type group = {what: string, facelets: array<int>, limit: int, per: int}

// Every sticker class of a cube, in the order the reference checks them: a
// sticker never leaves its class.
let groups = t =>
  [
    [{what: "corner", facelets: Array.flat(t.corners), limit: 24, per: 1}],
    Array.length(t.midges) == 0
      ? []
      : [{what: "midge", facelets: Array.flat(t.midges), limit: 24, per: 1}],
    t.wings->Array.map(table => {what: "wing", facelets: Array.flat(table), limit: 48, per: 1}),
    t.centers->Array.map(table => {what: "center", facelets: table, limit: 24, per: 1}),
    Array.length(t.fixed) == 0
      ? []
      : [{what: "fixed center", facelets: t.fixed, limit: 24, per: 4}],
  ]->Array.flat

// A sticker on a facelet of the wrong class, or a piece shown twice; a range
// error comes before a repeat.
let checkGroup = (vs, g) =>
  switch g.facelets->Array.find(at => vs->get(at) >= g.limit) {
  | Some(at) =>
    Error(
      `facelet ${Int.toString(at)} shows '${symbolOf(
          Picture,
          vs->get(at),
        )}', which is no ${g.what} sticker`,
    )
  | None =>
    let values = g.facelets->Array.map(at => vs->get(at))
    let uses = Array.make(~length=g.limit, 0)
    values->Array.forEach(v => uses->Array.setUnsafe(v / g.per, uses->get(v / g.per) + 1))
    switch values->Array.find(v => uses->get(v / g.per) > 1) {
    | Some(v) => Error(`${g.what} sticker '${symbolOf(Picture, v)}' occurs more than once`)
    | None => Ok()
    }
  }

// The piece and twist spelled by the m symbols of a slot: `m p + (k - o) mod m`.
let readPictureSlot = seen => {
  let m = Array.length(seen)
  let first = seen->get(0)
  let p = first / m
  let o = mod(m - mod(first, m), m)
  range(m)->Array.every(k => seen->get(k) == m * p + mod(k - o + m, m)) ? Some((p, o)) : None
}

// The pieces and twists of a table of slots; a `strict` slot admits no twist.
let readPictureOriented = (what, table, strict, vs) =>
  range(Array.length(table))
  ->traverseAll((slot, _) => {
    let seen = seenAt(table, slot, vs)
    switch readPictureSlot(seen) {
    | Some((p, o)) if !strict || o == 0 => Ok((p, o))
    | _ => Error(noPiece(Picture, what, slot, seen))
    }
  })
  ->Result.map(found => (pieces(found), twists(found)))

// The coordinates of a canonical-pose picture; the frame is `frame`.
let readPictureCube = (n, t, frame, vs): result<Orbit64V2.cube, string> =>
  readPictureOriented("corner", t.corners, false, vs)->Result.flatMap(((cp, co)) =>
    (odd(n) ? readPictureOriented("midge", t.midges, false, vs) : Ok(([], [])))->Result.flatMap(((
      mp,
      mo,
    )) =>
      t.wings
      ->traverseAll(
        (table, _) => readPictureOriented("wing", table, true, vs)->Result.map(((p, _)) => p),
      )
      ->Result.map(
        (wings): Orbit64V2.cube => {
          cornerPieces: cp,
          cornerTwists: co,
          midgePieces: mp,
          midgeFlips: mo,
          wings,
          centers: t.centers->Array.map(table => table->Array.map(at => vs->get(at))),
          rotations: t.fixed->Array.map(at => mod(vs->get(at), 4)),
          frame,
        },
      )
    )
  )

// The frame to record and the symbols in the pose the type reads them in.
let posedPicture = (n, pose: Orbit64V2.pose, t, vs) =>
  if odd(n) {
    frameShown(t.fixed->Array.map(at => vs->get(at) / 4))->Result.map(r => (
      pose == Framed ? r : 0,
      unrotatePicture(n, turnOf(r), vs),
    ))
  } else if pose == Canonical {
    normalizeEven(n, vs, rotated =>
      readPictureSlot(seenAt(t.corners, 6, rotated)) == Some((6, 0))
    )->Result.map(posed => (0, posed))
  } else {
    Ok((0, vs))
  }

// Every sticker is of its class and every slot spells one piece, in any pose.
let checkPieces = (n, t, vs) =>
  groups(t)
  ->traverseAll((g, _) => checkGroup(vs, g))
  ->Result.flatMap(_ => readPictureCube(n, t, 0, vs))

let readPictureStickers = (n, pose, text) => {
  let t = tables(n)
  parse(n, text, symbolIndex, letter => `facelet '${letter}' is not a base64url symbol`)
  ->Result.flatMap(vs => checkPieces(n, t, vs)->Result.map(_ => vs))
  ->Result.flatMap(vs => posedPicture(n, pose, t, vs))
  ->Result.flatMap(((frame, posed)) => readPictureCube(n, t, frame, posed))
}

let readStickers = (n, model: Orbit64V2.model, pose, text) =>
  (
    model == Picture ? readPictureStickers(n, pose, text) : readColorStickers(n, pose, text)
  )->Result.flatMap(cube =>
    switch Orbit64V2.faultOf(n, model, pose, cube) {
    | Some(why) => Error(why)
    | None => Ok(cube)
    }
  )

@genType
let fromFacelets = (n, model, pose, facelets) =>
  try {
    switch typeFault(n, model, pose) {
    | Some(why) => Error(why)
    | None =>
      Type.typeof(facelets) == #string
        ? readStickers(n, model, pose, facelets)
        : Error("facelets must be a string")
    }
  } catch {
  | _ => Error("malformed facelets")
  }

// ------------------------------------------------------------ registry level helpers

@genType
let encodeFacelets = (id, facelets) =>
  try {
    switch Orbit64V2.entryById(id) {
    | None =>
      // Only a genuine integer is quoted: no caller text, no caller code.
      Error(
        isInt(id)
          ? `unknown registry entry ${Int.toString(id)}`
          : "the registry entry is not an integer",
      )
    | Some(entry) =>
      fromFacelets(entry.n, entry.model, entry.pose, facelets)->Result.flatMap(cube =>
        Orbit64V2.encodeOrbit64V2State(id, cube)
      )
    }
  } catch {
  | _ => Error("malformed registry entry")
  }

@genType
let decodeFacelets = token =>
  Orbit64V2.decodeOrbit64V2State(token)->Result.flatMap(({entry, cube}) =>
    toFacelets(entry.n, entry.model, entry.pose, cube)->Result.map(facelets => {entry, facelets})
  )

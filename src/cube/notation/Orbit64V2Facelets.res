// The facelet bridge of Orbit64 V2: a cube state to its stickers and back, for
// n x n x n cubes, n = 2..15, in the color model.
// Format: FORMAT-V2.md of flix-orbit64@d701008 (Apache-2.0); reference
// implementation: src/Orbit64/V2/Facelets.flix there.
//
// A facelet string writes the 6 n^2 stickers as the letters U R F D L B, one
// per facelet (index `face * n^2 + row * n + col`), six face fields in that
// order separated by one space. Reading ignores spaces. It does not reuse
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

// ---------------------------------------------------------------- cube to stickers

let writeOriented = (n, sticker, table, pieces, twists) =>
  table->Array.forEachWithIndex((slotFacelets, slot) => {
    let m = Array.length(slotFacelets)
    let home = table->get(pieces->get(slot))
    let twist = twists->get(slot)
    for k in 0 to m - 1 {
      sticker->Array.setUnsafe(slotFacelets->get(k), faceOf(n, home->get(mod(k - twist + m, m))))
    }
  })

let writeCenters = (sticker, table: array<int>, colors: array<int>) =>
  table->Array.forEachWithIndex((facelet, slot) =>
    sticker->Array.setUnsafe(facelet, colors->get(slot))
  )

// The stickers of a canonical-pose cube; fixed centers are home.
let paint = (n, t, cube: Orbit64V2.cube) => {
  let sticker = Array.make(~length=6 * n * n, 0)
  t.fixed->Array.forEachWithIndex((facelet, face) => sticker->Array.setUnsafe(facelet, face))
  writeOriented(n, sticker, t.corners, cube.cornerPieces, cube.cornerTwists)
  if odd(n) {
    writeOriented(n, sticker, t.midges, cube.midgePieces, cube.midgeFlips)
  }
  t.wings->Array.forEachWithIndex((table, i) =>
    writeOriented(n, sticker, table, cube.wings->get(i), Array.make(~length=24, 0))
  )
  t.centers->Array.forEachWithIndex((table, i) =>
    writeCenters(sticker, table, cube.centers->get(i))
  )
  sticker
}

// Why a type has no facelet letters, if it has none.
let typeFault = (n, model: Orbit64V2.model, pose: Orbit64V2.pose) =>
  if !isInt(n) {
    Some("the cube size is not an integer in 2..15")
  } else if !validSize(n) {
    Some(`no V2 type for the ${Int.toString(n)}x${Int.toString(n)}x${Int.toString(n)}`)
  } else if model == Picture {
    Some("the picture model has no letters")
  } else if model != Color {
    Some("unknown sticker model")
  } else if pose != Canonical && pose != Framed {
    Some("unknown pose")
  } else {
    None
  }

let spell = (n, fs) =>
  range(6)
  ->Array.map(face =>
    range(n * n)->Array.map(i => letters->get(fs->get(face * n * n + i)))->Array.join("")
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
        let fs = paint(n, tables(n), cube)
        Ok(spell(n, odd(n) ? rotate(n, turnOf(cube.frame), fs) : fs))
      }
    }
  } catch {
  | _ => Error("malformed state")
  }

// ---------------------------------------------------------------- stickers to cube

@val external codePoints: string => array<string> = "Array.from"

// The face index of a facelet letter (a whole code point is quoted, where the
// reference quotes a UTF-16 unit); a tab or newline is a bad letter like any other.
let letterIndex = letter =>
  switch faceIndex(letter) {
  | -1 => Error(`facelet '${letter}' is not one of U R F D L B`)
  | index => Ok(index)
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

// The stickers of a facelet string as face indices, or why it is no string of n^2 per face.
let parse = (n, text) =>
  codePoints(text)
  ->Array.filter(c => c != " ")
  ->traverseAll((letter, _) => letterIndex(letter))
  ->Result.flatMap(indices => {
    let length = Array.length(indices)
    if length != 6 * n * n {
      Error(
        `expected ${Int.toString(6 * n * n)} facelets for the ${Int.toString(n)}x${Int.toString(
            n,
          )}x${Int.toString(n)}, got ${Int.toString(length)}`,
      )
    } else {
      Ok(indices)
    }
  })

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

let noPiece = (what, slot, seen) => {
  let shown = seen->Array.map(f => letters->get(f))->Array.join("")
  `${what} slot ${Int.toString(slot)} shows ${shown}, which is no ${what} of this cube`
}

let readOriented = (n, what, table, fs) =>
  range(Array.length(table))
  ->traverseAll((slot, _) => {
    let seen = seenAt(table, slot, fs)
    switch readPiece(n, table, seen) {
    | Some(found) => Ok(found)
    | None => Error(noPiece(what, slot, seen))
    }
  })
  ->Result.map(found => (found->Array.map(((p, _)) => p), found->Array.map(((_, o)) => o)))

// A wing carries no twist: its two stickers sit in the order of its home slot or not at all.
let readWingsStrict = (n, table, fs) => {
  let solved = range(6 * n * n)->Array.map(i => faceOf(n, i))
  let homes = range(Array.length(table))->Array.map(p => seenAt(table, p, solved))
  range(Array.length(table))->traverseAll((slot, _) => {
    let seen = seenAt(table, slot, fs)
    switch homes->Array.findIndex(home => home == seen) {
    | -1 => Error(noPiece("wing", slot, seen))
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

// Rotates an odd cube so that its fixed centers are home; the frame is the one they show.
let normalizeOdd = (n, t, fs) => {
  let shown = t.fixed->Array.map(at => fs->get(at))
  switch range(24)->Array.find(r => facesOfFrame(r) == shown) {
  | Some(r) => Ok((r, unrotate(n, turnOf(r), fs)))
  | None => Error("the six fixed centers are not a right-handed whole-cube frame")
  }
}

// Rotates an even cube so that its DBL corner is in slot DBL with twist 0.
let normalizeEven = (n, t, fs) =>
  switch range(24)->Array.findMap(r => {
    let rotated = unrotate(n, turnOf(r), fs)
    readPiece(n, t.corners, seenAt(t.corners, 6, rotated)) == Some((6, 0)) ? Some(rotated) : None
  }) {
  | Some(rotated) => Ok(rotated)
  | None => Error("no whole-cube rotation puts the DBL corner home")
  }

// The frame to record and the stickers in the pose the type reads them in.
let posedStickers = (n, pose: Orbit64V2.pose, t, fs) =>
  if odd(n) {
    normalizeOdd(n, t, fs)->Result.map(((r, posed)) => (pose == Framed ? r : 0, posed))
  } else if pose == Canonical {
    normalizeEven(n, t, fs)->Result.map(posed => (0, posed))
  } else {
    Ok((0, fs))
  }

let readStickers = (n, model, pose, text) => {
  let t = tables(n)
  parse(n, text)
  ->Result.flatMap(fs => checkCounts(n, fs)->Result.map(() => fs))
  ->Result.flatMap(fs => posedStickers(n, pose, t, fs))
  ->Result.flatMap(((frame, posed)) => readCube(n, t, frame, posed))
  ->Result.flatMap(cube =>
    switch Orbit64V2.faultOf(n, model, pose, cube) {
    | Some(why) => Error(why)
    | None => Ok(cube)
    }
  )
}

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

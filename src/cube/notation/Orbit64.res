// Browser port of the Orbit64 state/facelet boundary for 2x2-7x7 cubes.
// Format and slot convention: flix-orbit64@00c0a97 (Apache-2.0).
// The app deliberately handles state tokens only; move and algorithm tokens
// are different Orbit64 classes.
module T = Orbit64Tables

let alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
let faceLetters = "URFDLB"
let widths = [(2, 5), (3, 12), (4, 27), (5, 43), (6, 66), (7, 90)]
let widthOf = n => widths->Array.find(((size, _)) => size == n)->Option.map(((_, width)) => width)

let range = count => Array.fromInitializer(~length=count, i => i)
let odd = n => mod(n, 2) == 1
let get = (values, i) => values->Array.getUnsafe(i)
let sum = values => values->Array.reduce(0, (a, b) => a + b)

// 6x6 and 7x7 slots, derived from the 4x4 and 5x5 reference tables.
// https://github.com/wstein/flix-orbit64/blob/00c0a97c7793d22249039743830f305925b23a38/src/Orbit64/Net.flix
type largeTables = {
  corner: array<array<int>>,
  midge: array<array<int>>,
  wings: array<array<array<int>>>,
  centres: array<array<int>>,
}

let expandFacelet = (n, depth, index) => {
  let base = odd(n) ? 5 : 4
  let face = index / (base * base)
  let row = mod(index, base * base) / base
  let col = mod(index, base)
  let axis = base == 4 ? [0, depth, n - 1 - depth, n - 1] : [0, depth, n / 2, n - 1 - depth, n - 1]
  face * n * n + axis->get(row) * n + axis->get(col)
}

let expandTable = (n, depth, table) =>
  table->Array.map(slot => slot->Array.map(index => expandFacelet(n, depth, index)))

let centres = n => {
  let tables = []
  let last = n - 1
  for row in 1 to last - 1 {
    for col in 1 to last - 1 {
      let middle = odd(n) && row == n / 2 && col == n / 2
      let positions = [
        row * n + col,
        col * n + last - row,
        (last - row) * n + last - col,
        (last - col) * n + row,
      ]
      let first = positions->Array.reduce(positions->get(0), (a, b) => a < b ? a : b)
      if !middle && row * n + col == first {
        tables->Array.push(
          range(6 * n * n)->Array.filter(index => positions->Array.includes(mod(index, n * n))),
        )
      }
    }
  }
  tables
}

let largeTables = n => {
  let even = !odd(n)
  {
    corner: expandTable(n, 1, even ? T.cornerFacelet4 : T.cornerFacelet5),
    midge: even ? [] : expandTable(n, 1, T.midgeFacelet5),
    wings: [1, 2]->Array.map(depth =>
      expandTable(n, depth, even ? T.wingFacelet4 : T.wingFacelet5)
    ),
    centres: centres(n),
  }
}

let large6 = largeTables(6)
let large7 = largeTables(7)
let large = n => n == 6 ? large6 : large7

let factorial = n => {
  let out = ref(1n)
  for i in 2 to n {
    out := out.contents * BigInt.fromInt(i)
  }
  out.contents
}

let choose = (n, k) =>
  if k < 0 || k > n {
    0
  } else {
    let out = ref(1)
    for i in 1 to k {
      out := out.contents * (n - i + 1) / i
    }
    out.contents
  }

let cornerRadix = factorial(8) * 3n ** 7n
let midgeRadix = factorial(12) * 2n ** 11n / 2n
let wingRadix = factorial(24)
let centreRadix =
  [24, 20, 16, 12, 8]->Array.reduce(1n, (product, slots) =>
    product * BigInt.fromInt(choose(slots, 4))
  )

let radices = n =>
  switch n {
  | 2 => [cornerRadix]
  | 3 => [cornerRadix, midgeRadix]
  | 4 => [cornerRadix, wingRadix, centreRadix]
  | 5 => [cornerRadix, midgeRadix, wingRadix, centreRadix, centreRadix]
  | 6 => [cornerRadix, wingRadix, wingRadix, ...Array.make(~length=4, centreRadix)]
  | _ => [cornerRadix, midgeRadix, wingRadix, wingRadix, ...Array.make(~length=6, centreRadix)]
  }

let stateCount = n => radices(n)->Array.reduce(odd(n) ? 24n : 1n, (a, b) => a * b)

// Pieces smaller than the one at `i`, among those after it.
let smallerAfter = (values, i) =>
  values
  ->Array.slice(~start=i + 1)
  ->Array.filter(value => value < values->get(i))
  ->Array.length

let permRank = values =>
  range(Array.length(values))->Array.reduce(0n, (rank, i) =>
    rank * BigInt.fromInt(Array.length(values) - i) + BigInt.fromInt(smallerAfter(values, i))
  )

let permParity = values =>
  mod(
    range(Array.length(values))->Array.reduce(0, (count, i) => count + smallerAfter(values, i)),
    2,
  )

// Takes the `digit`th of the still available pieces.
let takeAt = (available, digit) => {
  let piece = available.contents->get(digit)
  available := available.contents->Array.filterWithIndex((_, i) => i != digit)
  piece
}

let permUnrank = (rank, n) => {
  let available = ref(range(n))
  let rank = ref(rank)
  Array.fromInitializer(~length=n, position => {
    let divisor = factorial(n - 1 - position)
    let digit = BigInt.toInt(rank.contents / divisor)
    rank := mod(rank.contents, divisor)
    takeAt(available, digit)
  })
}

let permRankWithParity = values =>
  range(Array.length(values) - 2)->Array.reduce(0n, (rank, i) =>
    rank * BigInt.fromInt(Array.length(values) - i) + BigInt.fromInt(smallerAfter(values, i))
  )

let permUnrankWithParity = (rank, n, parity) => {
  let available = ref(range(n))
  let rank = ref(rank)
  let out = Array.fromInitializer(~length=n - 2, _ => {
    let divisor = factorial(Array.length(available.contents) - 1) / 2n
    let digit = BigInt.toInt(rank.contents / divisor)
    rank := mod(rank.contents, divisor)
    takeAt(available, digit)
  })
  let direct = [...out, ...available.contents]
  permParity(direct) == parity
    ? direct
    : [...out, available.contents->get(1), available.contents->get(0)]
}

let orientationRank = (values, count, radix) => {
  let rank = ref(0n)
  let place = ref(1n)
  for i in 0 to count - 1 {
    rank := rank.contents + BigInt.fromInt(values->get(i)) * place.contents
    place := place.contents * BigInt.fromInt(radix)
  }
  rank.contents
}

let orientationUnrank = (rank, count, radix) => {
  let rank = ref(rank)
  let big = BigInt.fromInt(radix)
  let digits = Array.fromInitializer(~length=count, _ => {
    let digit = BigInt.toInt(mod(rank.contents, big))
    rank := rank.contents / big
    digit
  })
  [...digits, mod(radix - mod(sum(digits), radix), radix)]
}

let combRank = positions =>
  positions->Array.reduceWithIndex(0, (total, position, i) => total + choose(position, i + 1))

let combUnrank = (rank, k) => {
  let positions = Array.make(~length=k, 0)
  let rank = ref(rank)
  for i in k downto 1 {
    let c = ref(i - 1)
    while choose(c.contents + 1, i) <= rank.contents {
      c := c.contents + 1
    }
    positions->Array.setUnsafe(i - 1, c.contents)
    rank := rank.contents - choose(c.contents, i)
  }
  positions
}

let centreRank = values => {
  let remaining = ref(range(24))
  let rank = ref(0n)
  for color in 0 to 4 {
    let positions =
      remaining.contents
      ->Array.mapWithIndex((slot, i) => values->get(slot) == color ? Some(i) : None)
      ->Array.filterMap(x => x)
    rank :=
      rank.contents * BigInt.fromInt(choose(Array.length(remaining.contents), 4)) +
        BigInt.fromInt(combRank(positions))
    remaining := remaining.contents->Array.filter(slot => values->get(slot) != color)
  }
  rank.contents
}

let centreUnrank = rank => {
  let steps = [24, 20, 16, 12, 8]->Array.map(n => BigInt.fromInt(choose(n, 4)))
  let digits = Array.make(~length=5, 0)
  let rank = ref(rank)
  for i in 4 downto 0 {
    digits->Array.setUnsafe(i, BigInt.toInt(mod(rank.contents, steps->get(i))))
    rank := rank.contents / steps->get(i)
  }
  let remaining = ref(range(24))
  let colors = Array.make(~length=24, 5)
  for color in 0 to 4 {
    let picked = combUnrank(digits->get(color), 4)
    remaining.contents->Array.forEachWithIndex((slot, i) =>
      if picked->Array.includes(i) {
        colors->Array.setUnsafe(slot, color)
      }
    )
    remaining := remaining.contents->Array.filterWithIndex((_, i) => !(picked->Array.includes(i)))
  }
  colors
}

type coordinate =
  | Corner({pieces: array<int>, orientations: array<int>})
  | Midge({pieces: array<int>, orientations: array<int>})
  | Wing(array<int>)
  | Centre(array<int>)

type kind = CornerKind | MidgeKind | WingKind | CentreKind

let piecesOf = coordinate =>
  switch coordinate {
  | Corner({pieces}) | Midge({pieces}) | Wing(pieces) | Centre(pieces) => pieces
  }

let isPermutation = (pieces, n) =>
  Array.length(pieces) == n &&
    range(n)->Array.every(piece => pieces->Array.filter(x => x == piece)->Array.length == 1)

let validOrientations = (orientations, n, radix) =>
  Array.length(orientations) == n &&
  orientations->Array.every(x => x >= 0 && x < radix) &&
  mod(sum(orientations), radix) == 0

let validCoordinate = coordinate =>
  switch coordinate {
  | Centre(pieces) =>
    Array.length(pieces) == 24 &&
      range(6)->Array.every(color => pieces->Array.filter(x => x == color)->Array.length == 4)
  | Wing(pieces) => isPermutation(pieces, 24)
  | Corner({pieces, orientations}) =>
    isPermutation(pieces, 8) && validOrientations(orientations, 8, 3)
  | Midge({pieces, orientations}) =>
    isPermutation(pieces, 12) && validOrientations(orientations, 12, 2)
  }

// Midges only exist on odd cubes, whose corners already fix the midges'
// permutation parity.
let rankCoordinate = coordinate =>
  switch coordinate {
  | Centre(pieces) => centreRank(pieces)
  | Wing(pieces) => permRank(pieces)
  | Corner({pieces, orientations}) => permRank(pieces) * 2187n + orientationRank(orientations, 7, 3)
  | Midge({pieces, orientations}) =>
    permRankWithParity(pieces) * 2048n + orientationRank(orientations, 11, 2)
  }

let unrankCoordinate = (kind, rank, parity) =>
  switch kind {
  | CentreKind => Centre(centreUnrank(rank))
  | WingKind => Wing(permUnrank(rank, 24))
  | CornerKind =>
    Corner({
      pieces: permUnrank(rank / 2187n, 8),
      orientations: orientationUnrank(mod(rank, 2187n), 7, 3),
    })
  | MidgeKind =>
    Midge({
      pieces: permUnrankWithParity(rank / 2048n, 12, parity),
      orientations: orientationUnrank(mod(rank, 2048n), 11, 2),
    })
  }

let cornerTable = n =>
  n >= 6 ? large(n).corner : n == 4 ? T.cornerFacelet4 : n == 5 ? T.cornerFacelet5 : T.cornerFacelet
let edgeTable = n => n == 7 ? large7.midge : n == 5 ? T.midgeFacelet5 : T.edgeFacelet
let wingTable = (n, depth) =>
  n >= 6 ? large(n).wings->get(depth - 1) : n == 5 ? T.wingFacelet5 : T.wingFacelet4
let centreTables = n =>
  n >= 6 ? large(n).centres : n == 5 ? [T.xFacelet5, T.plusFacelet5] : [T.centreFacelet4]

// Which piece sits in each slot and how it is turned, or None when some slot
// shows no piece.
let readOriented = (fs, slots, colors) => {
  let found = slots->Array.map(indices => {
    let seen = indices->Array.map(at => fs->get(at))
    let size = Array.length(seen)
    let matches = (p, o) =>
      seen->Array.everyWithIndex((value, j) =>
        value == colors->get(p)->get(mod(j - o + size, size))
      )
    range(Array.length(colors))->Array.findMap(p =>
      range(size)->Array.find(o => matches(p, o))->Option.map(o => (p, o))
    )
  })
  found->Array.every(Option.isSome) ? Some(found->Array.filterMap(x => x)) : None
}

let readWing = (fs, slots) => {
  let pieces =
    slots->Array.map(indices =>
      T.wingColour4->Array.findIndex(colors =>
        colors->Array.everyWithIndex((value, j) => fs->get(indices->get(j)) == value)
      )
    )
  pieces->Array.includes(-1) ? None : Some(Wing(pieces))
}

let inflate2 = fs =>
  Array.fromInitializer(~length=54, i => {
    let face = i / 9
    let row = mod(i, 9) / 3
    let col = mod(i, 3)
    mod(row, 2) == 0 && mod(col, 2) == 0 ? fs->get(face * 4 + row / 2 * 2 + col / 2) : face
  })

let readCoordinates = (n, facelets) => {
  let fs = n == 2 ? inflate2(facelets) : facelets
  let oriented = (table, colors, make) =>
    readOriented(fs, table, colors)->Option.map(found =>
      make(found->Array.map(((p, _)) => p), found->Array.map(((_, o)) => o))
    )
  let corner = oriented(cornerTable(n), T.cornerColor, (pieces, orientations) => Corner({
    pieces,
    orientations,
  }))
  let midge = odd(n)
    ? oriented(edgeTable(n), T.edgeColor, (pieces, orientations) => Midge({
        pieces,
        orientations,
      }))->Option.map(midge => [midge])
    : Some([])
  let wings = n >= 4 ? range((n - 2) / 2)->Array.map(i => readWing(fs, wingTable(n, i + 1))) : []
  let centreCoords =
    n >= 4 ? centreTables(n)->Array.map(table => Centre(table->Array.map(at => fs->get(at)))) : []
  switch (corner, midge) {
  | (Some(corner), Some(midge)) if wings->Array.every(Option.isSome) =>
    let coords = [corner, ...midge, ...wings->Array.filterMap(x => x), ...centreCoords]
    let parityAgrees = switch midge {
    | [midge] => permParity(piecesOf(corner)) == permParity(piecesOf(midge))
    | _ => true
    }
    coords->Array.every(validCoordinate) && parityAgrees ? Some(coords) : None
  | _ => None
  }
}

let placeOriented = (fs, pieces, orientations, slots, colors) =>
  slots->Array.forEachWithIndex((indices, slot) =>
    colors
    ->get(pieces->get(slot))
    ->Array.forEachWithIndex((color, j) =>
      fs->Array.setUnsafe(
        indices->get(mod(j + orientations->get(slot), Array.length(indices))),
        color,
      )
    )
  )

let writeCoordinates = (n, coords) => {
  let side = n == 2 ? 3 : n
  let fs = Array.fromInitializer(~length=6 * side * side, i => i / (side * side))
  coords->Array.forEach(coordinate =>
    switch coordinate {
    | Corner({pieces, orientations}) =>
      placeOriented(fs, pieces, orientations, cornerTable(n), T.cornerColor)
    | Midge({pieces, orientations}) =>
      placeOriented(fs, pieces, orientations, edgeTable(n), T.edgeColor)
    | Wing(_) | Centre(_) => ()
    }
  )
  let next = ref(odd(n) ? 2 : 1)
  if n >= 4 {
    for depth in 1 to (n - 2) / 2 {
      let pieces = piecesOf(coords->get(next.contents))
      wingTable(n, depth)->Array.forEachWithIndex((indices, slot) =>
        T.wingColour4
        ->get(pieces->get(slot))
        ->Array.forEachWithIndex((color, j) => fs->Array.setUnsafe(indices->get(j), color))
      )
      next := next.contents + 1
    }
    centreTables(n)->Array.forEach(table => {
      let pieces = piecesOf(coords->get(next.contents))
      table->Array.forEachWithIndex((at, slot) => fs->Array.setUnsafe(at, pieces->get(slot)))
      next := next.contents + 1
    })
  }
  n != 2
    ? fs
    : Array.fromInitializer(~length=24, i => {
        let face = i / 4
        let row = mod(i, 4) / 2
        let col = mod(i, 2)
        fs->get(face * 9 + row * 6 + col * 2)
      })
}

// A sticker as its cubie coordinates and outward normal.
type sticker = (int, int, int, int, int, int)

let stickerAt = (n, index): sticker => {
  let last = n - 1
  let face = index / (n * n)
  let row = mod(index, n * n) / n
  let col = mod(index, n)
  switch face {
  | 0 => (col, last, row, 0, 1, 0)
  | 1 => (last, last - row, last - col, 1, 0, 0)
  | 2 => (col, last - row, last, 0, 0, 1)
  | 3 => (col, 0, last - row, 0, -1, 0)
  | 4 => (0, last - row, col, -1, 0, 0)
  | _ => (last - col, last - row, 0, 0, 0, -1)
  }
}

let indexOfSticker = (n, (x, y, z, nx, ny, nz): sticker) => {
  let last = n - 1
  if ny == 1 {
    z * n + x
  } else if ny == -1 {
    3 * n * n + (last - z) * n + x
  } else if nz == 1 {
    2 * n * n + (last - y) * n + x
  } else if nz == -1 {
    5 * n * n + (last - y) * n + last - x
  } else if nx == 1 {
    n * n + (last - y) * n + last - z
  } else {
    4 * n * n + (last - y) * n + z
  }
}

let rotate = (n, sticker: sticker, axis, turns) => {
  let result = ref(sticker)
  for _ in 1 to turns {
    let (x, y, z, nx, ny, nz) = result.contents
    result :=
      switch axis {
      | #x => (x, z, n - 1 - y, nx, nz, -ny)
      | #z => (y, n - 1 - x, z, ny, -nx, nz)
      | #y => (n - 1 - z, y, x, -nz, ny, nx)
      }
  }
  result.contents
}

// The whole-cube turns (about x, z, y) of one of the 24 frames.
let frameTurns = rank =>
  rank < 16 ? (rank / 4, 0, mod(rank, 4)) : (0, rank < 20 ? 1 : 3, mod(rank, 4))

let transform = (n, fs, rank, inverse) => {
  let (x, z, y) = frameTurns(rank)
  fs->Array.mapWithIndex((_, index) => {
    let sticker = stickerAt(n, index)
    let sticker = inverse
      ? sticker->rotate(n, _, #x, x)->rotate(n, _, #z, z)->rotate(n, _, #y, y)
      : sticker
        ->rotate(n, _, #y, mod(4 - y, 4))
        ->rotate(n, _, #z, mod(4 - z, 4))
        ->rotate(n, _, #x, mod(4 - x, 4))
    fs->get(indexOfSticker(n, sticker))
  })
}

let parseFacelets = text => {
  let blocks =
    text->String.trim->String.toUpperCase->String.splitByRegExp(/\s+/)->Array.filterMap(x => x)
  let first = blocks[0]->Option.getOr("")
  let n = first->String.length->Int.toFloat->Math.sqrt->Float.toInt
  let valid =
    Array.length(blocks) == 6 &&
    n * n == String.length(first) &&
    widthOf(n)->Option.isSome &&
    blocks->Array.every(block =>
      String.length(block) == n * n &&
        block->String.split("")->Array.every(letter => faceLetters->String.includes(letter))
    )
  if !valid {
    None
  } else {
    let values =
      blocks
      ->Array.join("")
      ->String.split("")
      ->Array.map(letter => faceLetters->String.indexOf(letter))
    range(6)->Array.every(color =>
      values->Array.filter(value => value == color)->Array.length == n * n
    )
      ? Some((n, values))
      : None
  }
}

let formatFacelets = (n, values) =>
  range(6)
  ->Array.map(face =>
    values
    ->Array.slice(~start=face * n * n, ~end=(face + 1) * n * n)
    ->Array.map(value => faceLetters->String.charAt(value))
    ->Array.join("")
  )
  ->Array.join(" ")

let toBase64 = (value, width) => {
  let out = ref("")
  let value = ref(value)
  for _ in 1 to width {
    out := alphabet->String.charAt(BigInt.toInt(mod(value.contents, 64n))) ++ out.contents
    value := value.contents / 64n
  }
  out.contents
}

let fromBase64 = token =>
  token
  ->String.split("")
  ->Array.reduce(Some(0n), (value, char) => {
    let digit = alphabet->String.indexOf(char)
    switch value {
    | Some(value) if digit >= 0 => Some(value * 64n + BigInt.fromInt(digit))
    | _ => None
    }
  })

let tokenPattern = RegExp.fromString("^[A-Za-z0-9_-]+$")

let looksLikeOrbit64StateToken = input => {
  let token = String.trim(input)
  tokenPattern->RegExp.test(token) &&
    widths->Array.some(((_, width)) => width == String.length(token))
}

let encode = facelets =>
  parseFacelets(facelets)->Option.flatMap(((n, values)) => {
    let centre = n * n / 2
    let frame = odd(n)
      ? range(24)->Array.find(i => {
          let unrotated = transform(n, values, i, true)
          range(6)->Array.every(face => unrotated->get(face * n * n + centre) == face)
        })
      : Some(0)
    frame->Option.flatMap(frame => {
      let canonical = odd(n) ? transform(n, values, frame, true) : values
      readCoordinates(n, canonical)->Option.map(
        coords => {
          let steps = radices(n)
          let rank =
            coords->Array.reduceWithIndex(
              0n,
              (rank, coordinate, i) => rank * steps->get(i) + rankCoordinate(coordinate),
            )
          let rank = rank * (odd(n) ? 24n : 1n) + BigInt.fromInt(frame)
          toBase64(rank, widthOf(n)->Option.getOr(0))
        },
      )
    })
  })

let decode = token => {
  let size = widths->Array.find(((_, width)) => width == String.length(token))
  switch (size, fromBase64(token)) {
  | (Some((n, _)), Some(rank)) if rank < stateCount(n) =>
    let frame = odd(n) ? BigInt.toInt(mod(rank, 24n)) : 0
    let rank = ref(odd(n) ? rank / 24n : rank)
    let kinds = [
      CornerKind,
      ...odd(n) ? [MidgeKind] : [],
      ...Array.make(~length=(n - 2) / 2, WingKind),
      ...Array.make(~length=(n - 2) * (n - 2) / 4, CentreKind),
    ]
    let steps = radices(n)
    let values = Array.make(~length=Array.length(kinds), 0n)
    for i in Array.length(kinds) - 1 downto 0 {
      values->Array.setUnsafe(i, mod(rank.contents, steps->get(i)))
      rank := rank.contents / steps->get(i)
    }
    let cornerParity = permParity(permUnrank(values->get(0) / 2187n, 8))
    let coords =
      kinds->Array.mapWithIndex((kind, i) =>
        unrankCoordinate(kind, values->get(i), kind == MidgeKind ? cornerParity : 0)
      )
    let canonical = writeCoordinates(n, coords)
    Some(formatFacelets(n, odd(n) ? transform(n, canonical, frame, false) : canonical))
  | _ => None
  }
}

let encodeOrbit64State = facelets => Null.fromOption(encode(facelets))
let decodeOrbit64State = token => Null.fromOption(decode(token))

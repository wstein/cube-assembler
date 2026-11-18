// Coordinate arithmetic shared by the Orbit64 V2 codec (Orbit64V2.res): ranks
// and unranks of permutations, orientations and center colorings, and the
// base64url digits of a token. Slot convention and format: flix-orbit64
// (Apache-2.0).

let alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"

let range = count => Array.fromInitializer(~length=count, i => i)
let get = (values, i) => values->Array.getUnsafe(i)
let sum = values => values->Array.reduce(0, (a, b) => a + b)

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

let centerRank = values => {
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

let centerUnrank = rank => {
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

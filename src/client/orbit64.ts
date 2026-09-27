// Browser port of the Orbit64 state/facelet boundary for 2×2–5×5 cubes.
// Format and slot convention: flix-orbit64@6aedfc1 (Apache-2.0).
// The app deliberately handles state tokens only; move and algorithm tokens are
// different Orbit64 classes.
import { orbit64Tables as t } from './orbit64Tables'

const alphabet =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
const faces = 'URFDLB'
const widths: Record<number, number> = { 2: 5, 3: 12, 4: 27, 5: 43 }
const factorial = (n: number): bigint => {
  let out = 1n
  for (let i = 2; i <= n; i++) out *= BigInt(i)
  return out
}
const choose = (n: number, k: number): number => {
  if (k < 0 || k > n) return 0
  let out = 1
  for (let i = 1; i <= k; i++) out = (out * (n - i + 1)) / i
  return out
}
const cornerRadix = factorial(8) * 3n ** 7n
const midgeRadix = (factorial(12) * 2n ** 11n) / 2n
const wingRadix = factorial(24)
const centreRadix = BigInt(
  [24, 20, 16, 12, 8].reduce((n, slots) => n * choose(slots, 4), 1),
)
const radices: Record<number, bigint[]> = {
  2: [cornerRadix],
  3: [cornerRadix, midgeRadix],
  4: [cornerRadix, wingRadix, centreRadix],
  5: [cornerRadix, midgeRadix, wingRadix, centreRadix, centreRadix],
}
const stateCount = (n: number): bigint =>
  radices[n].reduce((a, b) => a * b, n % 2 ? 24n : 1n)

const permRank = (values: number[]): bigint => {
  let rank = 0n
  for (let i = 0; i < values.length; i++) {
    let smaller = 0
    for (let j = i + 1; j < values.length; j++)
      if (values[j] < values[i]) smaller++
    rank = rank * BigInt(values.length - i) + BigInt(smaller)
  }
  return rank
}
const permParity = (values: number[]): number => {
  let inversions = 0
  for (let i = 0; i < values.length; i++)
    for (let j = i + 1; j < values.length; j++)
      if (values[i] > values[j]) inversions++
  return inversions % 2
}
const permUnrank = (rank: bigint, n: number): number[] => {
  const available = Array.from({ length: n }, (_, i) => i)
  const out: number[] = []
  for (let i = n - 1; i >= 0; i--) {
    const divisor = factorial(i)
    const digit = Number(rank / divisor)
    rank %= divisor
    out.push(available.splice(digit, 1)[0])
  }
  return out
}
const permRankWithParity = (values: number[]): bigint => {
  let rank = 0n
  for (let i = 0; i < values.length - 2; i++) {
    let smaller = 0
    for (let j = i + 1; j < values.length; j++)
      if (values[j] < values[i]) smaller++
    rank = rank * BigInt(values.length - i) + BigInt(smaller)
  }
  return rank
}
const permUnrankWithParity = (
  rank: bigint,
  n: number,
  parity: number,
): number[] => {
  const available = Array.from({ length: n }, (_, i) => i)
  const out: number[] = []
  while (available.length > 2) {
    const divisor = factorial(available.length - 1) / 2n
    const digit = Number(rank / divisor)
    rank %= divisor
    out.push(available.splice(digit, 1)[0])
  }
  const direct = [...out, ...available]
  return permParity(direct) === parity
    ? direct
    : [...out, available[1], available[0]]
}
const orientationRank = (
  values: number[],
  count: number,
  radix: number,
): bigint => {
  let rank = 0n
  let place = 1n
  for (let i = 0; i < count; i++) {
    rank += BigInt(values[i]) * place
    place *= BigInt(radix)
  }
  return rank
}
const orientationUnrank = (
  rank: bigint,
  count: number,
  radix: number,
): number[] => {
  const digits: number[] = []
  for (let i = 0; i < count; i++) {
    digits.push(Number(rank % BigInt(radix)))
    rank /= BigInt(radix)
  }
  digits.push((radix - (digits.reduce((a, b) => a + b, 0) % radix)) % radix)
  return digits
}
const combRank = (positions: number[]): number =>
  positions.reduce((sum, position, i) => sum + choose(position, i + 1), 0)
const combUnrank = (rank: number, k: number): number[] => {
  const positions = Array<number>(k)
  for (let i = k; i > 0; i--) {
    let c = i - 1
    while (choose(c + 1, i) <= rank) c++
    positions[i - 1] = c
    rank -= choose(c, i)
  }
  return positions
}
const centreRank = (values: number[]): bigint => {
  let remaining = Array.from({ length: 24 }, (_, i) => i)
  let rank = 0n
  for (let color = 0; color < 5; color++) {
    const positions = remaining.flatMap((slot, i) =>
      values[slot] === color ? [i] : [],
    )
    rank =
      rank * BigInt(choose(remaining.length, 4)) + BigInt(combRank(positions))
    remaining = remaining.filter((slot) => values[slot] !== color)
  }
  return rank
}
const centreUnrank = (rank: bigint): number[] => {
  const radices = [24, 20, 16, 12, 8].map((n) => BigInt(choose(n, 4)))
  const digits = Array<number>(5)
  for (let i = 4; i >= 0; i--) {
    digits[i] = Number(rank % radices[i])
    rank /= radices[i]
  }
  let remaining = Array.from({ length: 24 }, (_, i) => i)
  const colors = Array<number>(24).fill(5)
  for (let color = 0; color < 5; color++) {
    const picked = new Set(combUnrank(digits[color], 4))
    remaining.forEach((slot, i) => {
      if (picked.has(i)) colors[slot] = color
    })
    remaining = remaining.filter((_, i) => !picked.has(i))
  }
  return colors
}

type Coordinate = {
  kind: 'corner' | 'midge' | 'wing' | 'centre'
  pieces: number[]
  orientations?: number[]
}
const validCoordinate = (coord: Coordinate): boolean => {
  const { kind, pieces, orientations } = coord
  if (kind === 'centre')
    return (
      pieces.length === 24 &&
      [0, 1, 2, 3, 4, 5].every(
        (color) => pieces.filter((x) => x === color).length === 4,
      )
    )
  const n = kind === 'corner' ? 8 : kind === 'midge' ? 12 : 24
  if (
    pieces.length !== n ||
    new Set(pieces).size !== n ||
    pieces.some((x) => x < 0 || x >= n)
  )
    return false
  if (kind === 'wing') return true
  const radix = kind === 'corner' ? 3 : 2
  return (
    orientations?.length === n &&
    orientations.every((x) => x >= 0 && x < radix) &&
    orientations.reduce((a, b) => a + b, 0) % radix === 0
  )
}
const rankCoordinate = (coord: Coordinate, oddMidge: boolean): bigint => {
  if (coord.kind === 'centre') return centreRank(coord.pieces)
  if (coord.kind === 'wing') return permRank(coord.pieces)
  if (coord.kind === 'corner')
    return (
      permRank(coord.pieces) * 2187n +
      orientationRank(coord.orientations!, 7, 3)
    )
  return (
    (oddMidge ? permRankWithParity(coord.pieces) : permRank(coord.pieces)) *
      2048n +
    orientationRank(coord.orientations!, 11, 2)
  )
}
const unrankCoordinate = (
  kind: Coordinate['kind'],
  rank: bigint,
  parity = 0,
): Coordinate => {
  if (kind === 'centre') return { kind, pieces: centreUnrank(rank) }
  if (kind === 'wing') return { kind, pieces: permUnrank(rank, 24) }
  if (kind === 'corner')
    return {
      kind,
      pieces: permUnrank(rank / 2187n, 8),
      orientations: orientationUnrank(rank % 2187n, 7, 3),
    }
  return {
    kind,
    pieces: permUnrankWithParity(rank / 2048n, 12, parity),
    orientations: orientationUnrank(rank % 2048n, 11, 2),
  }
}

const cornerColors = t.cornerColor
const edgeColors = t.edgeColor
const wingColors = t.wingColour4
const cornerTable = (n: number): readonly (readonly number[])[] =>
  n === 4 ? t.cornerFacelet4 : n === 5 ? t.cornerFacelet5 : t.cornerFacelet
const edgeTable = (n: number): readonly (readonly number[])[] =>
  n === 5 ? t.midgeFacelet5 : t.edgeFacelet
const wingTable = (n: number): readonly (readonly number[])[] =>
  n === 5 ? t.wingFacelet5 : t.wingFacelet4
const readOriented = (
  fs: number[],
  slots: readonly (readonly number[])[],
  colors: readonly (readonly number[])[],
  kind: 'corner' | 'midge',
): Coordinate | null => {
  const pieces: number[] = []
  const orientations: number[] = []
  for (const indices of slots) {
    const seen = indices.map((at) => fs[at])
    let found = false
    for (let p = 0; p < colors.length && !found; p++)
      for (let o = 0; o < seen.length; o++) {
        if (
          seen.every(
            (value, j) =>
              value === colors[p][(j - o + seen.length) % seen.length],
          )
        ) {
          pieces.push(p)
          orientations.push(o)
          found = true
          break
        }
      }
    if (!found) return null
  }
  return { kind, pieces, orientations }
}
const readWing = (
  fs: number[],
  slots: readonly (readonly number[])[],
): Coordinate | null => {
  const pieces = slots.map((indices) =>
    wingColors.findIndex((colors) =>
      colors.every((value, j) => fs[indices[j]] === value),
    ),
  )
  return pieces.includes(-1) ? null : { kind: 'wing', pieces }
}
const readCentre = (fs: number[], slots: readonly number[]): Coordinate => ({
  kind: 'centre',
  pieces: slots.map((at) => fs[at]),
})
const inflate2 = (fs: number[]): number[] =>
  Array.from({ length: 54 }, (_, i) => {
    const face = Math.floor(i / 9),
      row = Math.floor((i % 9) / 3),
      col = i % 3
    return row % 2 === 0 && col % 2 === 0
      ? fs[face * 4 + (row / 2) * 2 + col / 2]
      : face
  })
const readCoordinates = (
  n: number,
  facelets: number[],
): Coordinate[] | null => {
  const fs = n === 2 ? inflate2(facelets) : facelets
  const corner = readOriented(fs, cornerTable(n), cornerColors, 'corner')
  if (!corner) return null
  const out: Coordinate[] = [corner]
  if (n % 2) {
    const midge = readOriented(fs, edgeTable(n), edgeColors, 'midge')
    if (!midge) return null
    out.push(midge)
  }
  if (n >= 4) {
    const wing = readWing(fs, wingTable(n))
    if (!wing) return null
    out.push(wing)
    out.push(readCentre(fs, n === 4 ? t.centreFacelet4 : t.xFacelet5))
    if (n === 5) out.push(readCentre(fs, t.plusFacelet5))
  }
  if (!out.every(validCoordinate)) return null
  if (n % 2 && permParity(out[0].pieces) !== permParity(out[1].pieces))
    return null
  return out
}
const placeOriented = (
  fs: number[],
  coord: Coordinate,
  slots: readonly (readonly number[])[],
  colors: readonly (readonly number[])[],
) => {
  slots.forEach((indices, slot) =>
    colors[coord.pieces[slot]].forEach((color, j) => {
      fs[indices[(j + coord.orientations![slot]) % indices.length]] = color
    }),
  )
}
const writeCoordinates = (n: number, coords: Coordinate[]): number[] => {
  const side = n === 2 ? 3 : n
  const fs = Array.from({ length: 6 * side * side }, (_, i) =>
    Math.floor(i / (side * side)),
  )
  placeOriented(fs, coords[0], cornerTable(n), cornerColors)
  let next = 1
  if (n % 2) placeOriented(fs, coords[next++], edgeTable(n), edgeColors)
  if (n >= 4) {
    wingTable(n).forEach((indices, slot) =>
      wingColors[coords[next].pieces[slot]].forEach((color, j) => {
        fs[indices[j]] = color
      }),
    )
    next++
    const centreTables =
      n === 4 ? [t.centreFacelet4] : [t.xFacelet5, t.plusFacelet5]
    centreTables.forEach((table) => {
      table.forEach((at, slot) => {
        fs[at] = coords[next].pieces[slot]
      })
      next++
    })
  }
  if (n !== 2) return fs
  return Array.from({ length: 24 }, (_, i) => {
    const face = Math.floor(i / 4),
      row = Math.floor((i % 4) / 2),
      col = i % 2
    return fs[face * 9 + row * 6 + col * 2]
  })
}

type Sticker = [number, number, number, number, number, number]
const stickerAt = (n: number, index: number): Sticker => {
  const last = n - 1,
    face = Math.floor(index / (n * n)),
    row = Math.floor((index % (n * n)) / n),
    col = index % n
  if (face === 0) return [col, last, row, 0, 1, 0]
  if (face === 1) return [last, last - row, last - col, 1, 0, 0]
  if (face === 2) return [col, last - row, last, 0, 0, 1]
  if (face === 3) return [col, 0, last - row, 0, -1, 0]
  if (face === 4) return [0, last - row, col, -1, 0, 0]
  return [last - col, last - row, 0, 0, 0, -1]
}
const indexOfSticker = (n: number, [x, y, z, nx, ny, nz]: Sticker): number => {
  const last = n - 1
  if (ny === 1) return z * n + x
  if (ny === -1) return 3 * n * n + (last - z) * n + x
  if (nz === 1) return 2 * n * n + (last - y) * n + x
  if (nz === -1) return 5 * n * n + (last - y) * n + last - x
  if (nx === 1) return n * n + (last - y) * n + last - z
  return 4 * n * n + (last - y) * n + z
}
const rotate = (
  n: number,
  s: Sticker,
  axis: 'x' | 'y' | 'z',
  turns: number,
): Sticker => {
  let result = s
  for (let i = 0; i < turns; i++) {
    const [x, y, z, nx, ny, nz] = result
    result =
      axis === 'x'
        ? [x, z, n - 1 - y, nx, nz, -ny]
        : axis === 'z'
          ? [y, n - 1 - x, z, ny, -nx, nz]
          : [n - 1 - z, y, x, -nz, ny, nx]
  }
  return result
}
const frameTurns = (rank: number): [number, number, number] =>
  rank < 16
    ? [Math.floor(rank / 4), 0, rank % 4]
    : [0, rank < 20 ? 1 : 3, rank % 4]
const transform = (
  n: number,
  fs: number[],
  rank: number,
  inverse: boolean,
): number[] => {
  const [x, z, y] = frameTurns(rank)
  return fs.map((_, index) => {
    let sticker = stickerAt(n, index)
    if (inverse) {
      sticker = rotate(n, sticker, 'x', x)
      sticker = rotate(n, sticker, 'z', z)
      sticker = rotate(n, sticker, 'y', y)
    } else {
      sticker = rotate(n, sticker, 'y', (4 - y) % 4)
      sticker = rotate(n, sticker, 'z', (4 - z) % 4)
      sticker = rotate(n, sticker, 'x', (4 - x) % 4)
    }
    return fs[indexOfSticker(n, sticker)]
  })
}
const parseFacelets = (
  text: string,
): { n: number; values: number[] } | null => {
  const blocks = text.trim().toUpperCase().split(/\s+/)
  if (blocks.length !== 6) return null
  const n = Math.sqrt(blocks[0].length)
  if (
    !widths[n] ||
    !blocks.every(
      (block) =>
        block.length === n * n &&
        [...block].every((letter) => faces.includes(letter)),
    )
  )
    return null
  const values = [...blocks.join('')].map((letter) => faces.indexOf(letter))
  if (
    ![0, 1, 2, 3, 4, 5].every(
      (color) => values.filter((value) => value === color).length === n * n,
    )
  )
    return null
  return { n, values }
}
const formatFacelets = (n: number, values: number[]): string =>
  Array.from({ length: 6 }, (_, face) =>
    values
      .slice(face * n * n, (face + 1) * n * n)
      .map((value) => faces[value])
      .join(''),
  ).join(' ')
const toBase64 = (value: bigint, width: number): string => {
  let out = ''
  for (let i = 0; i < width; i++) {
    out = alphabet[Number(value % 64n)] + out
    value /= 64n
  }
  return out
}
const fromBase64 = (token: string): bigint | null => {
  let value = 0n
  for (const char of token) {
    const digit = alphabet.indexOf(char)
    if (digit < 0) return null
    value = value * 64n + BigInt(digit)
  }
  return value
}

export function looksLikeOrbit64StateToken(input: string): boolean {
  const token = input.trim()
  return (
    /^[A-Za-z0-9_-]+$/.test(token) &&
    Object.values(widths).includes(token.length)
  )
}

export function encodeOrbit64State(facelets: string): string | null {
  const parsed = parseFacelets(facelets)
  if (!parsed) return null
  const { n, values } = parsed
  let frame = 0
  let canonical = values
  if (n % 2) {
    const center = Math.floor((n * n) / 2)
    frame =
      Array.from({ length: 24 }, (_, i) => i).find((i) => {
        const unrotated = transform(n, values, i, true)
        return Array.from(
          { length: 6 },
          (_, face) => unrotated[face * n * n + center] === face,
        ).every(Boolean)
      }) ?? -1
    if (frame < 0) return null
    canonical = transform(n, values, frame, true)
  }
  const coords = readCoordinates(n, canonical)
  if (!coords) return null
  let rank = 0n
  coords.forEach((coord, i) => {
    rank = rank * radices[n][i] + rankCoordinate(coord, n % 2 === 1 && i === 1)
  })
  rank = rank * BigInt(n % 2 ? 24 : 1) + BigInt(frame)
  return toBase64(rank, widths[n])
}

export function decodeOrbit64State(token: string): string | null {
  const n = Number(
    Object.keys(widths).find((size) => widths[Number(size)] === token.length),
  )
  if (!n) return null
  let rank = fromBase64(token)
  if (rank === null || rank >= stateCount(n)) return null
  const frame = n % 2 ? Number(rank % 24n) : 0
  if (n % 2) rank /= 24n
  const kinds: Coordinate['kind'][] =
    n === 2
      ? ['corner']
      : n === 3
        ? ['corner', 'midge']
        : n === 4
          ? ['corner', 'wing', 'centre']
          : ['corner', 'midge', 'wing', 'centre', 'centre']
  const values = Array<bigint>(kinds.length)
  for (let i = kinds.length - 1; i >= 0; i--) {
    values[i] = rank % radices[n][i]
    rank /= radices[n][i]
  }
  const coords = kinds.map((kind, i) =>
    unrankCoordinate(
      kind,
      values[i],
      kind === 'midge' ? permParity(permUnrank(values[0] / 2187n, 8)) : 0,
    ),
  )
  const canonical = writeCoordinates(n, coords)
  return formatFacelets(
    n,
    n % 2 ? transform(n, canonical, frame, false) : canonical,
  )
}

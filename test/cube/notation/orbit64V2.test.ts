import { describe, expect, it } from 'vitest'
import {
  decodeOrbit64V2State,
  encodeOrbit64V2State,
  type Orbit64V2Cube,
  orbit64V2Entries,
  orbit64V2Entry,
  orbit64V2Solved,
  orbit64V2StateCount,
} from '../../../src/cube/notation/orbit64V2'
import v1Examples from './orbit64Vectors.json'
import v1LargeExamples from './orbit64LargeVectors.json'
import fixture from './orbit64V2Vectors.json'

// The table of FORMAT-V2.md, copied by scripts/orbit64V2Fixture.mjs.
const table = fixture.registry

const factorial = (k: bigint): bigint => (k <= 1n ? 1n : k * factorial(k - 1n))

// N_i from the digit layout of FORMAT-V2.md, not from the implementation.
function expectedCount(
  n: number,
  model: 'Color' | 'Picture',
  pose: 'Canonical' | 'Framed',
): bigint {
  const odd = n % 2 === 1
  const centerOrbits = BigInt(Math.floor(((n - 2) * (n - 2)) / 4))
  const center =
    model === 'Color'
      ? factorial(24n) / factorial(4n) ** 6n
      : factorial(24n) / 2n
  let count =
    !odd && pose === 'Canonical'
      ? factorial(7n) * 3n ** 6n
      : factorial(8n) * 3n ** 7n
  if (odd) count *= (factorial(12n) / 2n) * 2n ** 11n
  count *= factorial(24n) ** BigInt(Math.floor((n - 2) / 2))
  count *= center ** centerOrbits
  if (odd && model === 'Picture') count *= 2n ** 11n
  if (odd && pose === 'Framed') count *= 24n
  return count
}

// The allocation rule of FORMAT-V2.md applied to those counts.
const expectedCounts: bigint[] = []
const expectedPlacement: { length: number; offset: bigint }[] = []
{
  const used = new Map<number, bigint>()
  for (const e of orbit64V2Entries) {
    const count = expectedCount(e.n, e.model, e.pose)
    let length = 1
    while ((used.get(length) ?? 0n) + count > 64n ** BigInt(length)) length++
    expectedCounts.push(count)
    expectedPlacement.push({ length, offset: used.get(length) ?? 0n })
    used.set(length, (used.get(length) ?? 0n) + count)
  }
}

// "d.ddde+XX" of a positive integer, rounded half up like the proof report.
function scientific(value: bigint): string {
  const digits = value.toString()
  const lead = BigInt(digits.slice(0, 5).padEnd(5, '0'))
  const rounded = (lead + 5n) / 10n
  const exponent = digits.length - 1 + (rounded === 10000n ? 1 : 0)
  const mantissa = (rounded === 10000n ? 1000n : rounded).toString()
  return `${mantissa[0]}.${mantissa.slice(1)}e+${String(exponent).padStart(2, '0')}`
}

function bits(value: bigint): string {
  const digits = value.toString()
  const head = Number(digits.slice(0, 15))
  const log2 = Math.log2(head) + (digits.length - 15) * Math.log2(10)
  return (digits.length <= 15 ? Math.log2(Number(value)) : log2).toFixed(2)
}

describe('Orbit64 V2 registry', () => {
  it('has the 54 entries of the initial registry in ID order', () => {
    expect(orbit64V2Entries).toHaveLength(54)
    expect(table).toHaveLength(54)
    expect(orbit64V2Entries.map((e) => e.id)).toEqual(table.map((r) => r.id))
  })

  it('names the cube size, sticker model and pose of every entry', () => {
    for (const [i, e] of orbit64V2Entries.entries()) {
      const model = e.model === 'Color' ? 'color' : 'picture'
      const pose = e.pose === 'Canonical' ? 'canonical' : 'framed'
      expect(`${e.n}x${e.n}x${e.n} ${model} ${pose}`).toBe(table[i].type)
    }
    // A 2x2x2 has no centers, so it has no picture entries.
    expect(orbit64V2Entries.filter((e) => e.n === 2)).toHaveLength(2)
  })

  it('computes the token lengths of the specification', () => {
    expect(orbit64V2Entries.map((e) => e.length)).toEqual(
      table.map((r) => r.length),
    )
  })

  it('computes the offsets of the specification', () => {
    const nonzero = orbit64V2Entries.filter((e) => e.offset !== 0n)
    expect(nonzero.map((e) => e.id)).toEqual([11, 17, 21, 25, 39, 53])
    for (const [i, e] of orbit64V2Entries.entries()) {
      const after = table[i].offset
      // "N_10": the entry starts after the states of entry 10.
      const expected = after === 0 ? 0n : expectedCounts[after]
      expect(e.offset).toBe(expected)
    }
  })

  it('computes the state counts and bits of the specification', () => {
    for (const [i, e] of orbit64V2Entries.entries()) {
      expect(scientific(e.count)).toBe(table[i].states)
      expect(bits(e.count)).toBe(table[i].bits)
      expect(orbit64V2StateCount(e.n, e.model, e.pose)).toBe(e.count)
    }
  })

  it('keeps ranges disjoint and inside the length', () => {
    for (const a of orbit64V2Entries) {
      expect(a.offset + a.count).toBeLessThanOrEqual(64n ** BigInt(a.length))
      for (const b of orbit64V2Entries) {
        if (a.id < b.id && a.length === b.length) {
          expect(a.offset + a.count).toBeLessThanOrEqual(b.offset)
        }
      }
    }
  })

  it('places every entry by the allocation rule on independent counts', () => {
    for (const [i, e] of orbit64V2Entries.entries()) {
      expect(e.count).toBe(expectedCounts[i])
      expect({ length: e.length, offset: e.offset }).toEqual(
        expectedPlacement[i],
      )
    }
  })

  it("starts the V2 color framed entries at V1's token widths", () => {
    // V1's token widths 5, 12, 27, 66 and 90 are the V2 color framed lengths.
    for (const [n, length] of [
      [2, 5],
      [3, 12],
      [4, 27],
      [6, 66],
      [7, 90],
    ]) {
      const e = orbit64V2Entries.find(
        (o) => o.n === n && o.model === 'Color' && o.pose === 'Framed',
      )
      expect(e?.length).toBe(length)
      expect(e?.offset).toBe(0n)
    }
  })

  it('looks entries up by ID', () => {
    expect(orbit64V2Entry(3)).toEqual(orbit64V2Entries[3])
    expect(orbit64V2Entry(-1)).toBeUndefined()
    expect(orbit64V2Entry(54)).toBeUndefined()
    expect(orbit64V2Entry(1.5)).toBeUndefined()
  })
})

const alphabet =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

function tokenOf(value: bigint, length: number): string {
  let out = ''
  let rest = value
  for (let i = 0; i < length; i++) {
    out = alphabet[Number(rest % 64n)] + out
    rest /= 64n
  }
  return out
}

// "key=v,v,...;key=..." with keys cp ct mp mf w1.. z1.. fr fm.
function parseCube(text: string): Orbit64V2Cube {
  const fields = new Map<string, number[]>()
  for (const field of text.split(';')) {
    const [key, value] = field.split('=')
    fields.set(key, value === '' ? [] : value.split(',').map(Number))
  }
  const get = (key: string) => fields.get(key) ?? []
  const numbered = (prefix: string) =>
    [...fields.keys()]
      .filter((key) => /^[wz]\d+$/.test(key) && key.startsWith(prefix))
      .sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)))
      .map(get)
  return {
    cornerPieces: get('cp'),
    cornerTwists: get('ct'),
    midgePieces: get('mp'),
    midgeFlips: get('mf'),
    wings: numbered('w'),
    centers: numbered('z'),
    rotations: get('fr'),
    frame: get('fm')[0] ?? 0,
  }
}

function ok<T>(result: { TAG: 'Ok'; _0: T } | { TAG: 'Error'; _0: string }): T {
  if (result.TAG !== 'Ok') throw new Error(result._0)
  return result._0
}

describe('Orbit64 V2 reference vectors', () => {
  it('has the 195 rows of the reference repository', () => {
    expect(fixture.vectors).toHaveLength(195)
    expect(new Set(fixture.vectors.map((row) => row.id)).size).toBe(54)
  })

  it('encodes every vector state to its token', () => {
    for (const { id, state, token } of fixture.vectors) {
      expect(
        encodeOrbit64V2State(id, parseCube(state)),
        `${id} ${token}`,
      ).toEqual({ TAG: 'Ok', _0: token })
    }
  })

  it('decodes every vector token to its entry and state', () => {
    for (const { id, state, token } of fixture.vectors) {
      const decoded = ok(decodeOrbit64V2State(token))
      expect(decoded.entry.id, token).toBe(id)
      expect(decoded.cube, token).toEqual(parseCube(state))
    }
  })

  it('writes every token at the length of its entry', () => {
    for (const { id, token } of fixture.vectors) {
      expect(token).toHaveLength(orbit64V2Entries[id].length)
    }
  })
})

describe('Orbit64 V2 ranking', () => {
  it('writes solved states as the zero rank of their entry', () => {
    for (const e of orbit64V2Entries) {
      const solved = orbit64V2Solved(e.n, e.model)
      const token = tokenOf(e.offset, e.length)
      expect(encodeOrbit64V2State(e.id, solved)).toEqual({
        TAG: 'Ok',
        _0: token,
      })
      expect(ok(decodeOrbit64V2State(token))).toEqual({
        entry: e,
        cube: solved,
      })
    }
    expect(ok(encodeOrbit64V2State(0, orbit64V2Solved(2, 'Color')))).toBe(
      'AAAA',
    )
    expect(ok(encodeOrbit64V2State(53, orbit64V2Solved(15, 'Picture')))).toBe(
      tokenOf(orbit64V2Entries[52].count, 639),
    )
  })

  it('round-trips the first, last and a middle rank of every entry', () => {
    for (const e of orbit64V2Entries) {
      const middle = (e.count * 7919n) / 10007n
      for (const rank of [0n, 1n, middle, e.count - 1n]) {
        const token = tokenOf(e.offset + rank, e.length)
        const decoded = ok(decodeOrbit64V2State(token))
        expect(decoded.entry.id, token).toBe(e.id)
        expect(encodeOrbit64V2State(e.id, decoded.cube), token).toEqual({
          TAG: 'Ok',
          _0: token,
        })
      }
    }
  })

  it('does not decode the value just past an entry', () => {
    for (const e of orbit64V2Entries) {
      const next = orbit64V2Entries.find(
        (o) => o.length === e.length && o.offset === e.offset + e.count,
      )
      const decoded = decodeOrbit64V2State(
        tokenOf(e.offset + e.count, e.length),
      )
      if (next) expect(ok(decoded).entry.id).toBe(next.id)
      else if (e.offset + e.count < 64n ** BigInt(e.length)) {
        expect(decoded.TAG).toBe('Error')
      }
    }
  })

  it('leaves the DBL corner of even canonical cubes out of the rank', () => {
    const colorCenters = factorial(24n) / factorial(4n) ** 6n
    // 7! corner permutations and 3^6 twists, then the digits of 4x4x4.
    expect(orbit64V2Entries[0].count).toBe(factorial(7n) * 3n ** 6n)
    expect(orbit64V2Entries[1].count).toBe(factorial(8n) * 3n ** 7n)
    expect(orbit64V2Entries[6].count).toBe(
      factorial(7n) * 3n ** 6n * factorial(24n) * colorCenters,
    )
    for (const rank of [12345n, 3000000n]) {
      const { cube } = ok(decodeOrbit64V2State(tokenOf(rank, 4)))
      expect(cube.cornerPieces[6]).toBe(6)
      expect(cube.cornerTwists[6]).toBe(0)
    }
    const { cube } = ok(decodeOrbit64V2State(tokenOf(12345n, 26)))
    expect(cube.cornerPieces[6]).toBe(6)
    expect(cube.cornerTwists[6]).toBe(0)
  })
})

// V1 corner digit of a V1 state token: the most significant digit of its
// value, 8! * 3^7 corner states, followed by the other orbits and, on odd
// cubes, the frame.
function v1CornerDigit(token: string, restRadix: bigint): bigint {
  const value = [...token].reduce(
    (sum, char) => sum * 64n + BigInt(alphabet.indexOf(char)),
    0n,
  )
  return value / restRadix
}

// 8! * 3^7 corner rank of V2 coordinates: Lehmer code, then little-endian twists.
function cornerDigit(cube: Orbit64V2Cube): bigint {
  const lehmer = cube.cornerPieces.reduce(
    (rank, piece, i) =>
      rank * BigInt(8 - i) +
      BigInt(cube.cornerPieces.slice(i + 1).filter((p) => p < piece).length),
    0n,
  )
  const twists = cube.cornerTwists
    .slice(0, 7)
    .reduceRight((rank, twist) => rank * 3n + BigInt(twist), 0n)
  return lehmer * 2187n + twists
}

const v1Tokens: [number, string][] = [
  ...v1Examples.map(([token]): [number, string] => [token.length, token]),
  ...v1LargeExamples.map(([token]): [number, string] => [token.length, token]),
]

describe('Orbit64 V2 reads V1 state tokens', () => {
  const sizeOfWidth: Record<number, number> = {
    5: 2,
    12: 3,
    27: 4,
    66: 6,
    90: 7,
  }

  it('reads each V1 token as the color framed entry of its size', () => {
    const covered = new Set<number>()
    for (const [width, token] of v1Tokens) {
      if (width === 43) continue
      const n = sizeOfWidth[width]
      const decoded = ok(decodeOrbit64V2State(token))
      expect(decoded.entry.n, token).toBe(n)
      expect(decoded.entry.model).toBe('Color')
      expect(decoded.entry.pose).toBe('Framed')
      expect(decoded.entry.length).toBe(width)
      expect(decoded.entry.offset).toBe(0n)
      expect(encodeOrbit64V2State(decoded.entry.id, decoded.cube)).toEqual({
        TAG: 'Ok',
        _0: token,
      })
      covered.add(n)
    }
    expect([...covered].sort()).toEqual([2, 3, 4, 6, 7])
  })

  it('has the V1 corner digit of the token as its corner state', () => {
    for (const [width, token] of v1Tokens) {
      if (width === 43) continue
      const e = orbit64V2Entries.find(
        (o) => o.length === width && o.offset === 0n,
      )
      if (!e) throw new Error(`no entry of length ${width}`)
      const cornerRadix = 40320n * 2187n
      const decoded = ok(decodeOrbit64V2State(token))
      expect(cornerDigit(decoded.cube), token).toBe(
        v1CornerDigit(token, e.count / cornerRadix),
      )
    }
  })

  it('rejects the 43-character V1 5x5x5 tokens', () => {
    const tokens = v1Tokens.filter(([width]) => width === 43)
    expect(tokens.length).toBeGreaterThan(0)
    for (const [, token] of tokens) {
      expect(decodeOrbit64V2State(token).TAG, token).toBe('Error')
    }
    expect(decodeOrbit64V2State('A'.repeat(43)).TAG).toBe('Error')
  })
})

describe('Orbit64 V2 rejects malformed input without throwing', () => {
  const malformedTokens = [
    '',
    'A',
    'AAA',
    'AAAAAA',
    'A'.repeat(43),
    'A'.repeat(640),
    'A'.repeat(100_000),
    'AAA!A',
    'AAAA\n',
    ' AAAA',
    'AAAÄ',
    'AAA\u{1f9ca}',
    '____',
    '_____',
    '_'.repeat(42),
  ]

  it('returns an error for unknown tokens', () => {
    for (const token of malformedTokens) {
      expect(decodeOrbit64V2State(token).TAG, JSON.stringify(token)).toBe(
        'Error',
      )
    }
  })

  it('says why a token is rejected', () => {
    expect(decodeOrbit64V2State('AAA')).toEqual({
      TAG: 'Error',
      _0: 'not a known V2 state token',
    })
    expect(decodeOrbit64V2State('AAA!A')).toEqual({
      TAG: 'Error',
      _0: 'token contains a character outside the base64url alphabet',
    })
  })

  it('returns an error for tokens that are not strings', () => {
    for (const token of [undefined, null, 5, {}, ['AAAA']]) {
      expect(decodeOrbit64V2State(token as unknown as string).TAG).toBe('Error')
    }
  })

  it('returns an error for an unknown registry entry', () => {
    const cube = orbit64V2Solved(3, 'Color')
    for (const id of [
      -1,
      54,
      1000,
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
    ]) {
      expect(encodeOrbit64V2State(id, cube).TAG, String(id)).toBe('Error')
    }
  })

  it('returns an error for short, long and missing arrays', () => {
    const fields = [
      'cornerPieces',
      'cornerTwists',
      'midgePieces',
      'midgeFlips',
      'wings',
      'centers',
      'rotations',
    ] as const
    for (const e of orbit64V2Entries) {
      const solved = orbit64V2Solved(e.n, e.model)
      for (const field of fields) {
        const values = solved[field] as unknown[]
        // A type lacks some components: only an extra value breaks those.
        const shorter = values.length > 0 ? values.slice(0, -1) : [0]
        const longer = [...values, values.length > 0 ? values[0] : 0]
        for (const changed of [shorter, longer, undefined]) {
          const cube = {
            ...solved,
            [field]: changed,
          } as unknown as Orbit64V2Cube
          expect(
            encodeOrbit64V2State(e.id, cube).TAG,
            `${e.id} ${field} ${JSON.stringify(changed)?.slice(0, 20)}`,
          ).toBe('Error')
        }
      }
    }
  })

  it('returns an error for wrong orbit sizes inside a list', () => {
    for (const e of orbit64V2Entries.filter((o) => o.n >= 4)) {
      const solved = orbit64V2Solved(e.n, e.model)
      for (const field of ['wings', 'centers'] as const) {
        if (solved[field].length === 0) continue
        const cube = {
          ...solved,
          [field]: [solved[field][0].slice(1), ...solved[field].slice(1)],
        }
        expect(encodeOrbit64V2State(e.id, cube).TAG, `${e.id} ${field}`).toBe(
          'Error',
        )
      }
    }
  })

  it('returns an error for values outside their range', () => {
    const base = orbit64V2Solved(3, 'Picture')
    // Entry 4 is the 3x3x3 picture canonical type.
    const bad: Partial<Orbit64V2Cube>[] = [
      { cornerTwists: [3, 0, 0, 0, 0, 0, 0, 0] },
      { cornerTwists: [-1, 0, 0, 0, 0, 0, 0, 1] },
      { cornerTwists: [0.5, 0, 0, 0, 0, 0, 0, 0] },
      { cornerTwists: [Number.NaN, 0, 0, 0, 0, 0, 0, 0] },
      { midgeFlips: [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
      { rotations: [4, 0, 0, 0, 0, 0] },
      { rotations: [0, 0, 0, 0, 0, Number.NaN] },
      { cornerPieces: [0, 1, 2, 3, 4, 5, 6, 6] },
      { cornerPieces: [0, 1, 2, 3, 4, 5, 6, 8] },
      { midgePieces: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 10] },
      { frame: 1 },
    ]
    for (const change of bad) {
      expect(
        encodeOrbit64V2State(4, { ...base, ...change }).TAG,
        JSON.stringify(change),
      ).toBe('Error')
    }
    // Entry 5 is the 3x3x3 picture framed type: the frame is 0..23.
    for (const frame of [-1, 24, 0.5, Number.NaN]) {
      expect(
        encodeOrbit64V2State(5, { ...base, frame }).TAG,
        String(frame),
      ).toBe('Error')
    }
    expect(encodeOrbit64V2State(5, { ...base, frame: 23 }).TAG).toBe('Ok')
    // A center color outside 0..5 or an unbalanced multiset.
    const colors = orbit64V2Solved(4, 'Color')
    const unbalanced = colors.centers[0].map((c, i) => (i === 0 ? 5 : c))
    expect(
      encodeOrbit64V2State(6, { ...colors, centers: [unbalanced] }).TAG,
    ).toBe('Error')
    const outside = colors.centers[0].map((c, i) => (i === 0 ? 6 : c))
    expect(encodeOrbit64V2State(6, { ...colors, centers: [outside] }).TAG).toBe(
      'Error',
    )
  })

  it('returns an error when an orientation law or parity relation breaks', () => {
    const swap = (values: number[], i: number, j: number) =>
      values.map((v, k) => (k === i ? values[j] : k === j ? values[i] : v))
    const three = orbit64V2Solved(3, 'Color')
    // Twist sum not 0 mod 3, flip sum odd.
    expect(
      encodeOrbit64V2State(2, {
        ...three,
        cornerTwists: [1, 0, 0, 0, 0, 0, 0, 0],
      }).TAG,
    ).toBe('Error')
    expect(
      encodeOrbit64V2State(2, {
        ...three,
        midgeFlips: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      }).TAG,
    ).toBe('Error')
    // M = C: two corners swapped with the midges unchanged.
    expect(
      encodeOrbit64V2State(2, {
        ...three,
        cornerPieces: swap(three.cornerPieces, 0, 1),
      }).TAG,
    ).toBe('Error')
    // Picture, odd: R = C.
    const picture = orbit64V2Solved(3, 'Picture')
    expect(
      encodeOrbit64V2State(4, { ...picture, rotations: [1, 0, 0, 0, 0, 0] })
        .TAG,
    ).toBe('Error')
    // Picture 5x5x5: one swapped pair in a center orbit breaks Z = C + W.
    const five = orbit64V2Solved(5, 'Picture')
    expect(
      encodeOrbit64V2State(12, {
        ...five,
        centers: [swap(five.centers[0], 0, 1), five.centers[1]],
      }).TAG,
    ).toBe('Error')
    // Even canonical: the DBL corner must be home with twist 0.
    const four = orbit64V2Solved(4, 'Color')
    expect(
      encodeOrbit64V2State(6, {
        ...four,
        cornerPieces: swap(four.cornerPieces, 6, 7),
      }).TAG,
    ).toBe('Error')
    expect(
      encodeOrbit64V2State(6, {
        ...four,
        cornerTwists: [0, 0, 0, 0, 0, 0, 1, 2],
      }).TAG,
    ).toBe('Error')
    // The same two-corner swap with twists 0 is a valid framed 4x4x4.
    expect(
      encodeOrbit64V2State(7, {
        ...four,
        cornerPieces: swap(four.cornerPieces, 6, 7),
      }).TAG,
    ).toBe('Ok')
  })

  it('returns an error for inputs that are not cubes', () => {
    for (const cube of [undefined, null, 0, 'cp=0', [], {}]) {
      for (const id of [0, 3, 5, 6, 53]) {
        expect(
          encodeOrbit64V2State(id, cube as unknown as Orbit64V2Cube).TAG,
        ).toBe('Error')
      }
    }
  })

  it('does not mistake a cube of another type for the entry', () => {
    expect(encodeOrbit64V2State(0, orbit64V2Solved(3, 'Color')).TAG).toBe(
      'Error',
    )
    expect(encodeOrbit64V2State(2, orbit64V2Solved(2, 'Color')).TAG).toBe(
      'Error',
    )
    expect(encodeOrbit64V2State(4, orbit64V2Solved(3, 'Color')).TAG).toBe(
      'Error',
    )
    expect(encodeOrbit64V2State(2, orbit64V2Solved(3, 'Picture')).TAG).toBe(
      'Error',
    )
  })
})

describe('Orbit64 V2 hardening', () => {
  const alphabetMessage =
    'token contains a character outside the base64url alphabet'

  it('checks the alphabet before the length', () => {
    expect(decodeOrbit64V2State('AA!')).toEqual({
      TAG: 'Error',
      _0: alphabetMessage,
    })
    expect(decodeOrbit64V2State('!'.repeat(100_000))).toEqual({
      TAG: 'Error',
      _0: alphabetMessage,
    })
    expect(decodeOrbit64V2State('AA')).toEqual({
      TAG: 'Error',
      _0: 'not a known V2 state token',
    })
    expect(decodeOrbit64V2State('A'.repeat(100_000)).TAG).toBe('Error')
  })

  it('rejects holes in arrays', () => {
    const hole = (values: number[], index: number) => {
      const copy: number[] = new Array(values.length)
      values.forEach((value, i) => {
        if (i !== index) copy[i] = value
      })
      return copy
    }
    const color3 = orbit64V2Solved(3, 'Color')
    const picture3 = orbit64V2Solved(3, 'Picture')
    const color2 = orbit64V2Solved(2, 'Color')
    const cases: [number, Orbit64V2Cube][] = [
      [2, { ...color3, cornerTwists: hole(color3.cornerTwists, 7) }],
      [2, { ...color3, midgeFlips: hole(color3.midgeFlips, 11) }],
      [0, { ...color2, cornerTwists: hole(color2.cornerTwists, 7) }],
      [4, { ...picture3, rotations: hole(picture3.rotations, 0) }],
      [4, { ...picture3, rotations: hole(picture3.rotations, 5) }],
      [2, { ...color3, cornerPieces: hole(color3.cornerPieces, 3) }],
    ]
    for (const [id, cube] of cases) {
      expect(encodeOrbit64V2State(id, cube).TAG, String(id)).toBe('Error')
    }
    const four = orbit64V2Solved(4, 'Color')
    const sparse = { ...four, centers: [hole(four.centers[0], 9)] }
    expect(encodeOrbit64V2State(6, sparse).TAG).toBe('Error')
  })

  it('does not let callers change the registry', () => {
    const decoded = ok(decodeOrbit64V2State('AAAA'))
    // A copy: changing it affects nothing.
    ;(decoded.entry as { offset: bigint }).offset = 5n
    expect(ok(decodeOrbit64V2State('AAAA')).entry.offset).toBe(0n)
    const copy = orbit64V2Entry(0)
    ;(copy as { offset: bigint }).offset = 5n
    expect(orbit64V2Entry(0)?.offset).toBe(0n)
    expect(orbit64V2Entries[0].offset).toBe(0n)
    // The shared entries and array are frozen.
    expect(Object.isFrozen(orbit64V2Entries)).toBe(true)
    expect(Object.isFrozen(orbit64V2Entries[0])).toBe(true)
    expect(() => (orbit64V2Entries as unknown[]).splice(0)).toThrow()
    expect(() => {
      ;(orbit64V2Entries[0] as { offset: bigint }).offset = 5n
    }).toThrow()
    expect(orbit64V2Entries).toHaveLength(54)
    expect(encodeOrbit64V2State(0, orbit64V2Solved(2, 'Color'))).toEqual({
      TAG: 'Ok',
      _0: 'AAAA',
    })
    expect(decodeOrbit64V2State('AAAA').TAG).toBe('Ok')
  })

  it('returns an error for a null or undefined entry ID', () => {
    const cube = orbit64V2Solved(3, 'Color')
    for (const id of [undefined, null, '2', {}]) {
      expect(encodeOrbit64V2State(id as unknown as number, cube).TAG).toBe(
        'Error',
      )
    }
  })

  it('validates and ranks the same values when a getter answers differently', () => {
    const solved = orbit64V2Solved(3, 'Color')
    let reads = 0
    const hostile = {
      ...solved,
      get cornerTwists() {
        reads++
        // Valid on the first read, invalid (twist sum 1) afterwards.
        return reads === 1 ? solved.cornerTwists : [1, 0, 0, 0, 0, 0, 0, 0]
      },
    }
    const token = ok(encodeOrbit64V2State(2, hostile as Orbit64V2Cube))
    expect(token).toBe(ok(encodeOrbit64V2State(2, solved)))
    const arrays = {
      ...solved,
      cornerPieces: new Proxy(solved.cornerPieces, {
        get(target, key, receiver) {
          reads++
          const value = Reflect.get(target, key, receiver) as unknown
          return reads > 100 && typeof key === 'string' && /^\d+$/.test(key)
            ? 7
            : value
        },
      }),
    }
    reads = 0
    expect(encodeOrbit64V2State(2, arrays as Orbit64V2Cube).TAG).toBe('Ok')
  })
})

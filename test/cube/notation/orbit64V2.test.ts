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
import fixture from './orbit64V2Vectors.json'

// The table of FORMAT-V2.md, copied by scripts/orbit64V2Fixture.mjs.
const table = fixture.registry

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
      const expected = after === 0 ? 0n : orbit64V2Entries[after].count
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

  it('gives every entry the shortest length that fits', () => {
    for (const e of orbit64V2Entries) {
      const used = (length: number, before: number) =>
        orbit64V2Entries
          .filter((o) => o.id < before && o.length === length)
          .reduce((sum, o) => sum + o.count, 0n)
      expect(e.offset).toBe(used(e.length, e.id))
      for (let shorter = 1; shorter < e.length; shorter++) {
        expect(used(shorter, e.id) + e.count).toBeGreaterThan(
          64n ** BigInt(shorter),
        )
      }
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
    expect(orbit64V2Entry(3)).toBe(orbit64V2Entries[3])
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
    const factorial = (k: bigint): bigint =>
      k <= 1n ? 1n : k * factorial(k - 1n)
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

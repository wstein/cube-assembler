import { describe, expect, it } from 'vitest'
import {
  orbit64V2Entries,
  orbit64V2Entry,
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

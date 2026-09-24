/**
 * test/fixtureFormat.test.ts
 * readFixtureColors (src/client/fixtureFormat.ts): a fixture's colors in
 * the current format (colorsURFDLB) and the earlier per-face one
 * (faces.u.colors), as test/fixtures/synthetic-sanity-check/meta.json and
 * captures from older checkouts still have it.
 *
 * Run: npx vitest run test/fixtureFormat.test.ts
 */
import { describe, it, expect } from 'vitest'
import { readFixtureColors } from '../src/client/fixtureFormat'

const solid = (color: string) => [[color, color, color], [color, color, color], [color, color, color]]
const SOLVED = { u: 'W', r: 'R', f: 'G', d: 'Y', l: 'O', b: 'B' }

// The synthetic fixture as it was saved before colorsURFDLB existed.
const earlier = {
  gridSize: 3,
  faces: Object.fromEntries(Object.entries(SOLVED).map(([slot, color]) => [slot, { colors: solid(color), photo: `face-${slot}.jpg` }])),
}

describe('readFixtureColors', () => {
  it('reads the current one-string format', () => {
    const read = readFixtureColors({
      gridSize: 3,
      colorsURFDLB: 'WWWWWWWWW RRRRRRRRR GGGGGGGGG YYYYYYYYY OOOOOOOOO BBBBBBBBB',
      detectedURFDLB: 'WWWWWWWWR RRRRRRRRR GGGGGGGGG YYYYYYYYY OOOOOOOOO BBBBBBBBB',
    })!
    expect(read.colors.F).toEqual(solid('G'))
    expect(read.detected!.U[2][2]).toBe('R')
  })

  it('reads the earlier per-face format, keyed the same way', () => {
    const read = readFixtureColors(earlier)!
    expect(read.colors).toEqual(Object.fromEntries(Object.entries(SOLVED).map(([slot, color]) => [slot.toUpperCase(), solid(color)])))
    expect(read.detected).toBeNull()
  })

  it('reads per-face detected colors when all 6 are there', () => {
    const withDetected = { ...earlier, faces: Object.fromEntries(Object.entries(earlier.faces).map(([k, v]) => [k, { ...v, detected: v.colors }])) }
    expect(readFixtureColors(withDetected)!.detected!.B).toEqual(solid('B'))
  })

  it('prefers the current format when both are present', () => {
    const both = { ...earlier, colorsURFDLB: 'YYYYYYYYY RRRRRRRRR GGGGGGGGG WWWWWWWWW OOOOOOOOO BBBBBBBBB' }
    expect(readFixtureColors(both)!.colors.U).toEqual(solid('Y'))
  })

  it('rejects missing faces, wrong sizes and unknown colors', () => {
    expect(readFixtureColors({ gridSize: 3 })).toBeNull()
    expect(readFixtureColors({ ...earlier, gridSize: 4 })).toBeNull()
    const { u: _u, ...fiveFaces } = earlier.faces
    expect(readFixtureColors({ ...earlier, faces: fiveFaces })).toBeNull()
    const purple = { ...earlier, faces: { ...earlier.faces, u: { colors: solid('P'), photo: 'face-u.jpg' } } }
    expect(readFixtureColors(purple)).toBeNull()
  })
})

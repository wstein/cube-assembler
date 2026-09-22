/**
 * test/notationOutput.test.ts
 * Vitest tests for src/client/notationOutput.ts - the app's two cube-state
 * input/output formats, both N²-letter blocks in U R F D L B order:
 * "spaced facelets" (space-separated) and "URF facelets" (no separators).
 *
 * (Not to be confused with test/notation.test.ts, which covers the
 * separate, alphabet-parameterised ReScript Notation module.)
 *
 * Run: npx vitest run test/notationOutput.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  toSpacedFacelets, fromSpacedFacelets, toURFFacelets, fromURFFacelets, type CubeState,
} from '../src/client/notationOutput'

function solvedCube(size: number): CubeState {
  const face = (color: string) => Array(size * size).fill(color)
  return { u: face('W'), r: face('R'), f: face('G'), d: face('Y'), l: face('O'), b: face('B') }
}

describe('toSpacedFacelets', () => {
  it('formats a 3x3 cube as 6 space-separated 9-letter blocks in U R F D L B order', () => {
    expect(toSpacedFacelets(solvedCube(3))).toBe(
      'WWWWWWWWW RRRRRRRRR GGGGGGGGG YYYYYYYYY OOOOOOOOO BBBBBBBBB'
    )
  })

  it('scales block size to N² for other puzzle sizes', () => {
    const output = toSpacedFacelets(solvedCube(5))
    const blocks = output.split(' ')
    expect(blocks).toHaveLength(6)
    expect(blocks.every((b) => b.length === 25)).toBe(true)
  })
})

describe('fromSpacedFacelets', () => {
  it('parses a valid 3x3 spaced facelets string', () => {
    const cube = fromSpacedFacelets('WWWWWWWWW RRRRRRRRR GGGGGGGGG YYYYYYYYY OOOOOOOOO BBBBBBBBB')
    expect(cube).toEqual(solvedCube(3))
  })

  it('is tolerant of extra whitespace and newlines between blocks', () => {
    const cube = fromSpacedFacelets('  WWWWWWWWW\nRRRRRRRRR   GGGGGGGGG\nYYYYYYYYY OOOOOOOOO BBBBBBBBB  ')
    expect(cube).toEqual(solvedCube(3))
  })

  it('parses other puzzle sizes (5x5) from their N² block length', () => {
    const cube = fromSpacedFacelets(toSpacedFacelets(solvedCube(5)))
    expect(cube).toEqual(solvedCube(5))
  })

  it('round-trips toSpacedFacelets output for every supported puzzle size', () => {
    for (const size of [2, 3, 4, 5, 6, 7]) {
      const cube = solvedCube(size)
      expect(fromSpacedFacelets(toSpacedFacelets(cube))).toEqual(cube)
    }
  })

  it('rejects a string with an invalid color letter', () => {
    expect(fromSpacedFacelets('XWWWWWWWW RRRRRRRRR GGGGGGGGG YYYYYYYYY OOOOOOOOO BBBBBBBBB')).toBeNull()
  })

  it('rejects a length that is not 6 equal perfect-square blocks', () => {
    expect(fromSpacedFacelets('WWWWWWWW RRRRRRRR GGGGGGGG YYYYYYYY OOOOOOOO BBBBBBBB')).toBeNull() // 8 per block, not a perfect square
    expect(fromSpacedFacelets('WWWWWWWWW RRRRRRRRR GGGGGGGGG YYYYYYYYY OOOOOOOOO BB')).toBeNull() // uneven blocks
    expect(fromSpacedFacelets('')).toBeNull()
  })
})

describe('toURFFacelets', () => {
  it('formats a 3x3 cube as a single 54-character run in U R F D L B order', () => {
    expect(toURFFacelets(solvedCube(3))).toBe(
      'WWWWWWWWWRRRRRRRRRGGGGGGGGGYYYYYYYYYOOOOOOOOOBBBBBBBBB'
    )
  })

  it('underlies toSpacedFacelets (same letters, spaces removed)', () => {
    const cube = solvedCube(5)
    expect(toSpacedFacelets(cube).replace(/\s+/g, '')).toBe(toURFFacelets(cube))
  })
})

describe('fromURFFacelets', () => {
  it('parses a valid unspaced 3x3 facelets string', () => {
    expect(fromURFFacelets('WWWWWWWWWRRRRRRRRRGGGGGGGGGYYYYYYYYYOOOOOOOOOBBBBBBBBB')).toEqual(solvedCube(3))
  })

  it('round-trips toURFFacelets output for every supported puzzle size', () => {
    for (const size of [2, 3, 4, 5, 6, 7]) {
      const cube = solvedCube(size)
      expect(fromURFFacelets(toURFFacelets(cube))).toEqual(cube)
    }
  })

  it('rejects input containing spaces (unlike fromSpacedFacelets)', () => {
    expect(fromURFFacelets('WWWWWWWWW RRRRRRRRRGGGGGGGGGYYYYYYYYYOOOOOOOOOBBBBBBBBB')).toBeNull()
  })

  it('rejects a string with an invalid color letter', () => {
    expect(fromURFFacelets('XWWWWWWWWRRRRRRRRRGGGGGGGGGYYYYYYYYYOOOOOOOOOBBBBBBBBB')).toBeNull()
  })

  it('rejects a length that is not 6 equal perfect-square blocks', () => {
    expect(fromURFFacelets('WWWWWWWWRRRRRRRRGGGGGGGGYYYYYYYYOOOOOOOOBBBBBBBB')).toBeNull()
    expect(fromURFFacelets('')).toBeNull()
  })
})

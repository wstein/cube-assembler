/**
 * test/notationOutput.test.ts
 * Vitest tests for src/client/notationOutput.ts - the app's sole cube-state
 * input/output format: space-separated N²-letter facelet blocks in
 * U R F D L B order.
 *
 * (Not to be confused with test/notation.test.ts, which covers the
 * separate, alphabet-parameterised ReScript Notation module.)
 *
 * Run: npx vitest run test/notationOutput.test.ts
 */
import { describe, it, expect } from 'vitest'
import { toSpacedFacelets, fromSpacedFacelets, type CubeState } from '../src/client/notationOutput'

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

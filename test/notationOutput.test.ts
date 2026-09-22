/**
 * test/notationOutput.test.ts
 * Vitest tests for src/client/notationOutput.ts - the app's two cube-state
 * input/output formats, both N² letters per face in U R F D L B order:
 *   - "spaced facelets": space-separated blocks of WOGRBY color letters.
 *   - "URF facelets": one unspaced run of URFDLB color-IDENTITY letters
 *     (the standard Kociemba/solver facelet convention - each letter
 *     names the face whose solved color the sticker matches, so a solved
 *     cube reads "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB").
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

// The classic "checkerboard"/6-spot pattern (e.g. from U2 D2 F2 B2 L2 R2
// on a solved cube): each face alternates its own color with its
// opposite face's color. A real, physically-reachable, non-solved state -
// useful for catching bugs a uniform solved cube can't (e.g. an off-by-
// one in the color<->face-letter mapping).
function checkerboardCube3x3(): CubeState {
  return {
    u: 'WYWYWYWYW'.split(''), d: 'YWYWYWYWY'.split(''),
    r: 'ROROROROR'.split(''), l: 'ORORORORO'.split(''),
    f: 'GBGBGBGBG'.split(''), b: 'BGBGBGBGB'.split(''),
  }
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
  it('formats a solved 3x3 cube as the canonical Kociemba facelet string', () => {
    // The universally recognized "solved cube" facelet string used by
    // Kociemba/min2phase/twizzle and every other cube-solving tool.
    expect(toURFFacelets(solvedCube(3))).toBe(
      'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB'
    )
  })

  it('encodes a real scrambled state (checkerboard pattern) correctly', () => {
    // Verified independently: WYWYWYWYW (U, white/yellow checkerboard)
    // maps color-by-color (W->U, Y->D, O->L, R->R, G->F, B->B) to
    // UDUDUDUDU, and so on for the other 5 faces.
    expect(toURFFacelets(checkerboardCube3x3())).toBe(
      'UDUDUDUDU' + 'RLRLRLRLR' + 'FBFBFBFBF' + 'DUDUDUDUD' + 'LRLRLRLRL' + 'BFBFBFBFB'
    )
  })
})

describe('fromURFFacelets', () => {
  it('parses the canonical solved-cube Kociemba facelet string', () => {
    expect(fromURFFacelets('UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB')).toEqual(solvedCube(3))
  })

  it('parses the checkerboard pattern back to the correct colors', () => {
    const facelets = 'UDUDUDUDU' + 'RLRLRLRLR' + 'FBFBFBFBF' + 'DUDUDUDUD' + 'LRLRLRLRL' + 'BFBFBFBFB'
    expect(fromURFFacelets(facelets)).toEqual(checkerboardCube3x3())
  })

  it('round-trips toURFFacelets output for every supported puzzle size', () => {
    for (const size of [2, 3, 4, 5, 6, 7]) {
      const cube = solvedCube(size)
      expect(fromURFFacelets(toURFFacelets(cube))).toEqual(cube)
    }
  })

  it('rejects input containing spaces (unlike fromSpacedFacelets)', () => {
    expect(fromURFFacelets('UUUUUUUUU RRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB')).toBeNull()
  })

  it('rejects a string with an invalid facelet letter', () => {
    expect(fromURFFacelets('XUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB')).toBeNull()
    // WOGRBY color letters are not valid URF facelet letters (only URFDLB are).
    expect(fromURFFacelets('WWWWWWWWWRRRRRRRRRGGGGGGGGGYYYYYYYYYOOOOOOOOOBBBBBBBBB')).toBeNull()
  })

  it('rejects a length that is not 6 equal perfect-square blocks', () => {
    expect(fromURFFacelets('UUUUUUUURRRRRRRRFFFFFFFFDDDDDDDDLLLLLLLLBBBBBBBB')).toBeNull()
    expect(fromURFFacelets('')).toBeNull()
  })
})

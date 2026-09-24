/**
 * test/notationOutput.test.ts
 * Vitest tests for src/client/notationOutput.ts - the app's two cube-state
 * input/output formats, both six space-separated N²-letter blocks per
 * face in U R F D L B order:
 *   - "WRG facelets": WOGRBY color letters.
 *   - "URF facelets": URFDLB color-IDENTITY letters (the standard
 *     Kociemba/solver facelet convention - each letter names the face
 *     whose solved color the sticker matches, so a solved cube reads
 *     "UUUUUUUUU RRRRRRRRR FFFFFFFFF DDDDDDDDD LLLLLLLLL BBBBBBBBB").
 *
 * (Not to be confused with test/notation.test.ts, which covers the
 * separate, alphabet-parameterised ReScript Notation module.)
 *
 * Run: npx vitest run test/notationOutput.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  toWRGFacelets, fromWRGFacelets, toURFFacelets, fromURFFacelets, detectNotationFormat,
  gridsToWRGFacelets, wrgFaceletsToGrids, type CubeState,
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

describe('toWRGFacelets', () => {
  it('formats a 3x3 cube as 6 space-separated 9-letter blocks in U R F D L B order', () => {
    expect(toWRGFacelets(solvedCube(3))).toBe(
      'WWWWWWWWW RRRRRRRRR GGGGGGGGG YYYYYYYYY OOOOOOOOO BBBBBBBBB'
    )
  })

  it('scales block size to N² for other puzzle sizes', () => {
    const output = toWRGFacelets(solvedCube(5))
    const blocks = output.split(' ')
    expect(blocks).toHaveLength(6)
    expect(blocks.every((b) => b.length === 25)).toBe(true)
  })
})

describe('fromWRGFacelets', () => {
  it('parses a valid 3x3 spaced facelets string', () => {
    const cube = fromWRGFacelets('WWWWWWWWW RRRRRRRRR GGGGGGGGG YYYYYYYYY OOOOOOOOO BBBBBBBBB')
    expect(cube).toEqual(solvedCube(3))
  })

  it('is tolerant of extra whitespace, newlines, and lowercase input', () => {
    const cube = fromWRGFacelets('  wwwwwwwww\nrrrrrrrrr   ggggggggg\nyyyyyyyyy ooooooooo bbbbbbbbb  ')
    expect(cube).toEqual(solvedCube(3))
  })

  it('parses other puzzle sizes (5x5) from their N² block length', () => {
    const cube = fromWRGFacelets(toWRGFacelets(solvedCube(5)))
    expect(cube).toEqual(solvedCube(5))
  })

  it('round-trips toWRGFacelets output for every supported puzzle size', () => {
    for (const size of [2, 3, 4, 5, 6, 7]) {
      const cube = solvedCube(size)
      expect(fromWRGFacelets(toWRGFacelets(cube))).toEqual(cube)
    }
  })

  it('rejects a string with an invalid color letter', () => {
    expect(fromWRGFacelets('XWWWWWWWW RRRRRRRRR GGGGGGGGG YYYYYYYYY OOOOOOOOO BBBBBBBBB')).toBeNull()
  })

  it('rejects a length that is not 6 equal perfect-square blocks', () => {
    expect(fromWRGFacelets('WWWWWWWW RRRRRRRR GGGGGGGG YYYYYYYY OOOOOOOO BBBBBBBB')).toBeNull() // 8 per block, not a perfect square
    expect(fromWRGFacelets('WWWWWWWWW RRRRRRRRR GGGGGGGGG YYYYYYYYY OOOOOOOOO BB')).toBeNull() // uneven blocks
    expect(fromWRGFacelets('')).toBeNull()
  })
})

describe('toURFFacelets', () => {
  it('formats a solved 3x3 cube as 6 space-separated blocks of the canonical Kociemba letters', () => {
    // The universally recognized "solved cube" facelet identity used by
    // Kociemba/min2phase/twizzle and every other cube-solving tool - just
    // spaced into per-face blocks like the WRG format, rather than their
    // usual single unspaced 54-character run.
    expect(toURFFacelets(solvedCube(3))).toBe(
      'UUUUUUUUU RRRRRRRRR FFFFFFFFF DDDDDDDDD LLLLLLLLL BBBBBBBBB'
    )
  })

  it('encodes a real scrambled state (checkerboard pattern) correctly', () => {
    // Verified independently: WYWYWYWYW (U, white/yellow checkerboard)
    // maps color-by-color (W->U, Y->D, O->L, R->R, G->F, B->B) to
    // UDUDUDUDU, and so on for the other 5 faces.
    expect(toURFFacelets(checkerboardCube3x3())).toBe(
      'UDUDUDUDU RLRLRLRLR FBFBFBFBF DUDUDUDUD LRLRLRLRL BFBFBFBFB'
    )
  })
})

describe('fromURFFacelets', () => {
  it('parses the canonical solved-cube Kociemba facelet blocks', () => {
    expect(fromURFFacelets('UUUUUUUUU RRRRRRRRR FFFFFFFFF DDDDDDDDD LLLLLLLLL BBBBBBBBB')).toEqual(solvedCube(3))
  })

  it('is tolerant of extra whitespace, newlines, and lowercase input', () => {
    const cube = fromURFFacelets('  uuuuuuuuu\nrrrrrrrrr   fffffffff\nddddddddd lllllllll bbbbbbbbb  ')
    expect(cube).toEqual(solvedCube(3))
  })

  it('parses the checkerboard pattern back to the correct colors', () => {
    const facelets = 'UDUDUDUDU RLRLRLRLR FBFBFBFBF DUDUDUDUD LRLRLRLRL BFBFBFBFB'
    expect(fromURFFacelets(facelets)).toEqual(checkerboardCube3x3())
  })

  it('round-trips toURFFacelets output for every supported puzzle size', () => {
    for (const size of [2, 3, 4, 5, 6, 7]) {
      const cube = solvedCube(size)
      expect(fromURFFacelets(toURFFacelets(cube))).toEqual(cube)
    }
  })

  it('rejects a string with an invalid facelet letter', () => {
    expect(fromURFFacelets('XUUUUUUUU RRRRRRRRR FFFFFFFFF DDDDDDDDD LLLLLLLLL BBBBBBBBB')).toBeNull()
    // WOGRBY color letters are not valid URF facelet letters (only URFDLB are).
    expect(fromURFFacelets('WWWWWWWWW RRRRRRRRR GGGGGGGGG YYYYYYYYY OOOOOOOOO BBBBBBBBB')).toBeNull()
  })

  it('rejects a length that is not 6 equal perfect-square blocks', () => {
    expect(fromURFFacelets('UUUUUUUU RRRRRRRR FFFFFFFF DDDDDDDD LLLLLLLL BBBBBBBB')).toBeNull()
    expect(fromURFFacelets('')).toBeNull()
  })
})

describe('detectNotationFormat', () => {
  it('detects WRG from letters unique to its alphabet (W, Y, O, G)', () => {
    expect(detectNotationFormat(toWRGFacelets(solvedCube(3)))).toBe('wrg')
  })

  it('detects URF from letters unique to its alphabet (U, F, D, L)', () => {
    expect(detectNotationFormat(toURFFacelets(solvedCube(3)))).toBe('urf')
  })

  it('is case-insensitive', () => {
    expect(detectNotationFormat(toWRGFacelets(solvedCube(3)).toLowerCase())).toBe('wrg')
    expect(detectNotationFormat(toURFFacelets(solvedCube(3)).toLowerCase())).toBe('urf')
  })

  it('returns null for text using only the two letters shared by both alphabets (R, B)', () => {
    expect(detectNotationFormat('RRRRRRRRR BBBBBBBBB RRRRRRRRR BBBBBBBBB RRRRRRRRR BBBBBBBBB')).toBeNull()
  })

  it('returns null for empty input', () => {
    expect(detectNotationFormat('')).toBeNull()
  })

  it('returns null when letters unique to both alphabets are mixed together', () => {
    expect(detectNotationFormat('WWWWWWWWW UUUUUUUUU')).toBeNull()
  })
})

describe('gridsToWRGFacelets / wrgFaceletsToGrids', () => {
  const colors = 'GRRYOYWYW WYWROGORB GRRYOYWYW YWYBROGWR GBGBGBOBO BGRGBOBWO'

  it('splits each face into row-major rows', () => {
    const grids = wrgFaceletsToGrids(colors)!
    expect(grids.U).toEqual([['G', 'R', 'R'], ['Y', 'O', 'Y'], ['W', 'Y', 'W']])
    expect(grids.B).toEqual([['B', 'G', 'R'], ['G', 'B', 'O'], ['B', 'W', 'O']])
  })

  it('round-trips', () => {
    expect(gridsToWRGFacelets(wrgFaceletsToGrids(colors)!)).toBe(colors)
  })

  it('rejects strings that are not 6 equal square faces', () => {
    expect(wrgFaceletsToGrids('WWW')).toBeNull()
  })
})

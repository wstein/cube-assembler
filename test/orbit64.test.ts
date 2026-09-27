import { describe, expect, it } from 'vitest'
import {
  decodeOrbit64State,
  encodeOrbit64State,
  looksLikeOrbit64StateToken,
} from '../src/client/orbit64'
import examples from './orbit64Vectors.json'

// Published by flix-orbit64 in FORMAT.md and ORBIT64-EXAMPLES.md.
const vectors = [
  ['EJ6kr', 'LFLD BLRD BLBU RFRR UUDU DFFB'],
  [
    'AAAAAAAACC-Y',
    'UUUUURUUU RURBRLRDR FFFLFRFFF DDDLDRDDD LLLFLFLDL BBBBBRBBB',
  ],
  [
    'BJStkD4cayBhsWj6eHgDZLTP1th',
    'DLLDLLDLBFLFLRBR DRDLFBRLUURUUDDU FUUFLDFDRBUFURRL LBDFFFDFFFBRFBFR RDDDBLUUBURBRULB BFBBUDRURBLLBRDU',
  ],
  [
    'AQshP-X3WpOUAtv878ZKcZyT5P3So75Lb-WOh2gDJ2w',
    'DBRFRFUBLDDBUFFURBDDFUUDL BLDBFULULLLRRUURRDFDRLLFD LFLRURFURRFFFFBUBLUFRLUBU BDBRFDFRUULRDFDULLDDRBRFL LDBFUUFDUFRLLURBRDDBBRFRD DLDUFBBBBLFRBDUBDLBLBLBRU',
  ],
] as const

describe('Orbit64 state tokens', () => {
  it.each(vectors)('encodes published %s vector', (token, facelets) => {
    expect(encodeOrbit64State(facelets)).toBe(token)
    expect(decodeOrbit64State(token)).toBe(facelets)
  })

  it('uses canonical solved tokens', () => {
    for (const [size, width] of [
      [2, 5],
      [3, 12],
      [4, 27],
      [5, 43],
    ]) {
      const facelets = 'URFDLB'
        .split('')
        .map((face) => face.repeat(size * size))
        .join(' ')
      expect(encodeOrbit64State(facelets)).toBe('A'.repeat(width))
      expect(decodeOrbit64State('A'.repeat(width))).toBe(facelets)
    }
  })

  it.each(examples)('round-trips published example %s', (token, facelets) => {
    expect(encodeOrbit64State(facelets)).toBe(token)
    expect(decodeOrbit64State(token)).toBe(facelets)
  })

  it('rejects malformed and unsupported tokens', () => {
    expect(decodeOrbit64State('not-a-token')).toBeNull()
    expect(decodeOrbit64State('AAAAAAAAAAAAAAAA')).toBeNull()
    expect(encodeOrbit64State('')).toBeNull()
  })

  it('distinguishes token-shaped input from facelets', () => {
    expect(looksLikeOrbit64StateToken(' E J 6 k r ')).toBe(false)
    expect(looksLikeOrbit64StateToken(' EJ6kr ')).toBe(true)
    expect(looksLikeOrbit64StateToken('QJ6kr')).toBe(true)
    expect(decodeOrbit64State('QJ6kr')).toBeNull()
    expect(looksLikeOrbit64StateToken('UUUU RRRR FFFF DDDD LLLL BBBB')).toBe(
      false,
    )
  })
})

import { describe, expect, it } from 'vitest'
import {
  decodeOrbit64State,
  encodeOrbit64State,
  looksLikeOrbit64StateToken,
} from '../../../src/cube/notation/orbit64'
import examples from './orbit64Vectors.json'
import { largeTables } from '../../../src/cube/notation/orbit64LargeTables'
import largeExamples from './orbit64LargeVectors.json'

// Published by flix-orbit64@6aedfc1 in FORMAT.md and ORBIT64-EXAMPLES.md.
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
  it.each([6, 7] as const)(
    'covers every facelet exactly once on size %s',
    (size) => {
      const tables = largeTables(size)
      const written = [
        ...tables.corner.flat(),
        ...tables.midge.flat(),
        ...tables.wings.flat(2),
        ...tables.centres.flat(),
        ...(size === 7
          ? Array.from({ length: 6 }, (_, face) => face * 49 + 24)
          : []),
      ]
      expect(written).toHaveLength(6 * size * size)
      expect(new Set(written).size).toBe(written.length)
      expect(tables.wings).toHaveLength(2)
      expect(tables.centres).toHaveLength(size === 6 ? 4 : 6)
    },
  )
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
      [6, 66],
      [7, 90],
    ]) {
      const facelets = 'URFDLB'
        .split('')
        .map((face) => face.repeat(size * size))
        .join(' ')
      expect(encodeOrbit64State(facelets)).toBe('A'.repeat(width))
      expect(decodeOrbit64State('A'.repeat(width))).toBe(facelets)
    }
  })

  it.each([6, 7])(
    'matches upstream inner U slice tokens on size %s',
    (size) => {
      const upstreamTokens: Record<number, [string, string]> = {
        6: [
          'AAAAAAAAAyoj8O0wYoGmaACKZ_5v1BUSNQxVNcVKlF2hplQ7tREU916Wv9LwRggX-g',
          'AAAAAAAAAAAAAAAAAAAAAAYqiQLFzN8_UHwsJCRyZlKC3R9_tltLquH0JANEjsMJhQ',
        ],
        7: [
          'AAAAAAAAAAAAAAAneND0rM2qsLqP_BRFFkGY2NwcsDNMY_Z5G18-CmIA3xoen0MxnKSAz8-eEwtSkQfiG63wvMDpAA',
          'AAAAAAAAAAAAAAAAAAAAAAAAAAAATOjxa7ZgsQEv04YxEHY4JN0lPYHLgFCbxqyidetVMUTYl_5rEn-zixlvgBrWOQ',
        ],
      }
      for (const depth of [1, 2]) {
        const values = Array.from({ length: 6 * size * size }, (_, i) => {
          const face = Math.floor(i / (size * size))
          const row = Math.floor((i % (size * size)) / size)
          if (row !== depth) return face
          return [0, 5, 1, 3, 2, 4][face]
        })
        const facelets = Array.from({ length: 6 }, (_, face) =>
          values
            .slice(face * size * size, (face + 1) * size * size)
            .map((value) => 'URFDLB'[value])
            .join(''),
        ).join(' ')
        const token = encodeOrbit64State(facelets)
        expect(token).toBe(upstreamTokens[size][depth - 1])
        expect(decodeOrbit64State(token!)).toBe(facelets)
      }
    },
  )

  it.each(examples)('round-trips published example %s', (token, facelets) => {
    expect(encodeOrbit64State(facelets)).toBe(token)
    expect(decodeOrbit64State(token)).toBe(facelets)
  })

  it.each(largeExamples)(
    'matches upstream large-cube vector %s',
    (token, facelets) => {
      expect(decodeOrbit64State(token)).toBe(facelets)
      expect(encodeOrbit64State(facelets)).toBe(token)
    },
  )

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

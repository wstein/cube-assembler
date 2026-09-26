import { describe, expect, it } from 'vitest'
import { faceSources, pieceKey, sourceIndex, stickerFills } from '../src/client/netPresentation'

const members = (n: number, face: string, index: number) => {
  const key = pieceKey(n, face, index)
  const out: string[] = []
  for (const f of ['u', 'r', 'f', 'd', 'l', 'b']) for (let i = 0; i < n * n; i++) if (pieceKey(n, f, i) === key) out.push(`${f}${i}`)
  return out.sort()
}

describe('pieceKey', () => {
  it('joins the three stickers of a corner, as parity.ts reads them', () => {
    // UFR: u bottom-right, r top-left, f top-right.
    expect(members(3, 'u', 8)).toEqual(['f2', 'r0', 'u8'])
    // DBL: d bottom-left, b bottom-right, l bottom-left.
    expect(members(3, 'd', 6)).toEqual(['b8', 'd6', 'l6'])
  })

  it('joins the two stickers of an edge and leaves a center alone', () => {
    expect(members(3, 'u', 7)).toEqual(['f1', 'u7'])
    expect(members(3, 'l', 5)).toEqual(['f3', 'l5'])
    expect(members(3, 'f', 4)).toEqual(['f4'])
  })

  it('finds wings on bigger cubes', () => {
    // 4x4: the UF edge has two wings, each two stickers.
    expect(members(4, 'u', 13)).toEqual(['f1', 'u13'])
    expect(members(4, 'u', 14)).toEqual(['f2', 'u14'])
  })

  it('gives every sticker of a 5x5 exactly one piece', () => {
    const sizes = new Map<string, number>()
    for (const f of ['u', 'r', 'f', 'd', 'l', 'b']) for (let i = 0; i < 25; i++) sizes.set(pieceKey(5, f, i), (sizes.get(pieceKey(5, f, i)) ?? 0) + 1)
    const counts = [...sizes.values()]
    expect(counts.filter((c) => c === 3)).toHaveLength(8)
    expect(counts.filter((c) => c === 2)).toHaveLength(36)
    expect(counts.filter((c) => c === 1)).toHaveLength(54)
  })
})

describe('faceSources', () => {
  const grid = (letters: string) => [letters.slice(0, 3).split(''), letters.slice(3, 6).split(''), letters.slice(6, 9).split('')]
  // rotateGrid clockwise: new[r][c] = old[n-1-c][r].
  const clockwise = (g: string[][]) => g.map((row, r) => row.map((_, c) => g[g.length - 1 - c][r]))

  it('finds the captured photo and quarter turns behind each net face', () => {
    const photoA = grid('WWGWWWWWW'), photoB = grid('RRRRRRRRY')
    const sources = faceSources({ u: clockwise(photoA), f: photoB }, { U: photoB, R: photoA })
    expect(sources.u).toEqual({ slot: 'R', turns: 1 })
    expect(sources.f).toEqual({ slot: 'U', turns: 0 })
  })

  it('uses each photo once and gives up on a face no photo matches', () => {
    const same = grid('GGGGGGGGG')
    const sources = faceSources({ u: same, f: same, r: grid('OOOOOOOOO') }, { U: same, R: same })
    expect(new Set([sources.u?.slot, sources.f?.slot])).toEqual(new Set(['U', 'R']))
    expect(sources.r).toBeNull()
  })

  it('maps a net sticker back to its sticker in the photo', () => {
    // One clockwise turn: net (0,0) shows photo (2,0), net (0,2) shows photo (0,0).
    expect(sourceIndex(3, 1, 0)).toBe(6)
    expect(sourceIndex(3, 1, 2)).toBe(0)
    expect(sourceIndex(3, 0, 5)).toBe(5)
    expect(sourceIndex(3, 2, 0)).toBe(8)
  })
})

describe('stickerFills', () => {
  const fixed = { W: '#f7f6f1', Y: '#f2d21b', O: '#ff7a1a', R: '#cf2a3a', G: '#1e9e57', B: '#2459d6' }

  it('draws stickers in the first detected palette available', () => {
    const learned = { W: { r: 174, g: 186, b: 206 }, Y: { r: 179, g: 202, b: 73 }, O: { r: 217, g: 87, b: 66 }, R: { r: 176, g: 41, b: 71 }, G: { r: 46, g: 166, b: 86 }, B: { r: 28, g: 98, b: 172 } }
    const fills = stickerFills([null, learned, { ...learned, R: { r: 1, g: 2, b: 3 } }], fixed)
    expect(fills.R).toBe('rgb(176 41 71)')
    expect(fills.W).toBe('rgb(174 186 206)')
  })

  it('keeps the fixed colors without a palette, and for colors a palette lacks', () => {
    expect(stickerFills([null, undefined], fixed)).toEqual(fixed)
    expect(stickerFills([{ R: { r: 10, g: 20, b: 30 } }], fixed)).toEqual({ ...fixed, R: 'rgb(10 20 30)' })
  })
})

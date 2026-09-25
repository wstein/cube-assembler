import { describe, expect, it } from 'vitest'
import { oppositeFacePreview } from '../src/client/capturePresentation'

describe('oppositeFacePreview', () => {
  it('shows yellow/Down for a captured uniform white/Up face', () => {
    const white = Array.from({ length: 3 }, () => ['W', 'W', 'W'])
    expect(oppositeFacePreview(white, [white])).toEqual(Array.from({ length: 3 }, () => ['Y', 'Y', 'Y']))
  })

  it('uses a captured opposite face instead of guessing its stickers', () => {
    const white = [['R', 'G', 'B'], ['O', 'W', 'R'], ['Y', 'B', 'G']]
    const yellow = [['B', 'Y', 'O'], ['W', 'Y', 'R'], ['G', 'O', 'B']]
    expect(oppositeFacePreview(white, [white, yellow])).toBe(yellow)
  })

  it('shows only the known opposite center on a scrambled face', () => {
    const white = [['R', 'G', 'B'], ['O', 'W', 'R'], ['Y', 'B', 'G']]
    expect(oppositeFacePreview(white, [white])).toEqual([
      ['', '', ''], ['', 'Y', ''], ['', '', ''],
    ])
  })

  it('does not invent an opposite center on a mixed even cube', () => {
    const face = [['R', 'G'], ['B', 'W']]
    expect(oppositeFacePreview(face, [face])).toEqual([['', ''], ['', '']])
  })
})

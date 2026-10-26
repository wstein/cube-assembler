import { describe, expect, it } from 'vitest'
import {
  firstGuesses,
  forcedReading,
  forcedSentence,
  WARN_MOVED,
} from '../src/client/capture/forcedStickers'

const rgb = (r: number, g: number, b: number) => ({ r, g, b })
const GRAY = rgb(235, 235, 230)
const ORANGE = rgb(240, 120, 40)
const BLUE = rgb(40, 70, 200)
const RED = rgb(190, 40, 50)
const many = (color: ReturnType<typeof rgb>, label: string, n: number) =>
  Array.from({ length: n }, () => ({ rgb: color, label }))

describe('what the equal share per color hides', () => {
  it('finds nothing to report when every sticker reads as its color', () => {
    const result = firstGuesses([
      ...many(GRAY, 'W', 6),
      ...many(ORANGE, 'O', 6),
      ...many(BLUE, 'B', 6),
    ])
    expect(result.moved).toBe(0)
    expect(result.forced).toEqual([])
    expect(result.guesses).toHaveLength(18)
  })

  it('names the stickers the balance forced into white and what they read as', () => {
    // Two oranges and one blue were forced to W to give it its share of 9.
    const samples = [
      ...many(GRAY, 'W', 6),
      ...many(ORANGE, 'W', 2),
      ...many(BLUE, 'W', 1),
      ...many(ORANGE, 'O', 9),
      ...many(BLUE, 'B', 9),
      ...many(RED, 'R', 9),
    ]
    const result = firstGuesses(samples)
    expect(result.moved).toBe(3)
    expect(result.forced).toEqual([
      {
        color: 'W',
        count: 3,
        readAs: [
          { color: 'O', count: 2 },
          { color: 'B', count: 1 },
        ],
      },
    ])
    expect(result.guesses.slice(6, 9)).toEqual(['O', 'O', 'B'])
  })

  it('warns from three moved stickers, which no valid capture reached', () => {
    expect(WARN_MOVED).toBe(3)
  })
})

describe('the forced stickers of a capture', () => {
  const face = (labels: string[], rgbs: ReturnType<typeof rgb>[]) => ({
    colors: [labels.slice(0, 2), labels.slice(2)],
    cellColors: [rgbs.slice(0, 2), rgbs.slice(2)],
    confidence: 1,
    timestamp: 0,
  })
  const same = (color: ReturnType<typeof rgb>, label: string) =>
    face(Array(4).fill(label), Array(4).fill(color))
  const captured = {
    u: same(GRAY, 'W'),
    // A white face holding three stickers that are really orange.
    r: face(['W', 'W', 'W', 'W'], [GRAY, ORANGE, ORANGE, ORANGE]),
    f: same(ORANGE, 'O'),
    d: same(rgb(235, 210, 40), 'Y'),
    l: same(rgb(60, 160, 70), 'G'),
    b: same(BLUE, 'B'),
  }

  it('marks them in each photo and reports the warning', () => {
    const reading = forcedReading(captured, ['u', 'r', 'f', 'd', 'l', 'b'])
    expect(reading.warn).toBe(true)
    expect(reading.faces.r.forced).toEqual([
      [false, true],
      [true, true],
    ])
    expect(reading.faces.r.guess[0]).toEqual(['W', 'O'])
    expect(reading.faces.u.forced.flat().some(Boolean)).toBe(false)
  })

  it('says it in one sentence', () => {
    const reading = forcedReading(captured, ['u', 'r', 'f', 'd', 'l', 'b'])
    expect(
      forcedSentence(reading.result.forced, { W: 'White', O: 'Orange' }),
    ).toBe(
      '3 stickers were moved to white; on their own they read as 3 orange.',
    )
    expect(forcedSentence([], {})).toBe('')
  })
})

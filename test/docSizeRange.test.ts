import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CUBE_SIZES } from '../src/client/profiles/profileSettings'

const read = (path: string): string =>
  readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

const maxSize = Math.max(...CUBE_SIZES)

// Files whose text states the supported cube size range.
const RANGE_FILES = [
  'AGENTS.md',
  'README.md',
  'index.html',
  'package.json',
  'docs/color-profiles.md',
  'docs/user-guide.md',
  'docs/parity.md',
  'docs/scanner.md',
]

const SIZE = String.raw`(\d+)\s*[x×]\s*\d+`
const DASH = String.raw`[–—-]`
const WORDS = [
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
]
// A line that states a true bound for something other than the cube size
// range (for example a solver engine limit) carries this marker with a
// reason: `<!-- size-range-ok: solver engines -->`. The test skips the line.
const ALLOW = 'size-range-ok:'

// Upper bounds below the maximum, in the forms the docs use:
// "2×2–7×7", "2×2—7×7", "4x4 to 7x7", "5×5 through 7×7"
const RANGE_END = new RegExp(
  String.raw`\b${SIZE}\s*(?:${DASH}|to|through)\s*${SIZE}`,
  'gi',
)
// "a cube up to 7×7"
const UP_TO = new RegExp(String.raw`\bup to\s*${SIZE}`, 'gi')
// "sizes 2 to 7", "sizes 2..7", "2 to 7 cubes"
const NUMBER_RANGE = new RegExp(
  String.raw`\b(?:sizes?\s+)?2\s*(?:${DASH}|to|through|\.\.)\s*(\d+)\b(?!\s*[x×])`,
  'gi',
)
// "two to seven", "sizes two through fifteen"
const WORD_RANGE = new RegExp(
  String.raw`\btwo\s*(?:${DASH}|to|through)\s*(${WORDS.join('|')})\b`,
  'gi',
)
// "6×6 and 7×7" (a pair, not a list item after a comma)
const PAIR = new RegExp(String.raw`(?<!,\s)\b${SIZE}\s+and\s+${SIZE}`, 'gi')

const upperBounds = (source: string): number[] => {
  const text = source
    .split('\n')
    .filter((line) => !line.includes(ALLOW))
    .join('\n')
  return [
    ...[...text.matchAll(RANGE_END)].map((m) => Number(m[2])),
    ...[...text.matchAll(UP_TO)].map((m) => Number(m[1])),
    ...[...text.matchAll(NUMBER_RANGE)].map((m) => Number(m[1])),
    ...[...text.matchAll(WORD_RANGE)].map(
      (m) => WORDS.indexOf(m[1].toLowerCase()) + 2,
    ),
    ...[...text.matchAll(PAIR)].map((m) => Number(m[2])),
  ]
}

describe('documented cube size range', () => {
  it('uses the supported maximum', () => {
    expect(maxSize).toBe(15)
  })

  for (const file of RANGE_FILES) {
    it(`${file} states no range that ends below ${maxSize}`, () => {
      const ends = upperBounds(read(file))
      expect(ends.filter((end) => end !== maxSize)).toEqual([])
    })
  }

  it('names the maximum in the README and the page description', () => {
    expect(read('README.md')).toContain(`${maxSize}×${maxSize}`)
    expect(read('index.html')).toContain(`${maxSize}x${maxSize}`)
  })
})

describe('upper bound detection', () => {
  it('reads ranges in every dash and in words', () => {
    expect(upperBounds('2×2–7×7')).toEqual([7])
    expect(upperBounds('2×2—7×7')).toEqual([7])
    expect(upperBounds('2x2 - 7x7')).toEqual([7])
    expect(upperBounds('sizes 2—7')).toEqual([7])
    expect(upperBounds('two to seven')).toEqual([7])
    expect(upperBounds('sizes Two through Seven')).toEqual([7])
    expect(upperBounds('from two to fifteen cubes')).toEqual([15])
  })

  it('skips a line that carries the allow marker', () => {
    const marked =
      'The solver engines cover 2..7 <!-- size-range-ok: solver -->'
    expect(upperBounds(marked)).toEqual([])
    expect(upperBounds(`${marked}\nup to 7×7`)).toEqual([7])
    expect(upperBounds('The solver engines cover 2..7')).toEqual([7])
  })
})

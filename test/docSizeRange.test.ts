import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CUBE_SIZES } from '../src/client/profiles/profileSettings'

const read = (path: string): string =>
  readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

const maxSize = Math.max(...CUBE_SIZES)

// Files whose text states the supported cube size range.
const RANGE_FILES = [
  'README.md',
  'index.html',
  'package.json',
  'docs/color-profiles.md',
  'docs/user-guide.md',
  'docs/parity.md',
]

// "2×2–7×7", "2x2 to 7x7", "2×2 through 7×7": a range that ends below the maximum.
const RANGE_END = /\b2\s*[x×]\s*2\s*(?:–|-|to|through)\s*(\d+)\s*[x×]\s*\d+/gi

describe('documented cube size range', () => {
  it('uses the supported maximum', () => {
    expect(maxSize).toBe(15)
  })

  for (const file of RANGE_FILES) {
    it(`${file} states no range that ends below ${maxSize}`, () => {
      const ends = [...read(file).matchAll(RANGE_END)].map((m) => Number(m[1]))
      expect(ends.filter((end) => end !== maxSize)).toEqual([])
    })
  }

  it('names the maximum in the README and the page description', () => {
    expect(read('README.md')).toContain(`${maxSize}×${maxSize}`)
    expect(read('index.html')).toContain(`${maxSize}x${maxSize}`)
  })
})

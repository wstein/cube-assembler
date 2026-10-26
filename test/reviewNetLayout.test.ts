import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { wrgFaceletsToGrids } from '../src/cube/notation/NotationOutput.gen'
import { readFixtureColors } from '../src/client/fixtures/fixtureFormat'
import { reviewNetLayout } from '../src/client/capture/approvalPhotos'

const ORDER = ['U', 'R', 'F', 'D', 'L', 'B']

function load(name: string) {
  const meta = JSON.parse(
    readFileSync(join(__dirname, 'fixtures', name, 'meta.json'), 'utf8'),
  )
  const slots = readFixtureColors(meta)!.colors
  const captured = Object.fromEntries(
    ORDER.map((key) => [
      key,
      { colors: slots[key], confidence: 1, timestamp: 0 },
    ]),
  )
  const assembled = wrgFaceletsToGrids(meta.capture.assembledURFDLB) as Record<
    string,
    string[][]
  >
  return { captured, assembled }
}

describe('the review mini net', () => {
  for (const name of [
    'cube-5x5-2026-10-25T23-50-58',
    'cube-7x7-2026-10-22T19-26-13',
  ]) {
    it(`lays ${name} out as the cube net, each face on its own place`, () => {
      const { captured, assembled } = load(name)
      const layout = reviewNetLayout(captured as never, ORDER)!
      expect(layout).not.toBeNull()
      // Every net place holds a different photo, whose center is the
      // approved cube's center for that face.
      expect(new Set(Object.values(layout).map((l) => l.slot)).size).toBe(6)
      for (const face of ORDER) {
        const mid = Math.floor(assembled[face].length / 2)
        const slotColors = captured[ORDER[layout[face].slot]].colors
        expect(slotColors[mid][mid]).toBe(assembled[face][mid][mid])
      }
    })
  }

  it('gives no layout when the faces cannot be put together', () => {
    const { captured } = load('cube-5x5-2026-10-26T00-18-58')
    expect(reviewNetLayout(captured as never, ORDER)).toBeNull()
  })
})

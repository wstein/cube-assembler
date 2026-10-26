import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { wrgFaceletsToGrids } from '../src/cube/notation/NotationOutput.gen'
import { readFixtureColors } from '../src/client/fixtures/fixtureFormat'
import { miniNet, reviewNetLayout } from '../src/client/capture/approvalPhotos'

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

describe('the mini net', () => {
  const good = 'cube-5x5-2026-10-25T23-50-58'

  it('is the cube net, named Left to Down, once the photos fit', () => {
    const { captured } = load(good)
    const items = miniNet(captured as never, ORDER, 5)
    expect(items.map((item) => item.area).sort()).toEqual(
      ['1 / 2', '2 / 1', '2 / 2', '2 / 3', '2 / 4', '3 / 2'].sort(),
    )
    expect(items.find((item) => item.area === '2 / 1')?.name).toBe('Left')
    expect(items.find((item) => item.area === '3 / 2')?.name).toBe('Down')
    expect(new Set(items.map((item) => item.slot)).size).toBe(6)
  })

  it('is the capture net while faces are missing, empty ones undecided', () => {
    const { captured } = load(good)
    delete (captured as Record<string, unknown>).D
    const items = miniNet(captured as never, ORDER, 5)
    expect(items).toHaveLength(6)
    const bottom = items.find((item) => item.slot === 3)!
    expect(bottom.captured).toBe(false)
    expect(bottom.colors).toHaveLength(5)
    expect(items.find((item) => item.slot === 0)?.area).toBe('2 / 1')
  })

  it('carries how far a photo turns to sit in the net', () => {
    const { captured } = load(good)
    for (const item of miniNet(captured as never, ORDER, 5))
      expect([0, 1, 2, 3]).toContain(item.turns)
  })
})

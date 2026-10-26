import { describe, expect, it } from 'vitest'
import {
  pointsInPolygon,
  selectionCounts,
} from '../src/client/capture/hueScatter'

const square = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 10 },
  { x: 0, y: 10 },
]

describe('lasso selection', () => {
  it('picks the points inside the outline, whichever way it was drawn', () => {
    const points = [
      { x: 5, y: 5 },
      { x: 15, y: 5 },
      { x: -1, y: 5 },
      { x: 9.9, y: 0.1 },
    ]
    expect(pointsInPolygon(square, points)).toEqual([0, 3])
    expect(pointsInPolygon([...square].reverse(), points)).toEqual([0, 3])
  })

  it('follows a concave outline', () => {
    // A U shape: the notch between the arms is outside.
    const u = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 7, y: 10 },
      { x: 7, y: 3 },
      { x: 3, y: 3 },
      { x: 3, y: 10 },
      { x: 0, y: 10 },
    ]
    expect(
      pointsInPolygon(u, [
        { x: 1, y: 8 },
        { x: 5, y: 8 },
        { x: 5, y: 1 },
        { x: 9, y: 8 },
      ]),
    ).toEqual([0, 2, 3])
  })

  it('selects nothing with fewer than three outline points', () => {
    expect(pointsInPolygon(square.slice(0, 2), [{ x: 5, y: 5 }])).toEqual([])
  })

  it('counts the selection by color against the share of a whole cube', () => {
    const rgb = { r: 0, g: 0, b: 0 }
    const colors = 'WYORGB'
    // 12 stickers: two of each color, so two is the expected share.
    const samples = Array.from({ length: 12 }, (_, i) => ({
      rgb,
      label: colors[i % 6],
    }))
    expect(selectionCounts(samples, [2, 8, 3])).toEqual([
      { label: 'O', count: 2, expected: 2 },
      { label: 'R', count: 1, expected: 2 },
    ])
  })

  it('has no expected share unless the stickers divide into six colors', () => {
    const rgb = { r: 0, g: 0, b: 0 }
    expect(
      selectionCounts(
        [
          { rgb, label: 'W' },
          { rgb, label: 'W' },
        ],
        [0, 1],
      ),
    ).toEqual([{ label: 'W', count: 2, expected: 0 }])
  })
})

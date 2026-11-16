import { expect, it } from 'vitest'
import { nearestInspectorCell } from '../src/client/netInspectorPosition'

it('uses only free cross-net cells and chooses the nearest cell for every face', () => {
  expect(nearestInspectorCell('u')).toEqual({ column: 0, row: 0 })
  expect(nearestInspectorCell('l')).toEqual({ column: 0, row: 0 })
  expect(nearestInspectorCell('f')).toEqual({ column: 0, row: 0 })
  expect(nearestInspectorCell('r')).toEqual({ column: 2, row: 0 })
  expect(nearestInspectorCell('b')).toEqual({ column: 3, row: 0 })
  expect(nearestInspectorCell('d')).toEqual({ column: 0, row: 2 })
})
it('keeps the previous placement for equal-distance ties without accepting an occupied cell', () => {
  expect(nearestInspectorCell('b', { column: 3, row: 2 })).toEqual({
    column: 3,
    row: 2,
  })
  expect(nearestInspectorCell('f', { column: 2, row: 2 })).toEqual({
    column: 2,
    row: 2,
  })
  expect(nearestInspectorCell('b', { column: 1, row: 1 })).toEqual({
    column: 3,
    row: 0,
  })
})

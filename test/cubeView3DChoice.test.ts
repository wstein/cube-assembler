import { describe, expect, it } from 'vitest'
import { puzlwerkViewerRequested } from '../src/client/view3d/cubeView3DChoice'

describe('puzlwerkViewerRequested', () => {
  it('selects the PuzlWerk viewer only for viewer=puzlwerk', () => {
    expect(puzlwerkViewerRequested('?viewer=puzlwerk')).toBe(true)
    expect(puzlwerkViewerRequested('?x=1&viewer=puzlwerk')).toBe(true)
  })
  it('keeps the existing view for everything else', () => {
    for (const search of [
      '',
      '?',
      '?viewer=',
      '?viewer=old',
      '?viewer=PuzlWerk',
      '?viewers=puzlwerk',
      '?puzlwerk',
      '?other=puzlwerk',
    ])
      expect(puzlwerkViewerRequested(search), search).toBe(false)
  })
})

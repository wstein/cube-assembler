import type { PlayEvent } from '@puzlwerk/viewer'
import { describe, expect, it } from 'vitest'
import {
  helpHintText,
  isWideSelection,
  LOCKED_HINT_TEXT,
  lockedHintShouldShow,
  WIDE_BADGE_TEXT,
  wideBadgeAfter,
} from '../src/client/view3d/puzlwerkHints'

const begin = (
  layers: number[],
  source: 'drag' | 'pair' = 'drag',
): PlayEvent => ({
  type: 'turn-begin',
  axis: 'X',
  layers,
  pieceIds: [],
  source,
})
const committed: PlayEvent = {
  type: 'turn-end',
  outcome: 'committed',
  turns: 1,
}
const cancelled: PlayEvent = { type: 'turn-end', outcome: 'cancelled' }

describe('overlay texts keep the wording of the existing view', () => {
  it('has the badge and the locked hint', () => {
    expect(WIDE_BADGE_TEXT).toBe('Wide turn: drag to turn the touched layers')
    expect(LOCKED_HINT_TEXT).toBe('Locked - tap the lock to move layers')
  })

  it('has the help line for a fine pointer, with and without the seam rule', () => {
    expect(helpHintText(false, false)).toBe(
      'Swipe a sticker to turn its layer; gaps are inactive • Shift makes a wide turn • Two fingers on the cube turn the whole cube • Drag the background or swipe two fingers beside the cube to rotate the view • Pinch or scroll to zoom',
    )
    expect(helpHintText(false, true)).toContain(
      'gaps are inactive; swipe near a gap and lean toward a side for a wide turn • Shift',
    )
  })

  it('has the help line for a coarse pointer, with and without the seam rule', () => {
    expect(helpHintText(true, false)).toBe(
      'Swipe a sticker to turn its layer; gaps are inactive • Two fingers on the cube turn it, beside it rotate the view • Pinch to zoom',
    )
    expect(helpHintText(true, true)).toContain(
      'gaps are inactive; swipe near a gap and lean toward a side for a wide turn • Two fingers',
    )
  })
})

describe('wide badge', () => {
  it('counts a drag over some but not all layers as wide', () => {
    expect(isWideSelection(begin([0]), 5)).toBe(false)
    expect(isWideSelection(begin([0, 1]), 5)).toBe(true)
    expect(isWideSelection(begin([3, 4]), 5)).toBe(true)
    expect(isWideSelection(begin([0, 1, 2, 3, 4]), 5)).toBe(false)
    expect(isWideSelection(begin([0, 1], 'pair'), 5)).toBe(false)
    expect(isWideSelection(committed, 5)).toBe(false)
  })

  it('shows from a wide selection until the turn ends, however it ends', () => {
    expect(wideBadgeAfter(false, begin([0, 1]), 3)).toBe(true)
    expect(wideBadgeAfter(true, committed, 3)).toBe(false)
    expect(wideBadgeAfter(true, cancelled, 3)).toBe(false)
    expect(wideBadgeAfter(false, begin([0]), 3)).toBe(false)
  })

  it('keeps its state on events that do not start or end a turn', () => {
    const hover: PlayEvent = { type: 'hover', stickerId: 'x' }
    const error: PlayEvent = { type: 'error', error: { code: 'Bad' } }
    expect(wideBadgeAfter(true, hover, 3)).toBe(true)
    expect(wideBadgeAfter(false, hover, 3)).toBe(false)
    expect(wideBadgeAfter(true, error, 3)).toBe(true)
  })
})

describe('locked hint', () => {
  const base = {
    locked: true,
    dx: 20,
    dy: 0,
    startPx: 14,
    lastShownAt: null,
    now: 100_000,
  }

  it('shows after a drag of the start distance while locked', () => {
    expect(lockedHintShouldShow(base)).toBe(true)
    expect(lockedHintShouldShow({ ...base, dx: 10, dy: 10 })).toBe(true)
    expect(lockedHintShouldShow({ ...base, dx: 13 })).toBe(false)
    expect(lockedHintShouldShow({ ...base, locked: false })).toBe(false)
  })

  it('does not repeat within the gap and returns after it', () => {
    expect(lockedHintShouldShow({ ...base, lastShownAt: 96_000 })).toBe(false)
    expect(lockedHintShouldShow({ ...base, lastShownAt: 95_000 })).toBe(true)
  })
})

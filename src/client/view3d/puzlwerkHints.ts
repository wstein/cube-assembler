// Overlay hint texts and their conditions for the main 3D view on the PuzlWerk viewer. The viewer
// draws no texts; the app shows them as DOM over the stage. Wording and conditions follow the
// existing view (`cubeView3DPresentation.tsx`, `cubeView3D.tsx`, `useCubeGestures.ts`).
// Only a type import of the viewer here, so the module pulls no viewer code.
import type { PlayEvent } from '@puzlwerk/viewer'
import { lockedHintDue } from './cubeGesture'

export const WIDE_BADGE_TEXT = 'Wide turn: drag to turn the touched layers'
export const LOCKED_HINT_TEXT = 'Locked - tap the lock to move layers'
export const LOCKED_HINT_VISIBLE_MS = 2500

const BULLET = ' • '

// The help line: the swipe rule, the seam rule when it is on, then the controls of the pointer kind.
export const helpHintText = (coarse: boolean, seamWide: boolean): string => {
  const swipe = `Swipe a sticker to turn its layer; gaps are inactive${
    seamWide ? '; swipe near a gap and lean toward a side for a wide turn' : ''
  }`
  return coarse
    ? [
        swipe,
        'Two fingers on the cube turn it, beside it rotate the view',
        'Pinch to zoom',
      ].join(BULLET)
    : [
        swipe,
        'Shift makes a wide turn',
        'Two fingers on the cube turn the whole cube',
        'Drag the background or swipe two fingers beside the cube to rotate the view',
        'Pinch or scroll to zoom',
      ].join(BULLET)
}

// A drag selects a wide block when it turns more than one layer but not the whole cube.
export const isWideSelection = (event: PlayEvent, size: number): boolean =>
  event.type === 'turn-begin' &&
  event.source === 'drag' &&
  event.layers.length > 1 &&
  event.layers.length < size

// The badge shows from the selection of a wide block until its turn ends.
export const wideBadgeAfter = (
  shown: boolean,
  event: PlayEvent,
  size: number,
): boolean => {
  if (event.type === 'turn-begin') return isWideSelection(event, size)
  if (event.type === 'turn-end') return false
  return shown
}

// A drag on the canvas while the layers are locked explains the lock once it moved `startPx`,
// and not again within the gap.
export const lockedHintShouldShow = (input: {
  locked: boolean
  dx: number
  dy: number
  startPx: number
  lastShownAt: number | null
  now: number
}): boolean =>
  input.locked &&
  Math.hypot(input.dx, input.dy) >= input.startPx &&
  lockedHintDue(input.lastShownAt, input.now)

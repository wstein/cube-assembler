// Released-drag friction: typed entry point for src/core/view/DragInertia.res.
import { stepDragInertia as stepDragInertiaRes } from '../core/view/DragInertia.gen'

/** Integrate one frame of a released drag with time-based friction. */
export function stepDragInertia(
  velocity: number,
  elapsedMs: number,
): { delta: number; velocity: number } {
  return stepDragInertiaRes(velocity, elapsedMs)
}

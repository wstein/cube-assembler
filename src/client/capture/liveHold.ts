// Detect face's live display holds a confirmed face through a weak frame or
// two instead of flickering: typed entry point for
// src/core/capture/LiveHold.res.
import {
  holdConfirmedFace as holdConfirmedFaceRes,
  liveHoldFrames,
  noHold,
} from '../../core/capture/LiveHold.gen'

export const LIVE_HOLD_FRAMES = liveHoldFrames

export interface LiveHold<T> {
  // The last confirmed frame's result, while it may still be shown.
  shown: T | null
  // Weak frames in a row since it was confirmed.
  weak: number
}

export const NO_HOLD: LiveHold<never> = noHold()

// What to show for `frame`: itself when `confirmed`, otherwise the last
// confirmed result for up to LIVE_HOLD_FRAMES weak frames, then `frame` as
// not found.
export function holdConfirmedFace<T>(
  hold: LiveHold<T>,
  frame: T,
  confirmed: boolean,
): { hold: LiveHold<T>; show: T; visible: boolean } {
  return holdConfirmedFaceRes(hold, frame, confirmed)
}

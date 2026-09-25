// Detect face's live display holds a confirmed face through a weak frame
// or two - motion blur, a finger passing - instead of flickering between
// the colors and "Align face in view". Display only: capturing, automatic
// capture and saved diagnostics still judge every frame on its own, and a
// held face never lends its bounds to a new frame.

export const LIVE_HOLD_FRAMES = 2

export interface LiveHold<T> {
  // The last confirmed frame's result, while it may still be shown.
  shown: T | null
  // Weak frames in a row since it was confirmed.
  weak: number
}

export const NO_HOLD: LiveHold<never> = { shown: null, weak: 0 }

// What to show for `frame`: itself when `confirmed`, otherwise the last
// confirmed result for up to LIVE_HOLD_FRAMES weak frames, then `frame`
// as not found.
export function holdConfirmedFace<T>(hold: LiveHold<T>, frame: T, confirmed: boolean): { hold: LiveHold<T>; show: T; visible: boolean } {
  if (confirmed) return { hold: { shown: frame, weak: 0 }, show: frame, visible: true }
  if (hold.shown !== null && hold.weak < LIVE_HOLD_FRAMES) {
    return { hold: { shown: hold.shown, weak: hold.weak + 1 }, show: hold.shown, visible: true }
  }
  return { hold: NO_HOLD, show: frame, visible: false }
}

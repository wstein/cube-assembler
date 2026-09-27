const DECAY_MS = 240
const STOP_SPEED = 0.00003

/** Integrate one frame of a released drag with time-based friction. */
export function stepDragInertia(
  velocity: number,
  elapsedMs: number,
): { delta: number; velocity: number } {
  if (Math.abs(velocity) < STOP_SPEED || elapsedMs <= 0) {
    return { delta: 0, velocity: 0 }
  }
  const decay = Math.exp(-elapsedMs / DECAY_MS)
  const next = velocity * decay
  return {
    delta: velocity * DECAY_MS * (1 - decay),
    velocity: Math.abs(next) < STOP_SPEED ? 0 : next,
  }
}

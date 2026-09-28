// How a layer turn feels: magnetic cubes hold a layer briefly, then snap it
// a little past the quarter turn and let it settle.

// Overshoot strength of the snap; 1.0 goes about 3.7% past the turn.
const SNAP = 1.0

export function magneticEase(progress: number): number {
  const t = Math.min(1, Math.max(0, progress))
  if (t === 0 || t === 1) return t
  // A slow start, then an ease-out that overshoots near the end and settles.
  const x = t * t - 1
  return 1 + (SNAP + 1) * x * x * x + SNAP * x * x
}

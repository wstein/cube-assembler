// How a layer turn feels: magnetic cubes hold a layer briefly, then snap it
// a little past the quarter turn and let it settle, with a soft click.

// Overshoot strength of the snap; 1.0 goes about 3.7% past the turn.
const SNAP = 1.0

export function magneticEase(progress: number): number {
  const t = Math.min(1, Math.max(0, progress))
  if (t === 0 || t === 1) return t
  // A slow start, then an ease-out that overshoots near the end and settles.
  const x = t * t - 1
  return 1 + (SNAP + 1) * x * x * x + SNAP * x * x
}

// A plain ease-out for those who turn the magnetic snap off.
export function smoothEase(progress: number): number {
  const t = Math.min(1, Math.max(0, progress))
  return 1 - (1 - t) ** 3
}

export function turnEase(progress: number, overshoot: boolean): number {
  return overshoot ? magneticEase(progress) : smoothEase(progress)
}

// A quarter turn's animation at the default speed. A released drag settles
// in proportion to how far it has left, between three quarters and one and
// a half of that; scrambles run at about half of it.
export const DEFAULT_TURN_MS = 160

export function settleDuration(quarters: number, turnMs: number): number {
  return Math.max(0.75 * turnMs, Math.min(1.5 * turnMs, turnMs * quarters))
}

export function scrambleDuration(turnMs: number): number {
  return Math.round((turnMs * 85) / DEFAULT_TURN_MS)
}

// Scrambles turn every 85 ms; full-volume clicks would rattle.
export function turnClickGain(durationMs: number, soundOn: boolean): number {
  if (!soundOn) return 0
  return durationMs < 120 ? 0.05 : 0.12
}

let audio: AudioContext | null = null

// A short, filtered noise burst, like plastic snapping into place. Audio is
// optional: without Web Audio, or before the page may play sound, it stays
// silent.
export function playTurnClick(gain: number): void {
  if (gain <= 0) return
  try {
    audio ??= new AudioContext()
    if (audio.state === 'suspended') void audio.resume()
    const now = audio.currentTime
    const length = Math.floor(audio.sampleRate * 0.03)
    const buffer = audio.createBuffer(1, length, audio.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < length; i++)
      data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3
    const source = audio.createBufferSource()
    source.buffer = buffer
    const filter = audio.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = 2400
    filter.Q.value = 1.2
    const volume = audio.createGain()
    volume.gain.setValueAtTime(gain, now)
    volume.gain.exponentialRampToValueAtTime(0.0001, now + 0.03)
    source.connect(filter).connect(volume).connect(audio.destination)
    source.start(now)
  } catch {
    // Sound is a nicety; turning works without it.
  }
}

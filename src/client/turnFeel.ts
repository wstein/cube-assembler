// How a layer turn feels: the easing lives in src/core/view/TurnFeel.res;
// this plays its soft click and mode cues.
import { modeCueGain, wideCueNotes } from '../core/view/TurnFeel.gen'

export {
  defaultTurnMs as DEFAULT_TURN_MS,
  magneticDragAngle,
  magneticEase,
  magneticSettleAngle,
  magnetImpact as MAGNET_IMPACT,
  magnetReach as MAGNET_REACH,
  scrambleDuration,
  settleDuration,
  turnClickGain,
  turnEase,
} from '../core/view/TurnFeel.gen'

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

export const MODE_CUE_GAIN = modeCueGain
export const WIDE_CUE_NOTES = wideCueNotes

// Selecting a wide turn plays one short tone.
export function playWideCue(gain: number): void {
  if (gain <= 0) return
  try {
    audio ??= new AudioContext()
    if (audio.state === 'suspended') void audio.resume()
    const now = audio.currentTime
    for (const note of wideCueNotes) {
      const tone = audio.createOscillator()
      tone.type = 'sine'
      tone.frequency.value = note.frequency
      const volume = audio.createGain()
      const start = now + note.start
      volume.gain.setValueAtTime(0.0001, start)
      volume.gain.exponentialRampToValueAtTime(gain, start + 0.008)
      volume.gain.exponentialRampToValueAtTime(0.0001, start + note.duration)
      tone.connect(volume).connect(audio.destination)
      tone.start(start)
      tone.stop(start + note.duration + 0.01)
    }
  } catch {
    // Sound is a nicety; the badge still shows the mode.
  }
}

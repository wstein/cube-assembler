import { useEffect, useRef, useState } from 'preact/hooks'

export function useCaptureFeedback(soundEnabled: boolean) {
  const [flash, setFlash] = useState(false)
  const audioRef = useRef<AudioContext | null>(null)
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const armAudio = (enabled = soundEnabled) => {
    if (!enabled) return
    try {
      audioRef.current ??= new AudioContext()
      void audioRef.current.resume()
    } catch {
      // Capture remains available in browsers without Web Audio.
    }
  }

  const signalCapture = () => {
    setFlash(true)
    if (flashTimer.current) clearTimeout(flashTimer.current)
    flashTimer.current = setTimeout(() => setFlash(false), 220)
    const audio = soundEnabled ? audioRef.current : null
    if (!audio || audio.state !== 'running') return

    const buffer = audio.createBuffer(
      1,
      Math.ceil(audio.sampleRate * 0.07),
      audio.sampleRate,
    )
    const samples = buffer.getChannelData(0)
    for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1
    const click = audio.createBufferSource()
    click.buffer = buffer
    const filter = audio.createBiquadFilter()
    filter.type = 'highpass'
    filter.frequency.value = 700
    const volume = audio.createGain()
    const now = audio.currentTime
    volume.gain.setValueAtTime(0.13, now)
    volume.gain.exponentialRampToValueAtTime(0.001, now + 0.07)
    click.connect(filter).connect(volume).connect(audio.destination)
    click.start(now)
    click.stop(now + 0.07)
  }

  useEffect(
    () => () => {
      if (flashTimer.current) clearTimeout(flashTimer.current)
      void audioRef.current?.close()
    },
    [],
  )

  return { flash, armAudio, signalCapture }
}

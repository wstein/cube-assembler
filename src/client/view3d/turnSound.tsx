// The turn sound setting and its toolbar button, shared by the existing 3D view and the PuzlWerk main
// view: the cookie, the gains of the click and of the wide-turn cue, and the Sound button's markup.
import { useState } from 'preact/hooks'
import {
  preferenceCookie,
  TURN_SOUND_COOKIE,
  turnSoundOn,
} from '../preferences'
import {
  MODE_CUE_GAIN,
  playTurnClick,
  playWideCue,
  turnClickGain,
} from './turnFeel'

export const nextTurnSound = (cookies: string): boolean => !turnSoundOn(cookies)

// Gain of the click of a finished turn that took `durationMs`; 0 when sound is off.
export const turnClickGainFor = (durationMs: number, cookies: string): number =>
  turnClickGain(durationMs, turnSoundOn(cookies))

export const wideCueGainFor = (cookies: string): number =>
  turnSoundOn(cookies) ? MODE_CUE_GAIN : 0

// The click of a finished turn, as the existing view plays it.
export const playFinishedTurnClick = (durationMs: number): void =>
  playTurnClick(turnClickGainFor(durationMs, document.cookie))

// The cue of a selected wide turn.
export const playWideTurnCue = (): void =>
  playWideCue(wideCueGainFor(document.cookie))

// The setting as state; a toggle stores the cookie.
export function useTurnSound(): [boolean, () => void] {
  const [on, setOn] = useState(() => turnSoundOn(document.cookie))
  const toggle = () => {
    const enabled = nextTurnSound(document.cookie)
    document.cookie = preferenceCookie(TURN_SOUND_COOKIE, enabled)
    setOn(enabled)
  }
  return [on, toggle]
}

export function TurnSoundButton({
  on,
  onToggle,
}: {
  on: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      class={`cube-3d-btn ${on ? 'cube-3d-btn-active' : ''}`}
      aria-pressed={on}
      onClick={onToggle}
    >
      <svg
        viewBox="0 0 16 16"
        width="14"
        height="14"
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M2 6h2l4-3v10l-4-3H2z" />
        <path d={on ? 'M11 5a4 4 0 0 1 0 6' : 'm11 6 4 4m0-4-4 4'} />
      </svg>{' '}
      Sound
    </button>
  )
}

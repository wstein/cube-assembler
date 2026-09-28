// The settings page (#settings): app-wide preferences kept in cookies.
import '../../web/settings.css'
import { useState } from 'preact/hooks'
import { DEFAULT_HOLD_TIMINGS } from './cubeGesture'
import {
  CUBE_PRESS_COOKIE,
  HOLD_TIMING_LIMITS,
  WIDE_PRESS_COOKIE,
  holdTimingCookie,
  readHoldTimings,
} from './preferences'

interface Props {
  onClose: () => void
}

export function SettingsPage({ onClose }: Props) {
  const [timings, setTimings] = useState(() => readHoldTimings(document.cookie))
  const { minMs, maxMs, gapMs } = HOLD_TIMING_LIMITS

  // Saves both times as the view will read them, so the whole cube always
  // stays reachable after the block.
  const save = (blockMs: number, cubeMs: number) => {
    document.cookie = holdTimingCookie(WIDE_PRESS_COOKIE, blockMs)
    document.cookie = holdTimingCookie(CUBE_PRESS_COOKIE, cubeMs)
    const saved = readHoldTimings(document.cookie)
    document.cookie = holdTimingCookie(CUBE_PRESS_COOKIE, saved.cubeMs)
    setTimings(saved)
  }

  return (
    <div class="settings-page">
      <header class="settings-header">
        <button
          type="button"
          class="btn btn-secondary btn-sm"
          onClick={onClose}
        >
          ← Back to the scanner
        </button>
        <h1>Settings</h1>
        <p class="settings-muted">
          Saved in this browser's cookies and used right away.
        </p>
      </header>

      <section class="card settings-section" aria-labelledby="settings-hold">
        <h2 id="settings-hold">Turning several layers</h2>
        <p class="settings-muted">
          Hold a sticker in the 3D view before dragging to turn a block of
          layers, and hold it longer to turn the whole cube.
        </p>
        <label class="settings-slider">
          <span>Hold for a block of layers</span>
          <input
            type="range"
            aria-label="Hold for a block of layers"
            min={minMs}
            max={maxMs - gapMs}
            step={50}
            value={timings.blockMs}
            onInput={(e) => save(Number(e.currentTarget.value), timings.cubeMs)}
          />
          <output>{timings.blockMs} ms</output>
        </label>
        <label class="settings-slider">
          <span>Hold for the whole cube</span>
          <input
            type="range"
            aria-label="Hold for the whole cube"
            min={minMs + gapMs}
            max={maxMs}
            step={50}
            value={timings.cubeMs}
            onInput={(e) =>
              save(timings.blockMs, Number(e.currentTarget.value))
            }
          />
          <output>{timings.cubeMs} ms</output>
        </label>
        <button
          type="button"
          class="btn btn-secondary btn-sm"
          disabled={
            timings.blockMs === DEFAULT_HOLD_TIMINGS.blockMs &&
            timings.cubeMs === DEFAULT_HOLD_TIMINGS.cubeMs
          }
          onClick={() =>
            save(DEFAULT_HOLD_TIMINGS.blockMs, DEFAULT_HOLD_TIMINGS.cubeMs)
          }
        >
          Reset to {DEFAULT_HOLD_TIMINGS.blockMs} and{' '}
          {DEFAULT_HOLD_TIMINGS.cubeMs} ms
        </button>
      </section>
    </div>
  )
}

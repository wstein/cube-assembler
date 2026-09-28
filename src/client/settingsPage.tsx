// The settings page (#settings): app-wide preferences kept in cookies.
import '../../web/settings.css'
import type { ComponentChildren } from 'preact'
import { useState } from 'preact/hooks'
import { DEFAULT_HOLD_TIMINGS } from './cubeGesture'
import {
  AUTO_CAPTURE_COOKIE,
  CAPTURE_MODE_COOKIE,
  NOTATION_COOKIE,
  CUBE_PRESS_COOKIE,
  HOLD_TIMING_LIMITS,
  MIRROR_COOKIE,
  SETTING_COOKIES,
  SOUND_COOKIE,
  WIDE_PRESS_COOKIE,
  clearedCookie,
  holdTimingCookie,
  preferenceCookie,
  readHoldTimings,
  readPreference,
  selectedCaptureMode,
  selectedNotationFormat,
  selectionCookie,
} from './preferences'
import { ChoiceSetting, SliderSetting, ToggleSetting } from './settingControls'

interface Props {
  onClose: () => void
}

function Section({
  id,
  title,
  hint,
  children,
}: {
  id: string
  title: string
  hint?: string
  children: ComponentChildren
}) {
  return (
    <section class="card settings-section" aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      {hint && <p class="settings-muted">{hint}</p>}
      {children}
    </section>
  )
}

export function SettingsPage({ onClose }: Props) {
  // Every control reads the cookies, so a reset shows at once.
  const [cookies, setCookies] = useState(() => document.cookie)
  const write = (...updates: string[]) => {
    for (const cookie of updates) document.cookie = cookie
    setCookies(document.cookie)
  }

  const timings = readHoldTimings(cookies)
  const { minMs, maxMs, gapMs } = HOLD_TIMING_LIMITS
  // Saves both times as the view will read them, so the whole cube always
  // stays reachable after the block.
  const saveHold = (blockMs: number, cubeMs: number) => {
    const saved = readHoldTimings(
      [
        holdTimingCookie(WIDE_PRESS_COOKIE, blockMs),
        holdTimingCookie(CUBE_PRESS_COOKIE, cubeMs),
      ]
        .map((cookie) => cookie.split(';')[0])
        .join('; '),
    )
    write(
      holdTimingCookie(WIDE_PRESS_COOKIE, saved.blockMs),
      holdTimingCookie(CUBE_PRESS_COOKIE, saved.cubeMs),
    )
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

      <Section id="settings-capture" title="Capture">
        <ChoiceSetting
          label="Find the face by"
          hint="The capture dialog can switch it too."
          value={selectedCaptureMode(cookies)}
          options={[
            { value: 'cv', label: 'Detect face' },
            { value: 'guide', label: 'Guide grid' },
          ]}
          onChange={(mode) => write(selectionCookie(CAPTURE_MODE_COOKIE, mode))}
        />
        <ToggleSetting
          label="Mirror the camera preview"
          hint="Like a mirror, as most webcams show you."
          checked={readPreference(cookies, MIRROR_COOKIE)}
          onChange={(on) => write(preferenceCookie(MIRROR_COOKIE, on))}
        />
        <ToggleSetting
          label="Auto capture"
          hint="Take the photo once the face holds still."
          checked={readPreference(cookies, AUTO_CAPTURE_COOKIE)}
          onChange={(on) => write(preferenceCookie(AUTO_CAPTURE_COOKIE, on))}
        />
        <ToggleSetting
          label="Capture sound"
          hint="A shutter click and flash for each photo."
          checked={readPreference(cookies, SOUND_COOKIE)}
          onChange={(on) => write(preferenceCookie(SOUND_COOKIE, on))}
        />
      </Section>

      <Section
        id="settings-hold"
        title="Turning several layers"
        hint="Hold a sticker in the 3D view before dragging to turn a block of layers, and hold it longer to turn the whole cube."
      >
        <SliderSetting
          label="Hold for a block of layers"
          min={minMs}
          max={maxMs - gapMs}
          step={50}
          value={timings.blockMs}
          unit=" ms"
          onChange={(blockMs) => saveHold(blockMs, timings.cubeMs)}
        />
        <SliderSetting
          label="Hold for the whole cube"
          min={minMs + gapMs}
          max={maxMs}
          step={50}
          value={timings.cubeMs}
          unit=" ms"
          onChange={(cubeMs) => saveHold(timings.blockMs, cubeMs)}
        />
        <button
          type="button"
          class="btn btn-secondary btn-sm"
          disabled={
            timings.blockMs === DEFAULT_HOLD_TIMINGS.blockMs &&
            timings.cubeMs === DEFAULT_HOLD_TIMINGS.cubeMs
          }
          onClick={() =>
            saveHold(DEFAULT_HOLD_TIMINGS.blockMs, DEFAULT_HOLD_TIMINGS.cubeMs)
          }
        >
          Reset to {DEFAULT_HOLD_TIMINGS.blockMs} and{' '}
          {DEFAULT_HOLD_TIMINGS.cubeMs} ms
        </button>
      </Section>

      <Section id="settings-notation" title="Notation">
        <ChoiceSetting
          label="Write the cube as"
          value={selectedNotationFormat(cookies)}
          options={[
            { value: 'wrg', label: 'Colors (WRG)' },
            { value: 'urf', label: 'Faces (URF)' },
          ]}
          onChange={(format) => write(selectionCookie(NOTATION_COOKIE, format))}
        />
      </Section>

      <div class="settings-reset">
        <button
          type="button"
          class="btn btn-secondary btn-sm"
          onClick={() => write(...SETTING_COOKIES.map(clearedCookie))}
        >
          Reset all settings
        </button>
        <span class="settings-muted">
          Keeps the cube, colors and view picked in the scanner.
        </span>
      </div>
    </div>
  )
}

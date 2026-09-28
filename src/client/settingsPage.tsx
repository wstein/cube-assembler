// The settings page (#settings): app-wide preferences kept in cookies.
import '../../web/settings.css'
import type { ComponentChildren } from 'preact'
import { useState } from 'preact/hooks'
import { DEFAULT_HOLD_TIMINGS } from './cubeGesture'
import {
  AUTO_CAPTURE_COOKIE,
  AUTO_CAPTURE_FRAMES_COOKIE,
  AUTO_CAPTURE_FRAMES_RANGE,
  FIXTURE_SERVER_URL_COOKIE,
  LOCAL_UPLOAD_COOKIE,
  CAPTURE_MODE_COOKIE,
  NOTATION_COOKIE,
  CUBE_PRESS_COOKIE,
  HOLD_TIMING_LIMITS,
  MIRROR_COOKIE,
  SCRAMBLE_INNER_COOKIE,
  SCRAMBLE_LENGTH_COOKIE,
  SETTING_COOKIES,
  SWIPE_COMMIT_COOKIE,
  SWIPE_FLICK_COOKIE,
  SWIPE_RANGES,
  SWIPE_START_COOKIE,
  SOUND_COOKIE,
  TURN_MS_COOKIE,
  TURN_MS_RANGE,
  TURN_OVERSHOOT_COOKIE,
  TURN_SOUND_COOKIE,
  VIBRATION_COOKIE,
  WIDE_PRESS_COOKIE,
  clearedCookie,
  holdTimingCookie,
  localUploadShown,
  preferenceCookie,
  readHoldTimings,
  readPreference,
  selectedCaptureMode,
  selectedNotationFormat,
  selectionCookie,
  numberCookie,
  readAutoCaptureFrames,
  readFixtureServer,
  readScrambleOptions,
  readSwipeTuning,
  readTurnFeel,
  turnSoundOn,
  vibrationOn,
} from './preferences'
import { DEFAULT_FIXTURE_SERVER, loopbackFixtureServer } from './fixtureUpload'
import {
  ChoiceSetting,
  SliderSetting,
  TextSetting,
  ToggleSetting,
} from './settingControls'

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
        <SliderSetting
          label="Auto capture waits for"
          hint="Matching frames in a row; more is steadier, fewer is quicker."
          min={AUTO_CAPTURE_FRAMES_RANGE.min}
          max={AUTO_CAPTURE_FRAMES_RANGE.max}
          step={1}
          value={readAutoCaptureFrames(cookies)}
          unit=" frames"
          onChange={(frames) =>
            write(numberCookie(AUTO_CAPTURE_FRAMES_COOKIE, frames))
          }
        />
        <ToggleSetting
          label="Capture sound"
          hint="A shutter click and flash for each photo."
          checked={readPreference(cookies, SOUND_COOKIE)}
          onChange={(on) => write(preferenceCookie(SOUND_COOKIE, on))}
        />
      </Section>

      <Section id="settings-view" title="3D view">
        <ToggleSetting
          label="Turn sound"
          hint="A soft click when a layer snaps into place."
          checked={turnSoundOn(cookies)}
          onChange={(on) => write(preferenceCookie(TURN_SOUND_COOKIE, on))}
        />
        <SliderSetting
          label="Turn speed"
          hint="How long a quarter turn takes; scrambles run at about half."
          min={TURN_MS_RANGE.min}
          max={TURN_MS_RANGE.max}
          step={10}
          value={readTurnFeel(cookies).turnMs}
          unit=" ms"
          onChange={(ms) => write(numberCookie(TURN_MS_COOKIE, ms))}
        />
        <ToggleSetting
          label="Magnetic snap"
          hint="Layers snap a little past the quarter turn and settle back."
          checked={readTurnFeel(cookies).overshoot}
          onChange={(on) => write(preferenceCookie(TURN_OVERSHOOT_COOKIE, on))}
        />
        <ToggleSetting
          label="Vibrate on hold"
          hint="On phones, a short buzz when a held sticker turns more layers."
          checked={vibrationOn(cookies)}
          onChange={(on) => write(preferenceCookie(VIBRATION_COOKIE, on))}
        />
      </Section>

      <Section
        id="settings-swipe"
        title="Swiping"
        hint="How eagerly a swipe on a sticker turns its layer."
      >
        <SliderSetting
          label="Start turning after"
          hint="Shorter reacts sooner; longer ignores small slips."
          min={SWIPE_RANGES.startPx.min}
          max={SWIPE_RANGES.startPx.max}
          step={1}
          value={readSwipeTuning(cookies).startPx}
          unit=" px"
          onChange={(px) => write(numberCookie(SWIPE_START_COOKIE, px))}
        />
        <SliderSetting
          label="Count a turn from"
          hint="How far into a quarter turn a released layer keeps turning."
          min={SWIPE_RANGES.commitPercent.min}
          max={SWIPE_RANGES.commitPercent.max}
          step={5}
          value={Math.round(readSwipeTuning(cookies).commitFraction * 100)}
          unit=" %"
          onChange={(percent) =>
            write(numberCookie(SWIPE_COMMIT_COOKIE, percent))
          }
        />
        <SliderSetting
          label="Flick strength"
          hint="How far a quick swipe carries on; 0 turns flicks off."
          min={SWIPE_RANGES.flickMs.min}
          max={SWIPE_RANGES.flickMs.max}
          step={20}
          value={readSwipeTuning(cookies).flickMs}
          unit=" ms"
          onChange={(ms) => write(numberCookie(SWIPE_FLICK_COOKIE, ms))}
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

      <Section id="settings-scramble" title="Scramble">
        <ChoiceSetting
          label="Scramble length"
          hint="Normal is 20 moves on a 3×3, more on larger cubes."
          value={readScrambleOptions(cookies).length}
          options={[
            { value: 'short', label: 'Short (half)' },
            { value: 'normal', label: 'Normal' },
            { value: 'long', label: 'Long (one and a half)' },
          ]}
          onChange={(length) =>
            write(selectionCookie(SCRAMBLE_LENGTH_COOKIE, length))
          }
        />
        <ToggleSetting
          label="Turn inner layers"
          hint="On 4×4 and larger cubes; off scrambles only the outer faces."
          checked={readScrambleOptions(cookies).innerLayers}
          onChange={(on) => write(preferenceCookie(SCRAMBLE_INNER_COOKIE, on))}
        />
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

      <Section
        id="settings-developer"
        title="Developer"
        hint="For saving capture fixtures into a checkout of the project with npm run fixture:server."
      >
        <ToggleSetting
          label="Offer Upload to localhost"
          hint="Off leaves only the zip download when saving a fixture."
          checked={localUploadShown(cookies)}
          onChange={(on) => write(preferenceCookie(LOCAL_UPLOAD_COOKIE, on))}
        />
        <TextSetting
          key={readFixtureServer(cookies)}
          label="Fixture server address"
          hint="Where the published app sends uploads; npm run dev uses its own proxy."
          value={readFixtureServer(cookies)}
          placeholder={DEFAULT_FIXTURE_SERVER}
          invalid="Use this computer, such as http://127.0.0.1:7100."
          check={loopbackFixtureServer}
          onChange={(address) =>
            write(selectionCookie(FIXTURE_SERVER_URL_COOKIE, address))
          }
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

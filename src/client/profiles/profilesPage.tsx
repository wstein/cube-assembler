// The profiles page (#profiles): one tab per kind of saved profile.
import '../../../web/profiles.css'
import { ColorReviewTab, type ReviewCapture } from './colorReviewPage'
import { CubeReviewTab, type ReviewPhoto } from './cubeReviewPage'
import type { ComponentChildren } from 'preact'
import type { ProfileSettings } from './profileSettings'
import { profilesHash, type ProfilesTab } from './profilesRoute'

interface Props {
  tab: ProfilesTab
  settings: ProfileSettings
  onChange: (settings: ProfileSettings) => void
  capture: ReviewCapture | null
  photo: ReviewPhoto | null
  onClose: () => void
  onExport: () => void
  onImport: (event: Event) => void
  fileMessage: string
  // Opens the color analysis of the last capture; null without one.
  onAnalyze: (() => void) | null
  // Saving the last capture's colors as a profile.
  captureColors?: ComponentChildren
}

const TABS: Array<{ tab: ProfilesTab; label: string }> = [
  { tab: 'colors', label: 'Colors' },
  { tab: 'cubes', label: 'Cubes' },
]

export function ProfilesPage({
  tab,
  settings,
  onChange,
  capture,
  photo,
  onClose,
  onExport,
  onImport,
  fileMessage,
  onAnalyze,
  captureColors,
}: Props) {
  return (
    <div class="color-review">
      <header class="color-review-header">
        <button
          type="button"
          class="btn btn-secondary btn-sm"
          onClick={onClose}
        >
          ← Back to the scanner
        </button>
        <h1>Cube &amp; color profiles</h1>
        <p class="color-review-muted">
          Review saved profiles: compare them, merge duplicates, and try them on
          your last capture.
        </p>
      </header>
      <nav class="profiles-tabs" aria-label="Profiles">
        {TABS.map(({ tab: id, label }) => (
          <a
            key={id}
            href={profilesHash(id)}
            aria-current={id === tab ? 'page' : undefined}
          >
            {label}
          </a>
        ))}
      </nav>
      <div class="profiles-file-actions">
        <span class="color-review-muted">
          One profiles file contains cubes and sticker colors.
        </span>
        <button
          type="button"
          class="btn btn-secondary btn-sm"
          onClick={onExport}
        >
          ↓ Export cubes &amp; colors
        </button>
        <label class="btn btn-secondary btn-sm">
          ↑ Import cubes &amp; colors
          <input
            type="file"
            accept=".json,application/json"
            hidden
            onChange={onImport}
          />
        </label>
        {fileMessage && <span role="status">{fileMessage}</span>}
      </div>
      {tab === 'colors' && (
        <>
          <section class="card color-review-capture">
            <h2>Last capture</h2>
            {capture ? (
              <>
                <p class="color-review-muted">
                  Save the colors of the last capture as a profile, or look at
                  how its stickers were read.
                </p>
                {captureColors}
                {onAnalyze && (
                  <button
                    type="button"
                    class="btn btn-secondary btn-sm"
                    onClick={onAnalyze}
                  >
                    Analyze colors
                  </button>
                )}
              </>
            ) : (
              <p class="color-review-muted">
                Capture a cube to save its colors or analyze them here.
              </p>
            )}
          </section>
          <ColorReviewTab
            settings={settings}
            onChange={onChange}
            capture={capture}
          />
        </>
      )}
      {tab === 'cubes' && (
        <CubeReviewTab settings={settings} onChange={onChange} photo={photo} />
      )}
    </div>
  )
}

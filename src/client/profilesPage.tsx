// The profiles page (#profiles): one tab per kind of saved profile.
import { ColorReviewTab, type ReviewCapture } from './colorReviewPage'
import { CubeReviewTab, type ReviewPhoto } from './cubeReviewPage'
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
}

const TABS: Array<{ tab: ProfilesTab; label: string }> = [{ tab: 'colors', label: 'Colors' }, { tab: 'cubes', label: 'Cubes' }]

export function ProfilesPage({ tab, settings, onChange, capture, photo, onClose, onExport, onImport, fileMessage }: Props) {
  return (
    <div class="color-review">
      <header class="color-review-header">
        <button type="button" class="btn btn-secondary btn-sm" onClick={onClose}>← Back to the scanner</button>
        <h1>Cube &amp; color profiles</h1>
        <p class="color-review-muted">Review saved profiles: compare them, merge duplicates, and try them on your last capture.</p>
      </header>
      <nav class="profiles-tabs" aria-label="Profiles">
        {TABS.map(({ tab: id, label }) => (
          <a key={id} href={profilesHash(id)} aria-current={id === tab ? 'page' : undefined}>{label}</a>
        ))}
      </nav>
      <div class="profiles-file-actions">
        <span class="color-review-muted">One settings file contains cubes and sticker colors.</span>
        <button type="button" class="btn btn-secondary btn-sm" onClick={onExport}>↓ Export cubes &amp; colors</button>
        <label class="btn btn-secondary btn-sm">
          ↑ Import cubes &amp; colors
          <input type="file" accept=".json,application/json" hidden onChange={onImport} />
        </label>
        {fileMessage && <span role="status">{fileMessage}</span>}
      </div>
      {tab === 'colors' && <ColorReviewTab settings={settings} onChange={onChange} capture={capture} />}
      {tab === 'cubes' && <CubeReviewTab settings={settings} onChange={onChange} photo={photo} />}
    </div>
  )
}

// The profiles page (#profiles): one tab per kind of saved profile.
import { ColorReviewTab, type ReviewCapture } from './colorReviewPage'
import type { ProfileSettings } from './profileSettings'
import { profilesHash, type ProfilesTab } from './profilesRoute'

interface Props {
  tab: ProfilesTab
  settings: ProfileSettings
  onChange: (settings: ProfileSettings) => void
  capture: ReviewCapture | null
  onClose: () => void
}

const TABS: Array<{ tab: ProfilesTab; label: string }> = [{ tab: 'colors', label: 'Colors' }]

export function ProfilesPage({ tab, settings, onChange, capture, onClose }: Props) {
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
      {tab === 'colors' && <ColorReviewTab settings={settings} onChange={onChange} capture={capture} />}
    </div>
  )
}

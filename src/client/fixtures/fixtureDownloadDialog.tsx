import type { Fixture, FixtureSummary } from '../fixtureZip'

export interface FixtureDownloadData {
  fixture: Fixture
  name: string
  zip: Uint8Array
  summary: FixtureSummary
  photoUrls: string[]
}

interface Props {
  download: FixtureDownloadData
  faceLabels: Record<string, string>
  serverChecked: boolean
  serverReachable: boolean
  serverPolling: boolean
  // Off when the settings page hides Upload to localhost.
  uploadShown: boolean
  uploading: boolean
  uploadMessage: string
  onClose: () => void
  onUpload: () => void
  onDownload: () => void
  focusModalOnOpen: (el: HTMLElement | null) => void
  onModalKeyDown: (
    e: KeyboardEvent,
    el: HTMLElement,
    onClose: () => void,
  ) => void
}

function formatBytes(bytes: number): string {
  return bytes < 1024
    ? `${bytes} B`
    : bytes < 1024 * 1024
      ? `${Math.round(bytes / 1024)} KB`
      : `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function FixtureDownloadDialog({
  download,
  faceLabels,
  serverChecked: fixtureServerChecked,
  serverReachable: fixtureServerReachable,
  serverPolling: fixtureServerPolling,
  uploadShown,
  uploading: fixtureUploading,
  uploadMessage: fixtureUploadMessage,
  onClose,
  onUpload,
  onDownload,
  focusModalOnOpen,
  onModalKeyDown,
}: Props) {
  return (
    <div class="modal open">
      <div
        class="modal-content fixture-download-content"
        role="dialog"
        aria-modal="true"
        aria-labelledby="fixture-download-title"
        tabIndex={-1}
        ref={focusModalOnOpen}
        onKeyDown={(e) => onModalKeyDown(e, e.currentTarget, onClose)}
      >
        <div class="modal-header">
          <h2 id="fixture-download-title">Save as test fixture</h2>
          <button
            type="button"
            class="modal-close"
            aria-label="Close"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <p class="fixture-download-file">
          <code>{download.name}.zip</code> · {formatBytes(download.zip.length)}
        </p>
        <ul class="fixture-download-photos" aria-label="Photos in the zip">
          {download.summary.photos.map((photo, i) => (
            <li key={photo.face}>
              <img
                src={download.photoUrls[i]}
                alt={`${faceLabels[photo.face.toUpperCase()]} photo`}
              />
              <span>{faceLabels[photo.face.toUpperCase()]}</span>
              <span class="fixture-download-meta">
                {photo.file} · {formatBytes(photo.bytes.length)}
              </span>
            </li>
          ))}
        </ul>
        <dl class="fixture-download-summary">
          {download.summary.rows.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <p class="fixture-download-hint">
          Upload it to <code>test/fixtures/</code> while{' '}
          <code>npm run fixture:server</code> runs on this computer, or download
          the ZIP and unzip it there. The main-page{' '}
          <strong>Upload files</strong> action loads it back into the app.
        </p>
        {fixtureServerChecked && !fixtureServerReachable && (
          <p role="status" class="fixture-download-hint">
            Upload server offline · run <code>npm run fixture:server</code>.
          </p>
        )}
        {fixtureUploadMessage && (
          <p role="status" class="capture-message error">
            {fixtureUploadMessage}
          </p>
        )}
        <div class="input-actions">
          <button
            type="button"
            class="btn btn-secondary btn-sm"
            onClick={onClose}
          >
            Cancel
          </button>
          {uploadShown && (
            <button
              type="button"
              class="btn btn-primary btn-sm"
              title="Save into test/fixtures/ through npm run fixture:server on this computer"
              disabled={
                fixtureUploading ||
                (fixtureServerChecked && !fixtureServerReachable) ||
                (fixtureServerPolling && !fixtureServerChecked)
              }
              onClick={onUpload}
            >
              {fixtureUploading
                ? 'Uploading...'
                : fixtureServerPolling && !fixtureServerChecked
                  ? 'Checking upload server...'
                  : 'Upload to localhost'}
            </button>
          )}
          <button
            type="button"
            class="btn btn-secondary btn-sm"
            onClick={onDownload}
          >
            Download zip
          </button>
        </div>
      </div>
    </div>
  )
}

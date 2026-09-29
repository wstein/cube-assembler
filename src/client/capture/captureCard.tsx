import type { ComponentChildren } from 'preact'
import {
  FACE_DISPLAY_LABEL,
  FACE_ORDER,
  FACE_SHORT_LABEL,
} from './captureSteps'
import type { FaceCaptureData } from './captureTypes'
import type { UsedColorProfile } from '../profileSettings'

interface CaptureCardProps {
  capturedFaces: Record<string, FaceCaptureData>
  loading: boolean
  // The cube and colors the last complete capture was read with.
  captureProfileName?: string
  resolvedColorProfile: UsedColorProfile | null
  profileFinding: string | null
  calibrationUnavailable: boolean
  onCompareBackdrop: (() => void) | null
  // Upload and bulk-action feedback; empty while the capture dialog shows it.
  message: string
  showColorInput: boolean
  ignoreFixtureCorrections: boolean
  onOpenCapture: (restart?: boolean) => void
  onEditColors: () => void
  onUploadFiles: (event: Event) => void
  onToggleColorInput: () => void
  onApplySolved: () => void
  onIgnoreFixtureCorrectionsChange: (ignore: boolean) => void
  profileControls?: ComponentChildren
  photoUpload?: ComponentChildren
  manualInput?: ComponentChildren
}

// Getting a cube in: guided capture, file uploads, typed colors.
export function CaptureCard({
  capturedFaces,
  loading,
  captureProfileName,
  resolvedColorProfile,
  profileFinding,
  calibrationUnavailable,
  onCompareBackdrop,
  message,
  showColorInput,
  ignoreFixtureCorrections,
  onOpenCapture,
  onEditColors,
  onUploadFiles,
  onToggleColorInput,
  onApplySolved,
  onIgnoreFixtureCorrectionsChange,
  profileControls,
  photoUpload,
  manualInput,
}: CaptureCardProps) {
  return (
    <section class="card capture-card">
      <h2>Capture</h2>
      <div class="capture-card-actions">
        {FACE_ORDER.some((f) => f in capturedFaces) &&
          !FACE_ORDER.every((f) => f in capturedFaces) && (
            <button
              type="button"
              class="btn btn-secondary btn-lg"
              onClick={() => onOpenCapture(true)}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 20 20"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M16.5 9a6.5 6.5 0 1 0-1.4 5.1M16.5 4.5V9H12"
                  stroke="currentColor"
                  stroke-width="1.7"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
              Capture again
            </button>
          )}
        <button
          type="button"
          class="btn btn-primary btn-lg"
          onClick={() => onOpenCapture()}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
            <path
              d="M2.5 6.5A1.5 1.5 0 0 1 4 5h2.2l1.3-2h5l1.3 2H16a1.5 1.5 0 0 1 1.5 1.5V15A1.5 1.5 0 0 1 16 16.5H4A1.5 1.5 0 0 1 2.5 15Z"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linejoin="round"
            />
            <circle
              cx="10"
              cy="10.5"
              r="3"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
            />
          </svg>
          {FACE_ORDER.every((f) => f in capturedFaces)
            ? 'Capture again'
            : FACE_ORDER.some((f) => f in capturedFaces)
              ? `Continue (${FACE_ORDER.filter((f) => f in capturedFaces).length}/${FACE_ORDER.length})`
              : 'Capture faces'}
        </button>
        {FACE_ORDER.every((f) => f in capturedFaces) && (
          <button
            type="button"
            class="btn btn-secondary btn-lg"
            onClick={onEditColors}
          >
            Edit colors
          </button>
        )}
      </div>
      <p class="card-hint">
        Four sides while turning the cube, then top and bottom — about a minute.
      </p>
      <div class="face-status-row">
        <div class="face-status-dots">
          {FACE_ORDER.map((face) => (
            <span
              key={face}
              class={`progress-dot ${capturedFaces[face] ? 'done' : ''}`}
              title={`${FACE_DISPLAY_LABEL[face]}${capturedFaces[face] ? ' (captured)' : ' (not captured)'}`}
            >
              {FACE_SHORT_LABEL[face]}
            </span>
          ))}
        </div>
        <span class="card-hint">
          {FACE_ORDER.every((f) => f in capturedFaces)
            ? 'All 6 captured'
            : `${FACE_ORDER.filter((f) => f in capturedFaces).length} of 6 captured`}
        </span>
      </div>
      {captureProfileName &&
        FACE_ORDER.every((f) => capturedFaces[f]?.croppedImage) && (
          <span class="capture-profile-used">
            Cube: {captureProfileName}
            {resolvedColorProfile && (
              <>
                {' · '}Colors: {resolvedColorProfile.name}
                {resolvedColorProfile.selection === 'automatic' &&
                  ' (Automatic)'}
                {resolvedColorProfile.colorFitPercent !== undefined &&
                  ` · ${resolvedColorProfile.colorFitPercent}% color fit`}
                {(profileFinding ||
                  calibrationUnavailable ||
                  onCompareBackdrop) && (
                  <span class="capture-profile-used-detail">
                    {profileFinding}
                    {calibrationUnavailable &&
                      `${profileFinding ? ' · ' : ''}Six-face calibration unavailable`}
                    {onCompareBackdrop && (
                      <>
                        {profileFinding || calibrationUnavailable ? ' · ' : ''}
                        <button
                          type="button"
                          class="color-review-link"
                          onClick={onCompareBackdrop}
                        >
                          Compare backdrop adjustment
                        </button>
                      </>
                    )}
                  </span>
                )}
              </>
            )}
          </span>
        )}
      {profileControls}
      <div class="card-divider" />
      <div class="capture-alternatives">
        <label
          class={`btn btn-secondary btn-sm ${loading ? 'btn-disabled' : ''}`}
          title="Select six photos, a fixture ZIP, or meta.json with its six photos"
        >
          Upload files
          <input
            type="file"
            accept=".zip,.json,image/*"
            multiple
            hidden
            disabled={loading}
            onChange={onUploadFiles}
          />
        </label>
        <button
          type="button"
          class="btn btn-secondary btn-sm"
          aria-expanded={showColorInput}
          onClick={onToggleColorInput}
        >
          {showColorInput ? 'Close' : 'Type colors'}
        </button>
        <button
          type="button"
          class="btn btn-secondary btn-sm"
          onClick={onApplySolved}
        >
          Solved cube
        </button>
      </div>
      {photoUpload}
      <label
        class="checkbox-option"
        title="Review the fixture from what detection reads now, without the colors that were picked by hand when it was saved"
      >
        <input
          type="checkbox"
          checked={ignoreFixtureCorrections}
          onChange={(e) =>
            onIgnoreFixtureCorrectionsChange(e.currentTarget.checked)
          }
        />
        Fixture uploads ignore saved corrections
      </label>
      {/* File-upload/bulk-action feedback: the webcam modal has its own
          copy of this same message for the live-capture flow, but that
          modal isn't open for an upload started from this panel, so
          without this the message would update invisibly. */}
      {message && (
        <div
          role="status"
          class={`capture-message ${message.includes('✓') ? 'success' : message.includes('❌') ? 'error' : ''}`}
        >
          {message}
        </div>
      )}
      {manualInput}
    </section>
  )
}

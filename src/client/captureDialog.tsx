import type { ComponentChildren, JSX } from 'preact'
import type { CaptureMode } from './capturePhoto'
import { CaptureNet } from './captureNet'
import { TurnHint } from './captureTurnCue'

interface CaptureDialogProps {
  liveView: ComponentChildren
  settings: ComponentChildren
  focusDialog: (element: HTMLElement | null) => void
  onDialogKeyDown: (event: JSX.TargetedKeyboardEvent<HTMLDivElement>) => void
  onClose: () => void
  face: string
  faceOrder: readonly string[]
  faceLabels: Record<string, string>
  shortLabels: Record<string, string>
  colorNames: Record<string, string>
  stickerColors: Record<string, string>
  size: number
  captureMode: CaptureMode
  onModeChange: (mode: CaptureMode) => void
  mirrorPreview: boolean
  centerRoutingActive: boolean
  instruction: string
  predictedCenter: string | null
  predictedCenters: Array<string | null>
  faces: Record<string, string[][] | undefined>
  matchingNetFaces: Set<string>
  liveCapturedFace: string | null
  onSelectFace: (face: string) => void
  cameraBlurOn: boolean
  captureWarning: { text: string; key: string; retake: number } | null
  onRetakeWarning: (step: number) => void
  onIgnoreWarning: (key: string) => void
  captureMessage: string
  loading: boolean
  turnCueShowing: boolean
  autoCapture: boolean
  onCapture: () => void
}

export function CaptureDialog({
  liveView,
  settings,
  focusDialog,
  onDialogKeyDown,
  onClose,
  face,
  faceOrder,
  faceLabels,
  shortLabels,
  colorNames,
  stickerColors,
  size,
  captureMode,
  onModeChange,
  mirrorPreview,
  centerRoutingActive,
  instruction,
  predictedCenter,
  predictedCenters,
  faces,
  matchingNetFaces,
  liveCapturedFace,
  onSelectFace,
  cameraBlurOn,
  captureWarning,
  onRetakeWarning,
  onIgnoreWarning,
  captureMessage,
  loading,
  turnCueShowing,
  autoCapture,
  onCapture,
}: CaptureDialogProps) {
  return (
    <div class="modal open">
      <div
        class="modal-content capture-modal-content"
        role="dialog"
        aria-modal="true"
        aria-labelledby="capture-title"
        tabIndex={-1}
        ref={focusDialog}
        onKeyDown={onDialogKeyDown}
      >
        {/* Live view on the left, everything about the current step on the
          right - so on a laptop nothing needs a scroll. */}
        {liveView}
        <div class="capture-side">
          <div class="capture-side-header">
            <div class="capture-side-title">
              <span class="capture-step-kicker">
                Step {faceOrder.indexOf(face) + 1} of {faceOrder.length}
              </span>
              <h2 id="capture-title">
                {faceLabels[face]}
                {faceOrder.indexOf(face) < 4 ? ' of 4' : ''}
              </h2>
            </div>
            <button
              type="button"
              class="modal-close"
              aria-label="Close"
              onClick={onClose}
            >
              ×
            </button>
          </div>
          <div
            class="capture-mode-switch"
            role="group"
            aria-label="Face detection mode"
          >
            <button
              type="button"
              class={captureMode === 'cv' ? 'active' : ''}
              aria-pressed={captureMode === 'cv'}
              onClick={() => {
                onModeChange('cv')
              }}
            >
              Detect face
            </button>
            <button
              type="button"
              class={captureMode === 'guide' ? 'active' : ''}
              aria-pressed={captureMode === 'guide'}
              onClick={() => {
                onModeChange('guide')
              }}
            >
              Guide grid
            </button>
          </div>
          <p class="capture-hint-text" aria-live="polite">
            {!centerRoutingActive && (
              <TurnHint
                step={faceOrder.indexOf(face)}
                mirrored={mirrorPreview}
              />
            )}
            {instruction}
            {predictedCenter && (
              <span class="capture-expected-center">
                Suggested center:{' '}
                <span
                  class="capture-expected-swatch"
                  style={{ background: stickerColors[predictedCenter] }}
                />
                <strong>{colorNames[predictedCenter]}</strong>
              </span>
            )}
          </p>
          <div class="capture-progress">
            <span class="capture-progress-label">
              Captured so far · tap one to retake
            </span>
            <CaptureNet
              faceOrder={faceOrder}
              faceLabels={faceLabels}
              shortLabels={shortLabels}
              colorNames={colorNames}
              stickerColors={stickerColors}
              faces={faces}
              current={face}
              matchingFaces={matchingNetFaces}
              liveMatchingFace={liveCapturedFace}
              size={size}
              predictedCenters={predictedCenters}
              mirrored={mirrorPreview}
              onSelect={onSelectFace}
            />
          </div>
          {/* macOS reports its Portrait video effect as backgroundBlur, and
            the browser can't turn it off - it blurs whatever it takes for
            background, which can include the cube held up to the camera. */}
          {cameraBlurOn && (
            <p class="capture-warning" role="note">
              ⚠ Your camera's background blur (Portrait) is on and can blur the
              cube. Turn it off in Control Center → Video Effects.
            </p>
          )}
          {captureWarning && (
            <div class="capture-warning capture-soft-warning" role="status">
              <span>⚠ {captureWarning.text}</span>
              <button
                type="button"
                class="btn btn-secondary btn-sm"
                onClick={() => onRetakeWarning(captureWarning.retake)}
              >
                Retake {faceLabels[faceOrder[captureWarning.retake]]}
              </button>
              <button
                type="button"
                class="link-button"
                onClick={() => onIgnoreWarning(captureWarning.key)}
              >
                Ignore
              </button>
            </div>
          )}
          {settings}
          <div class="capture-actions">
            <div
              role="status"
              class={`capture-message ${captureMessage ? (captureMessage.includes('✓') ? 'success' : captureMessage.includes('❌') ? 'error' : '') : 'is-empty'}`}
            >
              {captureMessage || '—'}
            </div>
            <button
              type="button"
              class="btn btn-primary"
              onClick={onCapture}
              disabled={loading || turnCueShowing}
            >
              {loading
                ? '⏳ Processing...'
                : autoCapture && captureMode === 'cv'
                  ? 'Capture now'
                  : `Capture ${faceLabels[face].toLowerCase()}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

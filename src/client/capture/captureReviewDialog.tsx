import type { JSX } from 'preact'
import type { FaceCaptureData } from './captureTypes'

interface CaptureReviewDialogProps {
  faceOrder: readonly string[]
  faceLabels: Record<string, string>
  shortLabels: Record<string, string>
  colorNames: Record<string, string>
  stickerColors: Record<string, string>
  colorOrder: readonly string[]
  faces: Record<string, FaceCaptureData>
  size: number
  step: number
  captureProfileName?: string
  globalNote: string | null
  reviewNotice: string | null
  glareFaces: string[]
  mixedUpColors: string[]
  confidenceTier: (confidence: number) => 'high' | 'medium' | 'low'
  focusDialog: (element: HTMLElement | null) => void
  onDialogKeyDown: (event: JSX.TargetedKeyboardEvent<HTMLDivElement>) => void
  onClose: () => void
  onStepChange: (step: number) => void
  onEditCell: (face: string, row: number, col: number) => void
  onRetake: (face: string) => void
  onConfirm: () => void
}

// Show each original photo beside the detected stickers so corrections stay
// tied to the source image.
export function CaptureReviewDialog({
  faceOrder,
  faceLabels,
  shortLabels,
  colorNames,
  stickerColors,
  colorOrder,
  faces,
  size,
  step,
  captureProfileName,
  globalNote,
  reviewNotice,
  glareFaces,
  mixedUpColors,
  confidenceTier,
  focusDialog,
  onDialogKeyDown,
  onClose,
  onStepChange,
  onEditCell,
  onRetake,
  onConfirm,
}: CaptureReviewDialogProps) {
  const face = faceOrder[step]
  const data = faces[face]
  const isLast = step === faceOrder.length - 1
  return (
    <div class="modal open">
      <div
        class="modal-content review-modal-content"
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-title"
        tabIndex={-1}
        ref={focusDialog}
        onKeyDown={onDialogKeyDown}
      >
        <div class="review-header">
          <div class="capture-side-title">
            <span class="capture-step-kicker">
              Check colors · {step + 1} of {faceOrder.length}
            </span>
            <h2 id="review-title">{faceLabels[face]}</h2>
          </div>
          <div class="review-progress-dots" role="group" aria-label="Faces">
            {faceOrder.map((f, i) => (
              <button
                type="button"
                key={f}
                class={`progress-dot ${i < step ? 'done' : ''} ${i === step ? 'current' : ''}`}
                aria-current={i === step ? 'step' : undefined}
                aria-label={faceLabels[f]}
                onClick={() => onStepChange(i)}
              >
                {shortLabels[f]}
              </button>
            ))}
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
        {captureProfileName && (
          <p class="capture-profile-used review-profile-used">
            Cube: <strong>{captureProfileName}</strong>
          </p>
        )}
        {globalNote && <div class="global-wb-note">✓ {globalNote}</div>}
        {reviewNotice && (
          <div class="capture-warning" role="alert">
            {reviewNotice}
          </div>
        )}
        {glareFaces.length > 0 && (
          <div class="capture-warning" role="status">
            ⚠ Glare washed out some stickers on{' '}
            {glareFaces.map((f) => faceLabels[f]).join(', ')}. Check their
            colors, or tilt the cube away from the light and retake.
          </div>
        )}
        {mixedUpColors.length > 0 && (
          <div class="capture-warning" role="status">
            ⚠ {mixedUpColors.map((c) => colorNames[c] ?? c).join(' and ')} came
            out mixed with another color, so two colors may be swapped. Check
            those stickers, or retake in more even light.
          </div>
        )}
        {(() => {
          // Detection always assigns every color exactly N² stickers, so
          // an imbalance here means a sticker was set to the wrong color
          // by hand - worth fixing before assembling.
          const counts: Record<string, number> = {}
          for (const f of faceOrder)
            for (const row of faces[f]?.colors ?? [])
              for (const c of row) counts[c] = (counts[c] ?? 0) + 1
          const expected = size * size
          const off = colorOrder.filter((c) => (counts[c] ?? 0) !== expected)
          if (off.length === 0 || !faceOrder.every((f) => faces[f])) return null
          return (
            <div class="capture-warning" role="status">
              ⚠{' '}
              {off.map((c) => `${colorNames[c]} ${counts[c] ?? 0}`).join(', ')}{' '}
              - each color should appear {expected} times. A sticker was
              probably set to the wrong color.
            </div>
          )
        })()}
        {data && (
          <>
            <div class="review-wizard-panes">
              <div class="review-pane">
                <div class="review-pane-label">Photo</div>
                <div class="review-face-image-wrapper">
                  {data.croppedImage && (
                    <img
                      src={data.croppedImage}
                      class="review-face-image"
                      alt={`Captured photo of ${faceLabels[face]}`}
                    />
                  )}
                </div>
              </div>
              <div class="review-pane">
                {(() => {
                  // A cell is worth a second look for either of two
                  // independent reasons: the classifier itself was
                  // unsure (low confidence), or the sticker sits
                  // close to the boundary with another color (see
                  // cellLookalikes) - flag both the same way so a
                  // human correcting one ambiguous sticker doesn't
                  // have to first work out which signal triggered it.
                  let flaggedCount = 0
                  let correctedCount = 0
                  for (let r = 0; r < data.colors.length; r++) {
                    for (let c = 0; c < data.colors[r].length; c++) {
                      const detected = data.detectedColors?.[r]?.[c]
                      const corrected =
                        detected !== undefined && detected !== data.colors[r][c]
                      const lowConfidence =
                        confidenceTier(data.cellConfidences?.[r]?.[c] ?? 1) ===
                        'low'
                      const lookalike = data.cellLookalikes?.[r]?.[c]
                      if (corrected) correctedCount++
                      else if (lowConfidence || lookalike) flaggedCount++
                    }
                  }
                  return (
                    <div class="review-pane-label">
                      <span>Colors found</span>
                      {flaggedCount > 0 && (
                        <span class="review-flagged-count">
                          ⚠ {flaggedCount} to double-check
                        </span>
                      )}
                      {correctedCount > 0 && (
                        <span class="review-corrected-count">
                          ✎ {correctedCount} changed by you
                        </span>
                      )}
                    </div>
                  )
                })()}
                <div
                  class="review-detected-grid"
                  style={{
                    gridTemplateColumns: `repeat(${data.colors.length}, 1fr)`,
                    gridTemplateRows: `repeat(${data.colors.length}, 1fr)`,
                    '--grid-n': String(data.colors.length),
                  }}
                >
                  {data.colors.map((row, r) =>
                    row.map((color, c) => {
                      // The final color stays the human choice; the badge only
                      // records what automatic detection had said instead. A
                      // human-set sticker is settled: detection's confidence and
                      // lookalike were about the color it saw, not this one.
                      const detected = data.detectedColors?.[r]?.[c]
                      const corrected =
                        detected !== undefined && detected !== color
                      const confidence = corrected
                        ? undefined
                        : data.cellConfidences?.[r]?.[c]
                      const tier = confidenceTier(confidence ?? 1)
                      const lookalike = corrected
                        ? null
                        : (data.cellLookalikes?.[r]?.[c] ?? null)
                      const flagged = tier === 'low' || lookalike !== null
                      const name = colorNames[color] ?? color
                      const sure =
                        confidence !== undefined
                          ? `, ${Math.round(confidence * 100)}% sure`
                          : ''
                      const notes = [
                        corrected
                          ? `We saw ${colorNames[detected] ?? detected}, you picked ${name}.`
                          : null,
                        tier === 'low' ? 'Not sure about this one.' : null,
                        lookalike
                          ? `It looks a lot like ${colorNames[lookalike] ?? lookalike}.`
                          : null,
                      ].filter(Boolean)
                      return (
                        <button
                          type="button"
                          key={`${r}-${c}`}
                          class={`review-detected-cell ${flagged ? 'review-detected-cell-flagged' : ''} ${corrected ? 'review-detected-cell-corrected' : ''}`}
                          style={{
                            background: stickerColors[color] || '#888',
                          }}
                          onClick={() => onEditCell(face, r, c)}
                          title={[
                            `Row ${r + 1}, column ${c + 1}: ${name}${sure}.`,
                            ...notes,
                            'Tap to change.',
                          ].join(' ')}
                        >
                          {confidence !== undefined && (
                            <span class="review-detected-confidence">
                              {Math.round(confidence * 100)}%
                            </span>
                          )}
                          {/* Cells on bigger grids are too small for the badge next
                        to the percentage - the amber ring alone marks them. */}
                          {flagged && data.colors.length <= 4 && (
                            <span
                              class="review-detected-cell-flag"
                              aria-hidden="true"
                            >
                              !
                            </span>
                          )}
                          {corrected && (
                            <span
                              class="review-detected-cell-was"
                              style={{
                                background: stickerColors[detected] || '#888',
                              }}
                              aria-hidden="true"
                            >
                              {detected}
                            </span>
                          )}
                        </button>
                      )
                    }),
                  )}
                </div>
                <div class="review-pane-hint">Tap a sticker to fix it</div>
              </div>
            </div>
            <div class="review-wizard-nav">
              <button
                type="button"
                class="btn btn-secondary"
                onClick={() => onRetake(face)}
              >
                Retake {faceLabels[face].toLowerCase()}
              </button>
              <div class="review-wizard-nav-spacer" />
              <button
                type="button"
                class="btn btn-secondary"
                onClick={() => onStepChange(Math.max(0, step - 1))}
                disabled={step === 0}
              >
                Previous
              </button>
              {isLast ? (
                <button
                  type="button"
                  class="btn btn-primary btn-review-next"
                  onClick={onConfirm}
                >
                  Looks right — put the cube together
                </button>
              ) : (
                <button
                  type="button"
                  class="btn btn-primary btn-review-next"
                  onClick={() => onStepChange(step + 1)}
                >
                  Looks right — next side
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

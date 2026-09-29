import type { JSX } from 'preact'
import type { OrientedCandidate } from '../../cube/cubeAssembly'
import {
  rejectAlternatives,
  type CaptureApproval,
} from './captureReviewRouting'
import {
  describeArrangement,
  OrientationNetPreview,
  ORIENTATION_CHOICES_PER_PAGE,
} from './orientationPresentation'

interface OrientationApprovalDialogProps {
  approval: CaptureApproval
  puzzleSize: number
  mirrorPreview: boolean
  stickerColors: Record<string, string>
  focusDialog: (element: HTMLElement | null) => void
  onDialogKeyDown: (event: JSX.TargetedKeyboardEvent<HTMLDivElement>) => void
  onClose: () => void
  onCheckFace: (candidate: OrientedCandidate, face: string) => void
  onChoose: (candidate: OrientedCandidate) => void
  onReject: () => void
  onPageChange: (page: number) => void
}

export function OrientationApprovalDialog({
  approval,
  puzzleSize,
  mirrorPreview,
  stickerColors,
  focusDialog,
  onDialogKeyDown,
  onClose,
  onCheckFace,
  onChoose,
  onReject,
  onPageChange,
}: OrientationApprovalDialogProps) {
  const { candidates, arrangements, valid, note, suggestedFrom } = approval
  const single = candidates.length === 1
  const page = Math.min(
    approval.page ?? 0,
    Math.floor((candidates.length - 1) / ORIENTATION_CHOICES_PER_PAGE),
  )
  const first = page * ORIENTATION_CHOICES_PER_PAGE
  const shown = candidates
    .map((candidate, i) => ({ candidate, i }))
    .slice(first, first + ORIENTATION_CHOICES_PER_PAGE)
  return (
    <div class="modal open">
      <div
        class="modal-content orientation-approval"
        role="dialog"
        aria-modal="true"
        aria-labelledby="orientation-approval-title"
        tabIndex={-1}
        ref={focusDialog}
        onKeyDown={onDialogKeyDown}
      >
        <div class="modal-header">
          <h2 id="orientation-approval-title">
            {!valid
              ? "These faces don't make a valid cube"
              : single
                ? 'Does this match your cube?'
                : 'Which of these is your cube?'}
          </h2>
          <button
            type="button"
            class="modal-close"
            aria-label="Close"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        {note && (
          <p class={valid ? 'orientation-approval-note' : 'capture-warning'}>
            {note}
          </p>
        )}
        <p class="orientation-approval-note">
          Tap any face to check its colors or retake that photo.
        </p>
        {!note && single && valid && (
          <p class="orientation-approval-note">
            {suggestedFrom && suggestedFrom > 1
              ? 'This is the likely fit if you followed the turning guide. If it looks wrong, choose each side.'
              : 'The photos fit together one way.'}
            {puzzleSize % 2 === 1 &&
              ' Hold your cube with white on top and green in front to compare.'}
          </p>
        )}
        {!single && valid && (
          <p class="orientation-approval-note">
            The photos fit your cube in {candidates.length} different ways.
            Compare two at a time.
          </p>
        )}
        {single ? (
          <div class="approval-single">
            <div class="approval-net">
              <OrientationNetPreview
                faces={candidates[0].faces}
                stickerColors={stickerColors}
                onFaceClick={(face) => onCheckFace(candidates[0], face)}
              />
            </div>
            {arrangements?.[0] && (
              <div class="approval-changes">
                <span class="approval-changes-title">
                  How the photos were put together
                </span>
                <ul class="approval-checklist">
                  {describeArrangement(arrangements[0], mirrorPreview).map(
                    (line) => (
                      <li key={line}>
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 18 18"
                          aria-hidden="true"
                        >
                          <circle
                            cx="9"
                            cy="9"
                            r="8"
                            fill="var(--color-accent-soft)"
                          />
                          <path
                            d="m5.5 9.2 2.3 2.3 4.7-4.8"
                            fill="none"
                            stroke="var(--color-accent)"
                            stroke-width="1.8"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                          />
                        </svg>
                        {line}
                      </li>
                    ),
                  )}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <>
            <div class="orientation-approval-options">
              {shown.map(({ candidate, i }) => (
                <div key={i} class="orientation-approval-option">
                  <OrientationNetPreview
                    faces={candidate.faces}
                    stickerColors={stickerColors}
                    onFaceClick={(face) => onCheckFace(candidate, face)}
                  />
                  {arrangements?.[i] && (
                    <ul class="orientation-approval-changes">
                      {describeArrangement(arrangements[i], mirrorPreview).map(
                        (line) => (
                          <li key={line}>{line}</li>
                        ),
                      )}
                    </ul>
                  )}
                  <button
                    type="button"
                    class="btn btn-primary btn-sm"
                    onClick={() => onChoose(candidate)}
                  >
                    {valid ? 'This one' : 'Use it anyway'}
                  </button>
                </div>
              ))}
            </div>
            {candidates.length > ORIENTATION_CHOICES_PER_PAGE && (
              <div class="orientation-choice-pages">
                <button
                  type="button"
                  class="btn btn-secondary btn-sm"
                  disabled={page === 0}
                  onClick={() => onPageChange(page - 1)}
                >
                  Previous two
                </button>
                <span>
                  Options {first + 1}–
                  {Math.min(
                    first + ORIENTATION_CHOICES_PER_PAGE,
                    candidates.length,
                  )}{' '}
                  of {candidates.length}
                </span>
                <button
                  type="button"
                  class="btn btn-secondary btn-sm"
                  disabled={
                    first + ORIENTATION_CHOICES_PER_PAGE >= candidates.length
                  }
                  onClick={() => onPageChange(page + 1)}
                >
                  Next two
                </button>
              </div>
            )}
          </>
        )}
        <div class="orientation-approval-actions">
          <button type="button" class="btn btn-secondary" onClick={onClose}>
            Back to the colors
          </button>
          <div class="header-spacer" />
          {rejectAlternatives(approval).length > 0 && (
            <button type="button" class="btn btn-secondary" onClick={onReject}>
              {single
                ? 'No, let me choose each side'
                : 'None of these - let me choose each side'}
            </button>
          )}
          {single && (
            <button
              type="button"
              class="btn btn-primary btn-review-next"
              onClick={() => onChoose(candidates[0])}
            >
              {valid ? 'Yes, this is my cube' : 'Use it anyway'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

import type { TargetedKeyboardEvent } from 'preact'
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
  mirrorPreview: boolean
  stickerColors: Record<string, string>
  focusDialog: (element: HTMLElement | null) => void
  onDialogKeyDown: (event: TargetedKeyboardEvent<HTMLDivElement>) => void
  onClose: () => void
  // "No": start the color review.
  onBackToColors: () => void
  onCheckFace: (candidate: OrientedCandidate, face: string) => void
  onChoose: (candidate: OrientedCandidate) => void
  onReject: () => void
  onPageChange: (page: number) => void
}

export function OrientationApprovalDialog({
  approval,
  mirrorPreview,
  stickerColors,
  focusDialog,
  onDialogKeyDown,
  onClose,
  onBackToColors,
  onCheckFace,
  onChoose,
  onReject,
  onPageChange,
}: OrientationApprovalDialogProps) {
  const { candidates, arrangements, valid, note } = approval
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
          <button
            type="button"
            class="btn btn-secondary"
            onClick={onBackToColors}
          >
            {single && valid ? 'No, check the colors' : 'Back to the colors'}
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

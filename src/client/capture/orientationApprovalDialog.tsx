import type { CandidatePhotoEvidence } from './photoProvenance'
import type { TargetedKeyboardEvent } from 'preact'
import {
  photoNamesForProtocol,
  repeatedTextForProtocol,
} from '../../core/capture/CaptureDiagnosis.gen'
import { FaceGrid } from './captureNet'
import { forcedReading, forcedSentence } from './forcedStickers'
import { COLOR_NAME } from '../vision/stickerDisplay'
import { capturePhotos, captureStats, netPhotos } from './approvalPhotos'
import type { FaceCaptureData } from './captureTypes'
import type { CaptureRecovery } from './captureRecovery'
import type { OrientedCandidate } from '../../cube/cubeAssembly'
import { canAdjustCapture, type CaptureApproval } from './captureReviewRouting'
import {
  describeArrangement,
  OrientationNetPreview,
  PhotoOverlay,
  ORIENTATION_CHOICES_PER_PAGE,
} from './orientationPresentation'

interface OrientationApprovalDialogProps {
  sourceProtocol?: string | null
  displayRecovery?: CaptureRecovery | null
  blockedCandidate?: (candidate: OrientedCandidate) => boolean
  alternativesCount: (candidate: OrientedCandidate) => number
  approval: CaptureApproval
  mirrorPreview: boolean
  stickerColors: Record<string, string>
  focusDialog: (element: HTMLElement | null) => void
  onDialogKeyDown: (event: TargetedKeyboardEvent<HTMLDivElement>) => void
  onClose: () => void
  // "No": start the color review.
  onBackToColors: () => void
  photoEvidence: (
    candidate: OrientedCandidate,
  ) => CandidatePhotoEvidence | undefined
  // A photo in the capture-order strip: open its colors.
  onCheckSlot: (slot: number) => void
  captured: Record<string, FaceCaptureData>
  faceOrder: string[]
  puzzleSize: number
  onChoose: (candidate: OrientedCandidate) => void
  onFindMatching: () => void
  onReject: () => void
  onPageChange: (page: number) => void
}

export function OrientationApprovalDialog({
  approval,
  sourceProtocol = null,
  displayRecovery,
  blockedCandidate = () => false,
  alternativesCount,
  mirrorPreview,
  stickerColors,
  focusDialog,
  onDialogKeyDown,
  onClose,
  onBackToColors,
  photoEvidence,
  onCheckSlot,
  captured,
  faceOrder,
  puzzleSize,
  onChoose,
  onFindMatching,
  onReject,
  onPageChange,
}: OrientationApprovalDialogProps) {
  const { candidates, arrangements, valid, note } = approval
  const displayed = candidates
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
              ? 'Error detected'
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
        {valid && puzzleSize >= 4 && (
          <p class="orientation-approval-note">
            Available checks passed. Full NxN reachability unverified.
          </p>
        )}
        {valid && candidates.some(blockedCandidate) && (
          <p class="capture-warning">
            No retained arrangement matches the capture sequence. Review the
            captured input.
          </p>
        )}
        {note && !valid && <p class="approval-error capture-warning">{note}</p>}
        {approval.truncated && (
          <p class="orientation-approval-note">
            Search capped; other arrangements may exist.
          </p>
        )}
        <p class="orientation-approval-note">
          Canonical view
          {!displayRecovery?.captureFrame.confirmed
            ? ' · capture pose unknown'
            : ''}
        </p>
        {!single && valid && (
          <p class="orientation-approval-note">
            The photos fit your cube in {candidates.length} different ways.
            Compare two at a time.
          </p>
        )}
        {single || candidates.length === 0 ? (
          <CubeCheck
            sourceProtocol={sourceProtocol}
            candidate={displayed[0]}
            photoEvidence={photoEvidence}
            captured={captured}
            faceOrder={faceOrder}
            puzzleSize={puzzleSize}
            stickerColors={stickerColors}
            onCheckSlot={onCheckSlot}
          />
        ) : (
          <>
            <div class="orientation-approval-options">
              {shown.map(({ candidate, i }) => (
                <div key={i} class="orientation-approval-option">
                  <OrientationNetPreview
                    faces={candidate.faces}
                    stickerColors={stickerColors}
                    onFaceClick={(face) => {
                      const photo = netPhotos(
                        captured,
                        faceOrder,
                        photoEvidence(candidate),
                      )[face]
                      if (photo) onCheckSlot(photo.slot)
                    }}
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
                    disabled={blockedCandidate(candidate)}
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
            onClick={onFindMatching}
          >
            Find a matching cube
          </button>
          <button
            type="button"
            class="btn btn-secondary"
            onClick={onBackToColors}
          >
            {single && valid ? 'No, check the colors' : 'Back to the colors'}
          </button>
          <div class="header-spacer" />
          {canAdjustCapture(
            faceOrder.filter((f) => captured[f]).length,
            candidates.length,
            valid,
          ) && (
            <button
              type="button"
              class="btn btn-secondary"
              disabled={
                !candidates[0] || alternativesCount(candidates[0]) === 0
              }
              onClick={onReject}
            >
              Alternatives (
              {candidates[0] ? alternativesCount(candidates[0]) : 0})
            </button>
          )}
          {single && candidates.length > 0 && (
            <button
              type="button"
              class="btn btn-primary btn-review-next"
              disabled={blockedCandidate(candidates[0])}
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

// The cube check: the detected cube with the stats. Hovering a face shows
// its original photo instead. Without an arrangement (an error) the faces
// are shown in the order they were taken.
function CubeCheck({
  sourceProtocol,
  candidate,
  captured,
  faceOrder,
  puzzleSize,
  stickerColors,
  photoEvidence,
  onCheckSlot,
}: {
  sourceProtocol: string | null
  candidate: OrientedCandidate | undefined
  captured: Record<string, FaceCaptureData>
  faceOrder: string[]
  puzzleSize: number
  stickerColors: Record<string, string>
  photoEvidence: (
    candidate: OrientedCandidate,
  ) => CandidatePhotoEvidence | undefined
  onCheckSlot: (slot: number) => void
}) {
  const photoNames = photoNamesForProtocol(sourceProtocol)
  const stats = captureStats(
    captured,
    faceOrder,
    puzzleSize,
    false,
    sourceProtocol,
  )
  const reading = forcedReading(captured, faceOrder)
  // One sentence about the stickers the equal color share moved, the face
  // shot twice, and the likely cause: no figures to read.
  const sentence = reading.warn
    ? forcedSentence(reading.result.forced, COLOR_NAME)
    : ''
  const repeated = stats.diagnosis.repeated.length
    ? repeatedTextForProtocol(stats.diagnosis, sourceProtocol)
    : ''
  const cause =
    stats.diagnosis.cause !== 'none found' || !candidate
      ? stats.diagnosis.cause
      : ''
  const repeatedSlots = new Set(stats.diagnosis.repeated.flat())
  const inOrder = capturePhotos(captured, faceOrder)
  const inNet = candidate
    ? netPhotos(captured, faceOrder, photoEvidence(candidate))
    : null
  const changedFaces = inNet
    ? Object.fromEntries(
        Object.entries(inNet).map(([face, photo]) => [face, photo?.changed]),
      )
    : undefined
  const unsureFaces = inNet
    ? Object.fromEntries(
        Object.entries(inNet).map(([face, photo]) => [face, photo?.unsure]),
      )
    : undefined
  const flaggedFaces = inNet
    ? new Set(
        Object.entries(inNet)
          .filter(([, photo]) => photo && repeatedSlots.has(photo.slot))
          .map(([face]) => face),
      )
    : undefined
  return (
    <>
      <section class="approval-section approval-detected">
        <h3 class="approval-section-title">
          {candidate ? 'Your cube' : 'Detected colors'}
        </h3>
        {candidate ? (
          <OrientationNetPreview
            faces={candidate.faces}
            stickerColors={stickerColors}
            changedFaces={changedFaces}
            unsureFaces={unsureFaces}
            photos={inNet ?? undefined}
            flaggedFaces={flaggedFaces}
            onFaceClick={
              inNet && Object.values(inNet).some(Boolean)
                ? (face) => {
                    const photo = inNet[face]
                    if (photo) onCheckSlot(photo.slot)
                  }
                : undefined
            }
          />
        ) : (
          <div class="approval-strip">
            {faceOrder.map((key, slot) =>
              captured[key] ? (
                <div key={key} class="approval-strip-item">
                  <button
                    type="button"
                    class={`orientation-net-face-button${repeatedSlots.has(slot) ? ' orientation-net-face-flagged' : ''}`}
                    aria-label={`Check the ${photoNames[slot]} photo`}
                    onClick={() => onCheckSlot(slot)}
                  >
                    <FaceGrid
                      stickerColors={stickerColors}
                      colors={captured[key].colors}
                      changed={inOrder[slot]?.changed}
                      unsure={inOrder[slot]?.unsure}
                    />
                    <PhotoOverlay
                      photo={inOrder[slot]}
                      label={photoNames[slot]}
                    />
                  </button>
                  <span class="approval-photo-label">{photoNames[slot]}</span>
                </div>
              ) : null,
            )}
          </div>
        )}
      </section>
      {candidate && Object.values(inNet ?? {}).some((photo) => !photo) && (
        <p role="status">
          Source photos are not established for this arrangement.{' '}
          <button type="button" onClick={() => onCheckSlot(0)}>
            Choose a captured photo
          </button>
        </p>
      )}
      {(sentence || repeated || cause) && (
        <div class="approval-stats">
          {sentence && <p>{sentence}</p>}
          {repeated && <p>Repeated face: {repeated}</p>}
          {cause && <p>{cause}</p>}
        </div>
      )}
    </>
  )
}

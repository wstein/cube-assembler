import type { TargetedKeyboardEvent } from 'preact'
import {
  photoNames,
  repeatedText,
} from '../../core/capture/CaptureDiagnosis.gen'
import { FaceGrid } from './captureNet'
import { capturePhotos, captureStats, netPhotos } from './approvalPhotos'
import type { FaceCaptureData } from './captureTypes'
import type { OrientedCandidate } from '../../cube/cubeAssembly'
import {
  rejectAlternatives,
  type CaptureApproval,
} from './captureReviewRouting'
import {
  describeArrangement,
  OrientationNetPreview,
  PhotoOverlay,
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
  // A photo in the capture-order strip: open its colors.
  onCheckSlot: (slot: number) => void
  captured: Record<string, FaceCaptureData>
  faceOrder: string[]
  puzzleSize: number
  // The colors learned from this capture are far from every known palette;
  // `paletteFit` is the best fit (percent) any known palette reached.
  paletteFar: boolean
  paletteFit: number | null
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
  onCheckSlot,
  captured,
  faceOrder,
  puzzleSize,
  paletteFar,
  paletteFit,
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
        {note && (
          <p
            class={
              valid
                ? 'orientation-approval-note'
                : 'approval-error capture-warning'
            }
          >
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
        {single || candidates.length === 0 ? (
          <CubeCheck
            candidate={candidates[0]}
            captured={captured}
            faceOrder={faceOrder}
            puzzleSize={puzzleSize}
            paletteFar={paletteFar}
            paletteFit={paletteFit}
            stickerColors={stickerColors}
            onCheckFace={onCheckFace}
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
          {single && candidates.length > 0 && (
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

// The cube check: the detected cube with the stats. Hovering a face shows
// its original photo instead. Without an arrangement (an error) the faces
// are shown in the order they were taken.
function CubeCheck({
  candidate,
  captured,
  faceOrder,
  puzzleSize,
  paletteFar,
  paletteFit,
  stickerColors,
  onCheckFace,
  onCheckSlot,
}: {
  candidate: OrientedCandidate | undefined
  captured: Record<string, FaceCaptureData>
  faceOrder: string[]
  puzzleSize: number
  paletteFar: boolean
  paletteFit: number | null
  stickerColors: Record<string, string>
  onCheckFace: (candidate: OrientedCandidate, face: string) => void
  onCheckSlot: (slot: number) => void
}) {
  const stats = captureStats(captured, faceOrder, puzzleSize, paletteFar)
  const repeatedSlots = new Set(stats.diagnosis.repeated.flat())
  const inNet = candidate
    ? netPhotos(captured, faceOrder, candidate.faces)
    : null
  const inOrder = capturePhotos(captured, faceOrder)
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
  const changedCount = inOrder.reduce(
    (total, photo) =>
      total + (photo?.changed.flat().filter(Boolean).length ?? 0),
    0,
  )
  const sureLine = stats.sureness
    .map((sure, i) =>
      sure === undefined ? null : `${photoNames[i]} ${Math.round(sure)}%`,
    )
    .filter(Boolean)
    .join(' · ')
  const unsureLine = stats.unsure
    .map((count, i) => (count ? `${photoNames[i]}: ${count}` : null))
    .filter(Boolean)
    .join(' · ')
  return (
    <>
      <section class="approval-section approval-detected">
        <h3 class="approval-section-title">
          {candidate
            ? 'Detected cube - point at a face to see its photo'
            : 'Detected colors in the order taken - point at a face to see its photo'}
        </h3>
        {candidate ? (
          <OrientationNetPreview
            faces={candidate.faces}
            stickerColors={stickerColors}
            changedFaces={changedFaces}
            unsureFaces={unsureFaces}
            photos={inNet ?? undefined}
            flaggedFaces={flaggedFaces}
            onFaceClick={(face) => onCheckFace(candidate, face)}
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
      <dl class="approval-stats">
        <dt>Camera was sure of</dt>
        <dd>{sureLine || 'not recorded'}</dd>
        <dt>To double-check</dt>
        <dd>{unsureLine || 'none'}</dd>
        {paletteFar && (
          <>
            <dt>Learned colors</dt>
            <dd>
              far from every known palette
              {paletteFit === null
                ? ''
                : ` (best fit ${Math.round(paletteFit)}%)`}
            </dd>
          </>
        )}
        {stats.diagnosis.repeatsChecked && (
          <>
            <dt>Repeated face</dt>
            <dd>{repeatedText(stats.diagnosis)}</dd>
          </>
        )}
        {changedCount > 0 && (
          <>
            <dt>Differs from detection</dt>
            <dd>
              {changedCount} sticker{changedCount === 1 ? '' : 's'} (outlined)
            </dd>
          </>
        )}
        {(stats.diagnosis.cause !== 'none found' || !candidate) && (
          <>
            <dt>Likely cause</dt>
            <dd>{stats.diagnosis.cause}</dd>
          </>
        )}
      </dl>
    </>
  )
}

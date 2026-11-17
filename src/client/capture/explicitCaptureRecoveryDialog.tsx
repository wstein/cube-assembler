import { Recovery, type projection } from '@puzlwerk/capture-recovery'
import { lazy, Suspense } from 'preact/compat'
import { useEffect, useRef, useState } from 'preact/hooks'
import type { TargetedKeyboardEvent } from 'preact'
import { assembleCubeFromFaces, type FaceKey } from '../../cube/cubeAssembly'
import { canonicalFaceName } from './canonicalFaceNames'
import { FaceGrid, CaptureNet } from './captureNet'
import { SpatialOrientationWorkspace } from './spatialOrientationWorkspace'
import type { useExplicitCaptureRecovery } from './useExplicitCaptureRecovery'
import { useColorReview } from '../profiles/useColorReview'
import { CaptureReviewDialog } from './captureReviewDialog'
import { CaptureColorPicker } from './captureColorPicker'
import { FACE_ORDER } from './captureSteps'
import {
  COLOR_NAME,
  COLOR_ORDER,
  confidenceTier,
} from '../vision/stickerDisplay'
import { STICKER_COLORS } from '../vision/stickerColorGeometry'

const CubeView3D = lazy(() =>
  import('../view3d/cubeView3D').then((m) => ({ default: m.CubeView3D })),
)

export function ExplicitCaptureRecoveryDialog({
  recovery,
  size,
  colors,
  focusDialog,
}: {
  recovery: ReturnType<typeof useExplicitCaptureRecovery>
  size: number
  colors: Record<string, string>
  focusDialog: (element: HTMLElement | null) => void
}) {
  const [inspected, setInspected] = useState<FaceKey>('F')
  const [editing, setEditing] = useState<string | null>(null)
  const state = recovery.state!
  const [draftFaces, setDraftFaces] = useState(state.faces)
  const lock = useRef(0)
  const followsChoice = useRef(false)
  const [pending, setPending] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )
  const colorReview = useColorReview({
    capturedFaces: draftFaces,
    setCapturedFaces: setDraftFaces,
    confirmReview: () => {},
  })
  const summary = Recovery.describeSession(state.session)
  const selected = Recovery.selectedCandidate(state.review)
  const target = Recovery.nextTarget(state.review)
  const choices = Recovery.choices(state.review)
  const previewId = selected?.candidateId ?? choices[0]?.candidateIds[0]
  const previousProjection = useRef<projection[] | undefined>(undefined)
  const checkedProjection = previewId
    ? Recovery.projectCandidate(state.session, previewId)
    : undefined
  if (checkedProjection) previousProjection.current = checkedProjection
  const projected = checkedProjection ?? previousProjection.current
  const faces =
    projected &&
    (Object.fromEntries(projected.map((p) => [p.target, p.grid])) as
      | Record<FaceKey, string[][]>
      | undefined)
  const placements =
    projected?.map(({ slot, target, quarterTurns }) => ({
      slot,
      target,
      quarterTurns,
    })) ?? []
  const cube = faces ? assembleCubeFromFaces(faces, size) : null
  const finishColors = (cancel: boolean) => {
    if (!cancel) recovery.resume(draftFaces)
    setEditing(null)
    colorReview.setReviewEditingCell(null)
    queueMicrotask(() =>
      document
        .querySelector<HTMLElement>(
          '#explicit-choice-title, #explicit-review-title',
        )
        ?.focus(),
    )
  }
  const closePicker = () => {
    colorReview.setReviewEditingCell(null)
    queueMicrotask(() =>
      document
        .querySelector<HTMLButtonElement>(
          '.spatial-color-editor .review-detected-cell',
        )
        ?.focus(),
    )
  }
  const keys = (event: TargetedKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape') return
    event.preventDefault()
    event.stopPropagation()
    if (colorReview.reviewEditingCell) colorReview.setReviewEditingCell(null)
    else if (editing) finishColors(true)
    else recovery.cancel()
  }
  return (
    <div class="modal open">
      <div
        class="modal-content face-recovery"
        role="dialog"
        aria-modal="true"
        aria-labelledby="explicit-recovery-title"
        tabIndex={-1}
        ref={focusDialog}
        onKeyDown={keys}
        onPointerDownCapture={(event) => {
          if (
            pending &&
            (event.target as HTMLElement).closest(
              '.spatial-candidate, .btn-primary',
            )
          )
            event.preventDefault()
        }}
        onMouseDownCapture={(event) => {
          const previous = followsChoice.current
          followsChoice.current = false
          if (previous && event.detail > 1) {
            event.preventDefault()
            document
              .querySelector<HTMLElement>(
                '#explicit-choice-title, #explicit-review-title',
              )
              ?.focus()
          }
        }}
      >
        <div class="modal-header">
          <h2 id="explicit-recovery-title">Match your cube</h2>
          <button
            type="button"
            class="modal-close"
            aria-label="Close"
            onClick={recovery.cancel}
          >
            ×
          </button>
        </div>
        {!checkedProjection && projected && (
          <p role="status">
            Previous preview; no retained match for the current colors.
          </p>
        )}
        {!faces && (
          <div class="spatial-net-panel">
            <p>No retained assembly. These are captured photo slots.</p>
            <CaptureNet
              faces={Object.fromEntries(
                Object.entries(state.faces).map(([slot, face]) => [
                  slot,
                  face.colors,
                ]),
              )}
              current={editing ?? FACE_ORDER[0]}
              matchingFaces={new Set()}
              size={size}
              predictedCenters={[]}
              onSelect={(slot) => {
                setDraftFaces(state.faces)
                setEditing(slot)
              }}
              faceOrder={FACE_ORDER}
              faceLabels={Object.fromEntries(
                FACE_ORDER.map((slot, index) => [slot, `Photo ${index + 1}`]),
              )}
              shortLabels={Object.fromEntries(
                FACE_ORDER.map((slot, index) => [slot, String(index + 1)]),
              )}
              capturedAction="tap to review colors"
              colorNames={COLOR_NAME}
              stickerColors={colors}
            />
          </div>
        )}
        {faces && (
          <div class="spatial-workspace">
            <SpatialOrientationWorkspace
              faces={faces}
              placements={placements}
              captured={state.faces}
              colors={colors}
              currentFace={target ?? inspected}
              onInspect={setInspected}
              onCorrectFace={(slot) => {
                setDraftFaces(state.faces)
                setEditing(slot)
              }}
            />
            {cube && (
              <Suspense fallback={<p>Loading 3D preview...</p>}>
                <CubeView3D
                  cube={cube}
                  puzzleSize={size}
                  palette={colors}
                  highlightedFace={target ?? inspected}
                  allowLayerMoves={false}
                />
              </Suspense>
            )}
          </div>
        )}
        <div class="spatial-workflow-scroll">
          {editing && (
            <CaptureReviewDialog
              embedded
              faceOrder={FACE_ORDER}
              faceLabels={Object.fromEntries(
                FACE_ORDER.map((slot, index) => {
                  const placement = placements.find((p) => p.slot === slot)
                  return [
                    slot,
                    placement
                      ? canonicalFaceName(placement.target)
                      : `Photo ${index + 1}`,
                  ]
                }),
              )}
              colorNames={COLOR_NAME}
              stickerColors={colors}
              colorOrder={COLOR_ORDER}
              faces={draftFaces}
              size={size}
              step={FACE_ORDER.indexOf(editing as FaceKey)}
              globalNote={null}
              reviewNotice={null}
              glareFaces={[]}
              mixedUpColors={[]}
              confidenceTier={confidenceTier}
              focusDialog={focusDialog}
              onDialogKeyDown={keys}
              onClose={() => finishColors(true)}
              onStepChange={() => {}}
              onEditCell={(face, row, col) =>
                colorReview.setReviewEditingCell({ face, row, col })
              }
              onRetake={() => {}}
              onConfirm={() => finishColors(false)}
              direct={{
                sourceOnly: !projected,
                face: editing,
                row: -1,
                col: -1,
                turns:
                  placements.find((p) => p.slot === editing)?.quarterTurns ?? 0,
              }}
              onOk={() => finishColors(false)}
            />
          )}
          {colorReview.reviewEditingCell && (
            <CaptureColorPicker
              embedded
              editingCell={colorReview.reviewEditingCell}
              faces={draftFaces}
              learnedPalette={null}
              defaultColors={STICKER_COLORS}
              stickerColors={colors}
              colorNames={COLOR_NAME}
              focusDialog={focusDialog}
              onDialogKeyDown={keys}
              onFixColor={(...args) => {
                colorReview.handleFixCellColor(...args)
                queueMicrotask(() =>
                  document
                    .querySelector<HTMLButtonElement>(
                      '.spatial-color-editor .review-detected-cell',
                    )
                    ?.focus(),
                )
              }}
              onClose={closePicker}
            />
          )}
          {!editing && (
            <>
              {target ? (
                <section aria-label="Orientation candidate choices">
                  <h3 id="explicit-choice-title" tabIndex={-1}>
                    Which matches {canonicalFaceName(target)}?
                  </h3>
                  <p>{choices.length} options</p>
                  <div class="spatial-candidates">
                    {choices.map((choice, index) => (
                      <button
                        type="button"
                        class="spatial-candidate"
                        disabled={pending}
                        key={`${choice.placement.photoId}-${choice.placement.target}-${choice.placement.quarterTurns}`}
                        data-photo-id={choice.placement.photoId}
                        data-quarter-turns={choice.placement.quarterTurns}
                        aria-label={`Choose ${canonicalFaceName(target)}, option ${index + 1}`}
                        onClick={(event) => {
                          if (
                            event.detail > 1 ||
                            performance.now() < lock.current
                          ) {
                            event.preventDefault()
                            return
                          }
                          lock.current = performance.now() + 350
                          followsChoice.current = true
                          setPending(true)
                          timer.current = setTimeout(
                            () => setPending(false),
                            350,
                          )
                          recovery.choose(choice.placement)
                          queueMicrotask(() =>
                            document
                              .querySelector<HTMLElement>(
                                '#explicit-choice-title, #explicit-review-title',
                              )
                              ?.focus(),
                          )
                        }}
                      >
                        <FaceGrid colors={choice.grid} stickerColors={colors} />
                        <span>
                          {canonicalFaceName(target)} · {index + 1}
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
              ) : selected ? (
                <h3 id="explicit-review-title" tabIndex={-1}>
                  Ready to use this cube?
                </h3>
              ) : (
                <p role="status">
                  No retained match. Review the captured colors.
                </p>
              )}
              {summary.truncated && (
                <p role="status">Search capped; more matches may exist.</p>
              )}
              {size >= 4 && (
                <p role="status">Some cube constraints remain unverified.</p>
              )}
              {state.issue && <p role="alert">{state.issue}</p>}
            </>
          )}
        </div>
        <div class="orientation-approval-actions spatial-stage-actions">
          <button
            type="button"
            class="btn btn-secondary"
            onClick={recovery.cancel}
          >
            Cancel
          </button>
          {!editing && Recovery.canBack(state.review) && (
            <button
              type="button"
              class="btn btn-secondary"
              onClick={recovery.back}
            >
              Back
            </button>
          )}
          {!editing &&
            !summary.candidates.length &&
            summary.truncated &&
            state.budget < 20000 && (
              <button
                type="button"
                class="btn btn-secondary"
                onClick={recovery.continueSearch}
              >
                Search further
              </button>
            )}
          {!editing && !target && selected && (
            <button
              type="button"
              class="btn btn-primary"
              disabled={pending}
              onClick={(event) => {
                if (event.detail > 1 || performance.now() < lock.current) {
                  event.preventDefault()
                  document
                    .querySelector<HTMLElement>('#explicit-review-title')
                    ?.focus()
                  return
                }
                recovery.use()
              }}
            >
              Use this cube
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

import { canonicalFaceName } from './canonicalFaceNames'
import { lazy, Suspense } from 'preact/compat'
import { useEffect, useRef, useState } from 'preact/hooks'
import type { TargetedKeyboardEvent } from 'preact'
import { assembleCubeFromFaces, type FaceKey } from '../../cube/cubeAssembly'
import { FaceGrid } from './captureNet'
import { SpatialOrientationWorkspace } from './spatialOrientationWorkspace'
import type { FaceCaptureData } from './captureTypes'
import type { useFaceRecovery } from './useFaceRecovery'
import { sameCubeState } from './recoveryPresentation'
import { validateMapping } from './captureFaceMapping'
import type { CubeState } from '../../cube/cubeAssembly'
import { FACE_ORDER } from './captureSteps'
import { CaptureReviewDialog } from './captureReviewDialog'
import { CaptureColorPicker } from './captureColorPicker'
import { useColorReview } from '../profiles/useColorReview'
import {
  COLOR_NAME,
  COLOR_ORDER,
  confidenceTier,
} from '../vision/stickerDisplay'
import { STICKER_COLORS } from '../vision/stickerColorGeometry'
import { previewFaces } from './spatialOrientationWizard'

const CubeView3D = lazy(() =>
  import('../view3d/cubeView3D').then((m) => ({ default: m.CubeView3D })),
)
export function FaceRecoveryDialog({
  recovery,
  currentCube,
  initialCube,
  captured: originalCaptured,
  size,
  colors,
  focusDialog,
  onDialogKeyDown,
}: {
  initialCube: CubeState | null
  currentCube: CubeState | null
  recovery: ReturnType<typeof useFaceRecovery>
  captured: Record<string, FaceCaptureData>
  size: number
  colors: Record<string, string>
  focusDialog: (element: HTMLElement | null) => void
  onDialogKeyDown: (event: TargetedKeyboardEvent<HTMLDivElement>) => void
}) {
  const choiceLockedUntil = useRef(0)
  const [selectionPending, setSelectionPending] = useState(false)
  const unlockTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (unlockTimer.current !== null) clearTimeout(unlockTimer.current)
    },
    [],
  )
  const captured = recovery.workingFaces
  const [inspectedFace, setInspectedFace] = useState<FaceKey | null>(null)
  const [colorFace, setColorFace] = useState<string | null>(null)
  const [colorBefore, setColorBefore] = useState(recovery.checkpoint())
  const colorReview = useColorReview({
    capturedFaces: captured,
    setCapturedFaces: recovery.setDraftFaces,
    confirmReview: () => setColorFace(null),
  })
  const lastComplete = useRef<{
    faces: NonNullable<typeof recovery.validation>['faces']
    mapping: NonNullable<typeof recovery.draft>['mapping']
  } | null>(null)
  const { draft, validation } = recovery
  const approvedCapture = recovery.approved
    ? validateMapping(
        Object.fromEntries(
          Object.entries(originalCaptured).map(([slot, data]) => [
            slot,
            data.colors,
          ]),
        ),
        recovery.approved.mapping,
        size,
      ).candidate
    : null
  const initialCapture = approvedCapture
    ? assembleCubeFromFaces(approvedCapture.faces, size)
    : initialCube
  const discardsViewerEdits =
    currentCube && initialCapture && !sameCubeState(currentCube, initialCapture)
  const finishColor = (cancel: boolean) => {
    if (cancel) recovery.restoreCheckpoint(colorBefore)
    setColorFace(null)
    queueMicrotask(() =>
      document
        .querySelector<HTMLButtonElement>(
          `[aria-label="Inspect ${canonicalFaceName(inspectedFace ?? 'F')} face"]`,
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
  const childKeys = (
    event: TargetedKeyboardEvent<HTMLDivElement>,
    close: () => void,
  ) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      close()
    } else onDialogKeyDown(event)
  }
  if (!draft) return null
  const completeFaces = validation?.faces
  const completeMapping = draft.mapping
  if (completeFaces && completeMapping)
    lastComplete.current = { faces: completeFaces, mapping: completeMapping }
  const provisionalMapping = FACE_ORDER.map((slot) => ({
    slot,
    target: slot as FaceKey,
    quarterTurns: 0,
  }))
  const shown =
    completeFaces ??
    lastComplete.current?.faces ??
    previewFaces(
      Object.fromEntries(
        Object.entries(captured).map(([slot, data]) => [slot, data.colors]),
      ),
      provisionalMapping,
      size,
    )
  const previewCube = assembleCubeFromFaces(shown!, size)
  const stage =
    !recovery.session?.candidates.length && !recovery.savedSelection
      ? 'conflict'
      : recovery.activeTarget
        ? 'choice'
        : 'review'
  const placements =
    completeFaces && completeMapping
      ? completeMapping
      : (lastComplete.current?.mapping ?? provisionalMapping)
  return (
    <>
      <div class="modal open">
        <div
          class="modal-content face-recovery"
          role="dialog"
          aria-modal="true"
          aria-labelledby="face-recovery-title"
          tabIndex={-1}
          ref={focusDialog}
          onKeyDown={onDialogKeyDown}
          onPointerUpCapture={() => {
            if (performance.now() < choiceLockedUntil.current)
              requestAnimationFrame(() =>
                document
                  .querySelector<HTMLElement>(
                    '#spatial-choice-title, #spatial-review-title',
                  )
                  ?.focus(),
              )
          }}
          onPointerDownCapture={(event) => {
            if (
              selectionPending &&
              (event.target as HTMLElement).closest(
                '.spatial-candidate, .spatial-stage-actions .btn-primary',
              )
            )
              event.preventDefault()
          }}
        >
          <div class="modal-header">
            <h2 id="face-recovery-title">Match your cube</h2>
            <button
              type="button"
              class="modal-close"
              aria-label="Close"
              onClick={recovery.close}
            >
              ×
            </button>
          </div>
          {shown && (
            <div class="spatial-workspace">
              <SpatialOrientationWorkspace
                faces={shown}
                placements={placements ?? []}
                captured={captured}
                colors={colors}
                currentFace={inspectedFace ?? recovery.activeTarget ?? 'F'}
                onInspect={setInspectedFace}
                onCorrectFace={(slot) => {
                  setColorBefore(recovery.checkpoint())
                  setColorFace(slot)
                }}
              />
              {previewCube && (
                <Suspense fallback={<p>Loading 3D preview...</p>}>
                  <CubeView3D
                    cube={previewCube}
                    puzzleSize={size}
                    palette={colors}
                    highlightedFace={
                      inspectedFace ?? recovery.activeTarget ?? 'F'
                    }
                    allowLayerMoves={false}
                  />
                </Suspense>
              )}
            </div>
          )}
          <div class="spatial-workflow-scroll">
            {colorFace && (
              <CaptureReviewDialog
                embedded
                faceOrder={FACE_ORDER}
                faceLabels={Object.fromEntries(
                  FACE_ORDER.map((slot) => [
                    slot,
                    canonicalFaceName(
                      placements?.find((p) => p.slot === slot)?.target ?? slot,
                    ),
                  ]),
                )}
                colorNames={COLOR_NAME}
                stickerColors={colors}
                colorOrder={COLOR_ORDER}
                faces={captured}
                size={size}
                step={FACE_ORDER.indexOf(colorFace as FaceKey)}
                globalNote={null}
                reviewNotice="Only this photo is being corrected. Other faces and orientation choices remain in the unconfirmed draft."
                glareFaces={[]}
                mixedUpColors={[]}
                confidenceTier={confidenceTier}
                focusDialog={focusDialog}
                onDialogKeyDown={(event) =>
                  childKeys(event, () => finishColor(true))
                }
                onClose={() => finishColor(true)}
                onStepChange={() => {}}
                onEditCell={(face, row, col) =>
                  colorReview.setReviewEditingCell({ face, row, col })
                }
                onRetake={() => {}}
                onConfirm={() => finishColor(false)}
                direct={{
                  face: colorFace,
                  row: -1,
                  col: -1,
                  turns:
                    placements?.find((p) => p.slot === colorFace)
                      ?.quarterTurns ?? 0,
                }}
                onOk={() => finishColor(false)}
              />
            )}
            {colorReview.reviewEditingCell && (
              <CaptureColorPicker
                embedded
                editingCell={colorReview.reviewEditingCell}
                faces={captured}
                learnedPalette={null}
                defaultColors={STICKER_COLORS}
                stickerColors={colors}
                colorNames={COLOR_NAME}
                focusDialog={focusDialog}
                onDialogKeyDown={(event) => childKeys(event, closePicker)}
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
            <div hidden={!!colorFace}>
              {!completeFaces && (
                <p class="capture-warning" role="alert">
                  Preview shows the last complete assignment; correct the draft
                  errors before use.
                </p>
              )}
              {recovery.choiceWarning && (
                <p class="capture-warning" role="status">
                  {recovery.choiceWarning}
                </p>
              )}
              {stage === 'choice' && (
                <section aria-label="Orientation candidate choices">
                  <h3 id="spatial-choice-title" tabIndex={-1}>
                    Which matches{' '}
                    {canonicalFaceName(recovery.activeTarget ?? 'F')}?
                  </h3>
                  <p>{recovery.presentedChoices.length} options</p>
                  <div class="spatial-candidates">
                    {recovery.presentedChoices.map(
                      ({ choice, view, relativeTurns }, i) => (
                        <button
                          type="button"
                          class="spatial-candidate"
                          disabled={selectionPending}
                          data-source-slot={choice.slot}
                          data-quarter-turns={choice.quarterTurns}
                          key={`${choice.slot}-${choice.target}-${choice.quarterTurns}`}
                          aria-label={`Choose ${canonicalFaceName(view.target)}, ${relativeTurns * 90}° clockwise, option ${i + 1}`}
                          aria-pressed={
                            recovery.selectedChoice?.slot === choice.slot &&
                            recovery.selectedChoice.target === choice.target &&
                            recovery.selectedChoice.quarterTurns ===
                              choice.quarterTurns
                          }
                          onClick={(event) => {
                            if (
                              event.detail > 1 ||
                              performance.now() < choiceLockedUntil.current
                            ) {
                              event.preventDefault()
                              document
                                .querySelector<HTMLElement>(
                                  '#spatial-choice-title, #spatial-review-title',
                                )
                                ?.focus()
                              return
                            }
                            choiceLockedUntil.current = performance.now() + 350
                            setSelectionPending(true)
                            unlockTimer.current = setTimeout(
                              () => setSelectionPending(false),
                              350,
                            )
                            setInspectedFace(null)
                            recovery.chooseOption(choice)
                            queueMicrotask(() =>
                              document
                                .querySelector<HTMLElement>(
                                  '#spatial-choice-title, #spatial-review-title',
                                )
                                ?.focus(),
                            )
                          }}
                        >
                          <FaceGrid colors={view.grid} stickerColors={colors} />
                          <span>
                            {canonicalFaceName(view.target)} ·{' '}
                            {relativeTurns * 90}°
                          </span>
                        </button>
                      ),
                    )}
                  </div>
                </section>
              )}
              {stage === 'review' && (
                <h3 id="spatial-review-title" tabIndex={-1}>
                  Ready to use this cube?
                </h3>
              )}
              {stage === 'conflict' && <h3>Review the captured input.</h3>}
              {!recovery.remainingCandidates.length && (
                <p class="capture-warning" role="status">
                  No retained match. Review earlier answers or detected colors.
                </p>
              )}
              {recovery.session?.truncated && (
                <p class="capture-warning" role="status">
                  Search capped; other matches may exist.
                </p>
              )}
              {validation?.issues[0] && (
                <p class="capture-warning" role="alert">
                  {validation.issues[0]}
                </p>
              )}
              {validation?.valid && (
                <p role="status">
                  {size >= 4
                    ? 'Some cube constraints remain unverified.'
                    : 'Available checks passed.'}
                </p>
              )}
              {discardsViewerEdits && (
                <p class="capture-warning">
                  Using this capture discards later viewer edits. Cancel keeps
                  them.
                </p>
              )}
              {recovery.importWarning && (
                <p class="capture-warning" role="alert">
                  {recovery.importWarning}
                </p>
              )}
            </div>
          </div>
          <div class="orientation-approval-actions spatial-stage-actions">
            <button
              type="button"
              class="btn btn-secondary btn-sm"
              onClick={recovery.cancel}
            >
              Cancel
            </button>
            {!colorFace && recovery.decisions.length > 0 && (
              <button
                type="button"
                class="btn btn-secondary"
                onClick={() => {
                  setInspectedFace(null)
                  choiceLockedUntil.current = 0
                  if (unlockTimer.current !== null)
                    clearTimeout(unlockTimer.current)
                  setSelectionPending(false)
                  recovery.back()
                }}
              >
                Back
              </button>
            )}
            <div class="header-spacer" />
            {!colorFace && stage === 'conflict' && (
              <button
                type="button"
                class="btn btn-primary"
                onClick={() => {
                  setInspectedFace('F')
                  document
                    .querySelector<HTMLButtonElement>(
                      '[aria-label="Inspect Front face"]',
                    )
                    ?.focus()
                }}
              >
                Check a face
              </button>
            )}
            {!colorFace && stage === 'review' && (
              <>
                {recovery.confirmBlockedReason && (
                  <p id="recovery-confirm-reason" role="status">
                    {recovery.confirmBlockedReason}
                  </p>
                )}
                <button
                  type="button"
                  class="btn btn-primary"
                  disabled={selectionPending || !!recovery.confirmBlockedReason}
                  aria-describedby={
                    recovery.confirmBlockedReason
                      ? 'recovery-confirm-reason'
                      : undefined
                  }
                  onClick={(event) => {
                    if (
                      event.detail > 1 ||
                      performance.now() < choiceLockedUntil.current
                    )
                      return
                    recovery.confirm()
                  }}
                >
                  Use this cube
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

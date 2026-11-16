import { lazy, Suspense } from 'preact/compat'
import { useRef, useState } from 'preact/hooks'
import type { TargetedKeyboardEvent } from 'preact'
import { assembleCubeFromFaces, type FaceKey } from '../../cube/cubeAssembly'
import { FaceGrid } from './captureNet'
import { SpatialOrientationWorkspace } from './spatialOrientationWorkspace'
import type { FaceCaptureData } from './captureTypes'
import type { useFaceRecovery } from './useFaceRecovery'
import { sameCubeState } from './recoveryPresentation'
import { validateMapping } from './captureFaceMapping'
import type { CubeState } from '../../cube/cubeAssembly'
import { FACE_ORDER, FACE_DISPLAY_LABEL } from './captureSteps'
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
const LABELS = ['Side 1', 'Side 2', 'Side 3', 'Side 4', 'Top', 'Bottom']
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
  const captured = recovery.workingFaces
  const [inspectedFace, setInspectedFace] = useState<FaceKey | null>(null)
  const [colorFace, setColorFace] = useState<string | null>(null)
  const [colorBefore, setColorBefore] = useState(captured)
  const colorReview = useColorReview({
    capturedFaces: captured,
    setCapturedFaces: recovery.setDraftFaces,
    confirmReview: () => setColorFace(null),
  })
  const lastComplete = useRef<{
    faces: NonNullable<typeof recovery.validation>['faces']
    mapping: NonNullable<typeof recovery.draft>['mapping']
  } | null>(null)
  const { draft, validation, frame } = recovery
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
  if (!draft) return null
  const completeFaces =
    draft.view === 'capture' ? frame?.faces : validation?.faces
  const completeMapping =
    draft.view === 'capture' ? frame?.mapping : draft.mapping
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
        >
          <div class="modal-header">
            <h2 id="face-recovery-title">
              Adjust face orientations / assignments
            </h2>
            <button
              type="button"
              class="modal-close"
              aria-label="Close and keep orientation draft"
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
                currentFace={
                  inspectedFace ??
                  placements?.find((p) => p.slot === recovery.activeSlot)
                    ?.target ??
                  'F'
                }
                onInspect={setInspectedFace}
                onCorrectFace={(slot) => {
                  setColorBefore(captured)
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
                      inspectedFace ??
                      placements?.find((p) => p.slot === recovery.activeSlot)
                        ?.target ??
                      'F'
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
                faceLabels={FACE_DISPLAY_LABEL}
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
                onDialogKeyDown={onDialogKeyDown}
                onClose={() => {
                  recovery.setDraftFaces(colorBefore)
                  setColorFace(null)
                }}
                onStepChange={() => {}}
                onEditCell={(face, row, col) =>
                  colorReview.setReviewEditingCell({ face, row, col })
                }
                onRetake={() => {}}
                onConfirm={() => setColorFace(null)}
                direct={{
                  face: colorFace,
                  row: -1,
                  col: -1,
                  turns:
                    placements?.find((p) => p.slot === colorFace)
                      ?.quarterTurns ?? 0,
                }}
                onOk={() => setColorFace(null)}
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
                onDialogKeyDown={onDialogKeyDown}
                onFixColor={colorReview.handleFixCellColor}
                onClose={() => colorReview.setReviewEditingCell(null)}
              />
            )}
            <div hidden={!!colorFace}>
              {!completeFaces && (
                <p class="capture-warning" role="alert">
                  The draft assignment is invalid. Preview shows the last
                  complete assignment, or provisional capture-slot order if none
                  was available. All six recognized source grids are retained;
                  correct the assignment before confirming.
                </p>
              )}
              <section aria-label="Orientation candidate choices">
                {recovery.choiceWarning && (
                  <p class="capture-warning" role="alert">
                    {recovery.choiceWarning}
                  </p>
                )}
                {!!recovery.decisions.length &&
                  !recovery.remainingCandidates.length && (
                    <p class="capture-warning" role="alert">
                      The saved answers no longer match a retained candidate
                      after correction. Your draft was kept; revisit an earlier
                      answer or use Advanced manual recovery.
                    </p>
                  )}
                <h3>
                  {recovery.activeSlot
                    ? 'Choose the matching face.'
                    : 'Review your cube.'}
                </h3>
                <p role="status">
                  {recovery.remainingCandidates.length} retained candidates.{' '}
                  {recovery.session?.truncated
                    ? 'Search capped; other matches may exist.'
                    : 'Equivalent arrangements may be omitted.'}
                </p>
                <details>
                  <summary>Search details</summary>
                  {recovery.session?.issues.map((issue) => (
                    <p key={issue} class="capture-warning">
                      {issue}
                    </p>
                  ))}
                </details>
                {recovery.activeSlot ? (
                  <>
                    <p>
                      Choose{' '}
                      {LABELS[
                        FACE_ORDER.indexOf(recovery.activeSlot as FaceKey)
                      ] ?? recovery.activeSlot}
                      .
                    </p>
                    <div class="spatial-candidates">
                      {recovery.choices.map((choice, i) => (
                        <button
                          type="button"
                          class="spatial-candidate"
                          key={`${choice.target}-${choice.quarterTurns}`}
                          aria-label={`Choose ${choice.slot} as ${choice.target}, ${choice.quarterTurns * 90} degrees, candidate ${i + 1}`}
                          onClick={() => recovery.chooseOption(choice)}
                        >
                          <FaceGrid
                            colors={choice.grid}
                            stickerColors={colors}
                          />
                          <span>
                            {choice.target} · {choice.quarterTurns * 90}°
                          </span>
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <p>
                    {recovery.remainingCandidates.length
                      ? 'Choices resolved. Check the cube and capture frame.'
                      : 'No retained match. Use Advanced recovery; other arrangements may exist.'}
                  </p>
                )}
                <button
                  type="button"
                  class="btn btn-secondary"
                  disabled={!recovery.decisions.length}
                  onClick={() => {
                    setInspectedFace(null)
                    recovery.back()
                  }}
                >
                  Back
                </button>{' '}
                <button
                  type="button"
                  class="btn btn-secondary"
                  disabled={!recovery.pendingChoice}
                  onClick={() => {
                    setInspectedFace(null)
                    recovery.next()
                  }}
                >
                  Next
                </button>
              </section>
              <p>Originals stay unchanged; Confirm applies your changes.</p>
              {discardsViewerEdits && (
                <p class="capture-warning">
                  Confirming orientation edits reconstructs the original
                  captured photos and discards later viewer edits. Cancel keeps
                  the current cube unchanged.
                </p>
              )}
              {recovery.importWarning && (
                <p class="capture-warning" role="alert">
                  {recovery.importWarning}
                </p>
              )}
              <details class="spatial-advanced">
                <summary>Advanced recovery</summary>
                <div class="face-recovery-photos">
                  {FACE_ORDER.map((slot, i) => {
                    const placement = draft.mapping.find((p) => p.slot === slot)
                    if (!placement) return null
                    return (
                      <section
                        class="face-recovery-photo"
                        key={slot}
                        aria-label={`${LABELS[i]} correction`}
                      >
                        <h3>
                          {LABELS[i]} → {placement.target} ·{' '}
                          {placement.quarterTurns * 90}°
                        </h3>
                        <div class="face-recovery-image">
                          {captured[slot]?.croppedImage && (
                            <img
                              src={captured[slot].croppedImage}
                              alt={`${LABELS[i]} original photo`}
                              style={{
                                transform: `rotate(${placement.quarterTurns * 90}deg)`,
                              }}
                            />
                          )}
                        </div>
                        <label>
                          Face{' '}
                          <select
                            aria-label={`Assign ${LABELS[i]} to face`}
                            value={placement.target}
                            disabled={size % 2 === 1}
                            onChange={(e) =>
                              recovery.assign(
                                slot,
                                e.currentTarget.value as FaceKey,
                              )
                            }
                          >
                            {FACE_ORDER.map((f) => (
                              <option key={f} value={f}>
                                {f}
                              </option>
                            ))}
                          </select>
                        </label>
                        <div class="face-recovery-rotations">
                          <button
                            type="button"
                            class="btn btn-secondary btn-sm"
                            aria-label={`Rotate ${LABELS[i]} (${placement.target} face) counterclockwise 90°`}
                            onClick={() => recovery.rotate(slot, -1)}
                          >
                            −90°
                          </button>
                          <button
                            type="button"
                            class="btn btn-secondary btn-sm"
                            aria-label={`Rotate ${LABELS[i]} (${placement.target} face) clockwise 90°`}
                            onClick={() => recovery.rotate(slot, 1)}
                          >
                            +90°
                          </button>
                          <button
                            type="button"
                            class="btn btn-secondary btn-sm"
                            aria-label={`Rotate ${LABELS[i]} (${placement.target} face) 180°`}
                            onClick={() => recovery.rotate(slot, 2)}
                          >
                            180°
                          </button>
                        </div>
                        <span>
                          {placement.target} · {placement.quarterTurns * 90}°
                          clockwise
                        </span>
                      </section>
                    )
                  })}
                </div>
              </details>
              <fieldset>
                <legend>Capture frame</legend>
                <label>
                  Front{' '}
                  <select
                    aria-label="Capture front photo"
                    value={draft.frontSlot}
                    onChange={(e) =>
                      recovery.edit({
                        frontSlot: e.currentTarget.value,
                        confirmed: false,
                      })
                    }
                  >
                    {FACE_ORDER.map((f, i) => (
                      <option key={f} value={f}>
                        {LABELS[i]}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Top{' '}
                  <select
                    aria-label="Capture top photo"
                    value={draft.upSlot}
                    onChange={(e) =>
                      recovery.edit({
                        upSlot: e.currentTarget.value,
                        confirmed: false,
                      })
                    }
                  >
                    {FACE_ORDER.map((f, i) => (
                      <option key={f} value={f}>
                        {LABELS[i]}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <input
                    type="checkbox"
                    aria-label="I confirm this front and top match how I held the cube."
                    checked={draft.confirmed}
                    onChange={(e) =>
                      recovery.edit({ confirmed: e.currentTarget.checked })
                    }
                  />{' '}
                  Front and top match my cube.
                </label>
                <details>
                  <summary>Capture details</summary>
                  {recovery.context?.mirrored && (
                    <p>
                      Mirrored preview recorded; photos are not mirrored again.
                    </p>
                  )}
                  {size % 2 === 1 && (
                    <p>
                      Fixed centers lock face assignments; rotations remain
                      editable.
                    </p>
                  )}
                  <p>
                    The old guide did not record a unique pose. Confirm the
                    front and top you used.
                  </p>
                  <label>
                    Physical lateral turn{' '}
                    <select
                      aria-label="Physical lateral turn direction"
                      value={draft.turnDirection}
                      onChange={(e) =>
                        recovery.edit({ turnDirection: e.currentTarget.value })
                      }
                    >
                      <option value="unknown">Not recorded / unknown</option>
                      <option value="left">Left</option>
                      <option value="right">Right</option>
                    </select>
                  </label>
                  <label>
                    Cap order{' '}
                    <select
                      aria-label="Capture cap order"
                      value={draft.capOrder}
                      onChange={(e) =>
                        recovery.edit({ capOrder: e.currentTarget.value })
                      }
                    >
                      <option value="unknown">Not recorded / unknown</option>
                      <option value="top-bottom">Top then bottom</option>
                      <option value="bottom-top">Bottom then top</option>
                    </select>
                  </label>
                </details>
                <label>
                  Preview frame{' '}
                  <select
                    aria-label="Orientation preview frame"
                    value={draft.view}
                    onChange={(e) =>
                      recovery.edit({
                        view: e.currentTarget.value as 'capture' | 'canonical',
                      })
                    }
                  >
                    <option value="capture">
                      Capture-relative (first side at front)
                    </option>
                    <option value="canonical">Logical U/R/F/D/L/B</option>
                  </select>
                </label>
                {!frame && (
                  <p role="alert" class="capture-warning">
                    Front and top must be different, adjacent faces. Correct
                    assignments or choose a different top photo.
                  </p>
                )}
              </fieldset>
              <section aria-label="Orientation validation">
                <h3>Validation</h3>
                {validation?.issues.map((issue) => (
                  <p role="alert" class="capture-warning" key={issue}>
                    {issue}
                  </p>
                ))}
                {validation?.parity?.detail && (
                  <details>
                    <summary>Check details</summary>
                    <p>{validation.parity.detail}</p>
                  </details>
                )}
                {validation?.valid && (
                  <p role="status">
                    Available checks passed.
                    {size >= 4 ? ' Full NxN reachability unverified.' : ''}
                  </p>
                )}
              </section>
            </div>
          </div>
          <div class="orientation-approval-actions">
            <button
              type="button"
              class="btn btn-secondary"
              onClick={recovery.cancel}
            >
              Cancel changes
            </button>
            <button
              type="button"
              class="btn btn-secondary"
              disabled={!recovery.history.length}
              onClick={recovery.undo}
            >
              Undo orientation edit
            </button>
            <button
              type="button"
              class="btn btn-secondary"
              onClick={recovery.resetDraft}
            >
              Reset orientation draft
            </button>
            <div class="header-spacer" />
            <button
              type="button"
              class="btn btn-primary"
              disabled={
                !!colorFace ||
                !validation?.valid ||
                !frame ||
                (draft.view === 'capture' && !draft.confirmed)
              }
              onClick={recovery.confirm}
            >
              Confirm face mapping
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

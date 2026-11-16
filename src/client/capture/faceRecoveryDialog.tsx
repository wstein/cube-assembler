import { lazy, Suspense } from 'preact/compat'
import type { TargetedKeyboardEvent } from 'preact'
import { assembleCubeFromFaces, type FaceKey } from '../../cube/cubeAssembly'
import { FaceGrid } from './captureNet'
import { OrientationNetPreview } from './orientationPresentation'
import type { FaceCaptureData } from './captureTypes'
import type { useFaceRecovery } from './useFaceRecovery'
import { sameCubeState } from './recoveryPresentation'
import { validateMapping } from './captureFaceMapping'
import type { CubeState } from '../../cube/cubeAssembly'
import { FACE_ORDER } from './captureSteps'

const CubeView3D = lazy(() =>
  import('../view3d/cubeView3D').then((m) => ({ default: m.CubeView3D })),
)
const LABELS = ['Side 1', 'Side 2', 'Side 3', 'Side 4', 'Top', 'Bottom']
export function FaceRecoveryDialog({
  recovery,
  currentCube,
  initialCube,
  captured,
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
  const { draft, validation, frame } = recovery
  const approvedCapture = recovery.approved
    ? validateMapping(
        Object.fromEntries(
          Object.entries(captured).map(([slot, data]) => [slot, data.colors]),
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
  const shown = draft.view === 'capture' ? frame?.faces : validation?.faces
  const previewCube = shown ? assembleCubeFromFaces(shown, size) : null
  const placements = draft.view === 'capture' ? frame?.mapping : draft.mapping
  const photos = Object.fromEntries(
    (placements ?? []).map((p) => [
      p.target,
      { image: captured[p.slot]?.croppedImage, turns: p.quarterTurns },
    ]),
  )
  return (
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
        <p>
          Original photos and detected colors stay unchanged. Rotate each photo,
          or change whole-face assignments on even cubes. Closing keeps the
          draft; only Confirm applies it.
        </p>
        {discardsViewerEdits && (
          <p class="capture-warning">
            Confirming orientation edits reconstructs the original captured
            photos and discards later viewer edits. Cancel keeps the current
            cube unchanged.
          </p>
        )}
        {recovery.importWarning && (
          <p class="capture-warning" role="alert">
            {recovery.importWarning}
          </p>
        )}
        {recovery.context?.mirrored && (
          <p>
            The recorded camera preview was mirrored. Original photo grids are
            not mirrored again during correction.
          </p>
        )}
        {size % 2 === 1 && (
          <p>
            Fixed center colors determine logical faces on this odd cube. Face
            assignments are locked; each photo can rotate independently.
          </p>
        )}
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
                <h3>{LABELS[i]}</h3>
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
                  Assign {LABELS[i]} to{' '}
                  <select
                    aria-label={`Assign ${LABELS[i]} to face`}
                    value={placement.target}
                    disabled={size % 2 === 1}
                    onChange={(e) =>
                      recovery.assign(slot, e.currentTarget.value as FaceKey)
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
                  {placement.target} · {placement.quarterTurns * 90}° clockwise
                </span>
              </section>
            )
          })}
        </div>
        <fieldset>
          <legend>Capture-relative view</legend>
          <p>
            The old guide allows either turning direction and either cap order.
            It cannot establish one absolute pose. Keep Side 1 at the front and
            confirm which captured photo was on top.
          </p>
          <label>
            Front photo{' '}
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
            Top photo{' '}
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
              checked={draft.confirmed}
              onChange={(e) =>
                recovery.edit({ confirmed: e.currentTarget.checked })
              }
            />{' '}
            I confirm this front and top match how I held the cube.
          </label>
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
          {validation?.parity?.detail && <p>{validation.parity.detail}</p>}
          {validation?.valid && (
            <p role="status">
              Available mechanical checks passed.
              {size >= 4
                ? ' Full NxN reachability is not established by these checks.'
                : ''}
            </p>
          )}
        </section>
        {shown && (
          <div class="face-recovery-preview">
            <OrientationNetPreview
              faces={shown}
              stickerColors={colors}
              photos={photos}
            />
            {previewCube && (
              <Suspense fallback={<p>Loading 3D preview...</p>}>
                <CubeView3D
                  key={`${draft.view}-${frame?.displayTransform ?? 0}`}
                  cube={previewCube}
                  puzzleSize={size}
                  palette={colors}
                  allowLayerMoves={false}
                />
              </Suspense>
            )}
          </div>
        )}
        {!shown && (
          <FaceGrid colors={captured.U?.colors} stickerColors={colors} />
        )}
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
  )
}

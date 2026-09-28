import type { JSX } from 'preact'
import type { FaceKey, OrientedCandidate } from '../cube/cubeAssembly'
import {
  WIZARD_FACE_ORDER,
  faceContentKey,
  groupWizardOptions,
  pickWizardFace,
} from '../cube/orientationWizard'
import { FaceGrid } from './captureNet'
import { FACE_LABELS, OrientationNetPreview } from './orientationPresentation'

export interface OrientationWizardState {
  remaining: OrientedCandidate[]
  truncated: boolean
  picked: FaceKey[]
}

interface OrientationWizardDialogProps {
  wizard: OrientationWizardState
  stickerColors: Record<string, string>
  morphing: boolean
  focusDialog: (element: HTMLElement | null) => void
  onDialogKeyDown: (event: JSX.TargetedKeyboardEvent<HTMLDivElement>) => void
  onClose: () => void
  onChoose: (candidate: OrientedCandidate) => void
  onPick: (
    optionElement: HTMLElement,
    candidates: OrientedCandidate[],
    face: FaceKey,
  ) => void
}

export function OrientationWizardDialog({
  wizard,
  stickerColors,
  morphing,
  focusDialog,
  onDialogKeyDown,
  onClose,
  onChoose,
  onPick,
}: OrientationWizardDialogProps) {
  const { remaining, truncated, picked } = wizard
  const askingFace = pickWizardFace(remaining)
  // This is normally reached only after a face choice has settled
  // every candidate. Keep the recovery screen to one option too.
  if (!askingFace) {
    return (
      <div class="modal open">
        <div
          class="modal-content orientation-picker"
          role="dialog"
          aria-modal="true"
          tabIndex={-1}
          ref={focusDialog}
          onKeyDown={onDialogKeyDown}
        >
          <div class="modal-header">
            <h2>Which orientation matches your cube?</h2>
            <button
              type="button"
              class="modal-close"
              aria-label="Close"
              onClick={onClose}
            >
              ×
            </button>
          </div>
          <div class="orientation-picker-grid">
            {remaining.slice(0, 1).map((alt, i) => (
              <div key={i} class="orientation-picker-option">
                <OrientationNetPreview
                  faces={alt.faces}
                  stickerColors={stickerColors}
                />
                <button
                  type="button"
                  class="btn btn-primary btn-sm"
                  onClick={() => onChoose(alt)}
                >
                  Use this one
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  const progressFaces: Record<string, string[][]> = {}
  const undecidedFaces = new Set<string>()
  const autoFaces = new Set<string>()
  for (const f of WIZARD_FACE_ORDER) {
    const distinct = new Set(remaining.map((c) => faceContentKey(c.faces[f])))
    progressFaces[f] = remaining[0].faces[f]
    if (distinct.size > 1) undecidedFaces.add(f)
    else if (!picked.includes(f)) autoFaces.add(f)
  }
  const decidedCount = WIZARD_FACE_ORDER.length - undecidedFaces.size
  // Every option for this face at once, at most four in a row (two on
  // a phone), so they can be compared side by side.
  const options = groupWizardOptions(remaining, askingFace)
  const columns = {
    '--wizard-columns': Math.min(4, options.length),
    '--wizard-columns-narrow': Math.min(2, options.length),
  }

  return (
    <div class="modal open">
      <div
        class="modal-content orientation-picker"
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        ref={focusDialog}
        onKeyDown={onDialogKeyDown}
      >
        <div class="modal-header">
          <h2>Which way is your {FACE_LABELS[askingFace]} face?</h2>
          <button
            type="button"
            class="modal-close"
            aria-label="Close"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <p class="orientation-picker-note">
          {decidedCount}/6 set · {remaining.length} left — match the framed
          face.
        </p>
        {truncated && (
          <p class="orientation-picker-note orientation-picker-truncated-note">
            ⚠️ More matches exist than shown — if none fit, retake the photos.
          </p>
        )}
        <OrientationNetPreview
          faces={progressFaces}
          stickerColors={stickerColors}
          undecidedFaces={undecidedFaces}
          currentFace={askingFace}
          autoFaces={autoFaces}
        />
        <div
          class="orientation-picker-grid orientation-wizard-options"
          style={columns}
        >
          {options.map((opt, i) => (
            <button
              key={i}
              type="button"
              class="orientation-picker-option orientation-wizard-option"
              aria-label={`Option ${i + 1} of ${options.length} for the ${FACE_LABELS[askingFace]} face`}
              disabled={morphing}
              onClick={(e) =>
                onPick(e.currentTarget, opt.candidates, askingFace)
              }
            >
              <FaceGrid colors={opt.grid} stickerColors={stickerColors} />
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

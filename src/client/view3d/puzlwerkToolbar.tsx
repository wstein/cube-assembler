// The controls under the stage of the main 3D view on the PuzlWerk viewer: the FACES presets and the
// Stickerless, Auto-rotate and Move layers toggles, with the classes and markup of the existing toolbar.
// The CUBE group (scramble, random state, undo, reset), the move history and the sound toggle need
// state held in the app and are a later package.
import type { ViewPreset } from '@puzlwerk/viewer'
import { autoRotateLabel, FACE_BUTTONS, stickerlessLabel } from './puzlwerkBars'

export interface PuzlwerkToolbarProps {
  onPreset: (preset: ViewPreset) => void
  stickerless: boolean
  onToggleStickerless: () => void
  autoRotate: boolean
  onToggleAutoRotate: () => void
  layerMoves: boolean
  onToggleLayerMoves: () => void
}

export function PuzlwerkToolbar({
  onPreset,
  stickerless,
  onToggleStickerless,
  autoRotate,
  onToggleAutoRotate,
  layerMoves,
  onToggleLayerMoves,
}: PuzlwerkToolbarProps) {
  return (
    <div class="cube-3d-toolbar">
      <div class="cube-3d-section">
        <span class="cube-3d-label">Faces:</span>
        <div class="cube-3d-presets">
          {FACE_BUTTONS.map((button) => (
            <button
              key={button.preset}
              type="button"
              class="cube-3d-btn"
              onClick={() => onPreset(button.preset)}
              title={button.title}
            >
              {button.label}
            </button>
          ))}
        </div>
      </div>
      <div class="cube-3d-actions">
        <button
          type="button"
          class="cube-3d-btn"
          onClick={onToggleStickerless}
          title="Toggle between stickerless and stickered appearance"
        >
          {stickerlessLabel(stickerless)}
        </button>
        <button
          type="button"
          class={`cube-3d-btn ${autoRotate ? 'cube-3d-btn-active' : ''}`}
          onClick={onToggleAutoRotate}
        >
          {autoRotateLabel(autoRotate)}
        </button>
        <button
          type="button"
          class={`cube-3d-btn ${layerMoves ? 'cube-3d-btn-active' : ''}`}
          aria-pressed={layerMoves}
          onClick={onToggleLayerMoves}
        >
          <svg
            class="cube-3d-lock"
            viewBox="0 0 16 16"
            width="14"
            height="14"
            aria-hidden="true"
            fill="none"
            stroke="currentColor"
            stroke-width="1.6"
          >
            <rect x="3" y="7" width="10" height="7" rx="1.5" />
            <path
              d={
                layerMoves
                  ? 'M5.5 7V5a2.5 2.5 0 0 1 5 0'
                  : 'M5 7V5a3 3 0 0 1 6 0v2'
              }
            />
          </svg>{' '}
          Move layers
        </button>
      </div>
    </div>
  )
}

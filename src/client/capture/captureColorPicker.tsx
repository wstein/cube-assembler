import type { JSX } from 'preact'
import type { FaceCaptureData } from './captureTypes'
import { colorConfidences, type RGB } from '../imageProcessing'

interface CaptureColorPickerProps {
  editingCell: { face: string; row: number; col: number }
  faces: Record<string, FaceCaptureData>
  learnedPalette: Record<string, RGB> | null
  palette?: Record<string, RGB>
  defaultColors: Record<string, RGB>
  stickerColors: Record<string, string>
  colorNames: Record<string, string>
  focusDialog: (element: HTMLElement | null) => void
  onDialogKeyDown: (event: JSX.TargetedKeyboardEvent<HTMLDivElement>) => void
  onFixColor: (face: string, row: number, col: number, color: string) => void
  onClose: () => void
}

export function CaptureColorPicker({
  editingCell,
  faces,
  learnedPalette,
  palette,
  defaultColors,
  stickerColors,
  colorNames,
  focusDialog,
  onDialogKeyDown,
  onFixColor,
  onClose,
}: CaptureColorPickerProps) {
  return (
    <div class="modal open color-picker-modal" onClick={onClose}>
      <div
        class="modal-content color-picker-content"
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        ref={focusDialog}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onDialogKeyDown}
      >
        <h3>Fix color</h3>
        {(() => {
          // How well this sticker's measured color matches each option,
          // so the likely alternatives stand out.
          const { face, row, col } = editingCell
          const rgb = faces[face]?.cellColors?.[row]?.[col]
          const scores = rgb
            ? colorConfidences(rgb, learnedPalette ?? palette ?? defaultColors)
            : null
          const current = faces[face]?.colors[row]?.[col]
          return (
            <div class="color-palette">
              {['W', 'Y', 'O', 'R', 'G', 'B'].map((color) => (
                <button
                  type="button"
                  key={color}
                  class={`color-btn ${color === current ? 'is-current' : ''}`}
                  style={{ background: stickerColors[color] }}
                  aria-pressed={color === current}
                  onClick={() => onFixColor(face, row, col, color)}
                >
                  <span class="color-btn-name">{colorNames[color]}</span>
                  {scores && (
                    <span class="color-btn-confidence">
                      {Math.round((scores[color] ?? 0) * 100)}%
                    </span>
                  )}
                </button>
              ))}
            </div>
          )
        })()}
        <button
          type="button"
          class="btn btn-secondary btn-sm"
          onClick={onClose}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

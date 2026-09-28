import { looksLikeOrbit64StateToken } from '../cube/notation/orbit64'
import { detectNotationFormat } from '../cube/notation/NotationOutput.gen'

type NotationFormat = 'wrg' | 'urf'

interface ManualFaceletInputProps {
  size: number
  format: NotationFormat
  value: string
  loading: boolean
  onFormatChange: (format: NotationFormat) => void
  onValueChange: (value: string) => void
  onApply: () => void
}

export function ManualFaceletInput({
  size,
  format,
  value,
  loading,
  onFormatChange,
  onValueChange,
  onApply,
}: ManualFaceletInputProps) {
  const handleInput = (nextValue: string) => {
    onValueChange(nextValue)
    const detected = looksLikeOrbit64StateToken(nextValue)
      ? null
      : detectNotationFormat(nextValue)
    if (detected && detected !== format) onFormatChange(detected)
  }

  return (
    <div class="color-input-panel">
      <div class="notation-format-toggle">
        <button
          type="button"
          class={`wb-btn ${format === 'wrg' ? 'active' : ''}`}
          onClick={() => onFormatChange('wrg')}
        >
          WRG Facelets
        </button>
        <button
          type="button"
          class={`wb-btn ${format === 'urf' ? 'active' : ''}`}
          onClick={() => onFormatChange('urf')}
        >
          URF / Orbit64 Facelets
        </button>
      </div>
      <label htmlFor="manual-facelets">
        {format === 'wrg'
          ? `Enter WRG facelets: 6 blocks of ${size * size} colors (W, O, G, R, B, Y), space-separated, in U R F D L B order`
          : `Enter URF facelets: 6 blocks of ${size * size} letters (U, R, F, D, L, B - the face each sticker's color matches when solved), space-separated, in U R F D L B order`}{' '}
        You can also paste an Orbit64 2×2–7×7 state token.
      </label>
      <textarea
        id="manual-facelets"
        value={value}
        onInput={(event) => handleInput(event.currentTarget.value)}
        placeholder={
          format === 'wrg'
            ? Array(6)
                .fill('W'.repeat(size * size))
                .join(' ')
            : ['U', 'R', 'F', 'D', 'L', 'B']
                .map((letter) => letter.repeat(size * size))
                .join(' ')
        }
        rows={6}
        style={{ width: '100%', marginTop: '0.5rem' }}
      />
      <div class="input-actions">
        <button
          type="button"
          class="btn btn-primary btn-sm"
          onClick={onApply}
          disabled={loading}
        >
          {loading ? '⏳ Processing...' : 'Apply Facelets'}
        </button>
      </div>
    </div>
  )
}

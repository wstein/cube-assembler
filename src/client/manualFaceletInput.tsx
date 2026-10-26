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
      <label htmlFor="manual-facelets">
        {`Enter facelets: 6 blocks of ${size * size} letters in U R F D L B order, space-separated - face letters (U, R, F, D, L, B: the face each sticker's color matches when solved) or colors (W, O, G, R, B, Y). The format is detected.`}{' '}
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

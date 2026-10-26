interface ManualFaceletInputProps {
  size: number
  value: string
  loading: boolean
  onValueChange: (value: string) => void
  onApply: () => void
}

// Facelets typed or pasted by hand. Their format (face letters or colors,
// or an Orbit64 token) is detected when they are applied; it never changes
// the notation shown in the output.
export function ManualFaceletInput({
  size,
  value,
  loading,
  onValueChange,
  onApply,
}: ManualFaceletInputProps) {
  return (
    <div class="color-input-panel">
      <label htmlFor="manual-facelets">Facelets</label>
      <p id="manual-facelets-help" class="notation-hint">
        {`6 blocks of ${size * size} letters in U R F D L B order, space-separated - face letters (U, R, F, D, L, B: the face each sticker's color matches when solved) or colors (W, O, G, R, B, Y). The format is detected.`}{' '}
        You can also paste an Orbit64 2×2–7×7 state token.
      </p>
      <textarea
        id="manual-facelets"
        aria-describedby="manual-facelets-help"
        value={value}
        onInput={(event) => onValueChange(event.currentTarget.value)}
        placeholder={['U', 'R', 'F', 'D', 'L', 'B']
          .map((letter) => letter.repeat(size * size))
          .join(' ')}
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

interface Props {
  canUndo: boolean
  onUndo: () => void
  message: string
}

export function ReviewStatusToolbar({ canUndo, onUndo, message }: Props) {
  return (
    <div class="color-review-toolbar">
      <button
        type="button"
        class="btn btn-secondary btn-sm"
        disabled={!canUndo}
        onClick={onUndo}
      >
        Undo last change
      </button>
      {message && (
        <span
          role="status"
          class={`color-review-message ${message.startsWith('❌') ? 'error' : ''}`}
        >
          {message}
        </span>
      )}
    </div>
  )
}

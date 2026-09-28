import type { PhotoFrameMode, SelectedPhoto } from './photoUpload'

interface PhotoUploadReviewProps {
  photos: SelectedPhoto[]
  size: number
  captureMode: 'cv' | 'guide'
  loading: boolean
  onChangeMode: (index: number, mode: PhotoFrameMode) => void
  onMove: (index: number, direction: -1 | 1) => void
  onCancel: () => void
  onRead: () => void
}

export function PhotoUploadReview({
  photos,
  size,
  captureMode,
  loading,
  onChangeMode,
  onMove,
  onCancel,
  onRead,
}: PhotoUploadReviewProps) {
  return (
    <div class="photo-upload-review" aria-label="Photo upload order">
      <p>
        Check the six photos for the selected {size}×{size} cube. Use the arrows
        to change their order before reading them. Auto framing reads named face
        crops directly and{' '}
        {captureMode === 'cv'
          ? 'finds the face in full photos'
          : 'uses Guide grid for full photos'}
        . Choose a framing option below if Auto reads an image incorrectly.
      </p>
      <div class="photo-upload-list">
        {photos.map(({ file, url, mode }, index) => (
          <div class="photo-upload-item" key={url}>
            <img src={url} alt={`Face ${index + 1}: ${file.name}`} />
            <span>
              {index + 1}. {file.name}
            </span>
            <select
              aria-label={`Image framing for ${file.name}`}
              value={mode}
              disabled={loading}
              onChange={(event) =>
                onChangeMode(index, event.currentTarget.value as PhotoFrameMode)
              }
            >
              <option value="auto">Auto framing</option>
              <option value="cropped">Cropped face</option>
              <option value="full">Full photo</option>
            </select>
            <div class="photo-upload-order">
              <button
                type="button"
                class="btn btn-secondary btn-sm"
                aria-label={`Move ${file.name} earlier`}
                disabled={index === 0 || loading}
                onClick={() => onMove(index, -1)}
              >
                ↑
              </button>
              <button
                type="button"
                class="btn btn-secondary btn-sm"
                aria-label={`Move ${file.name} later`}
                disabled={index === photos.length - 1 || loading}
                onClick={() => onMove(index, 1)}
              >
                ↓
              </button>
            </div>
          </div>
        ))}
      </div>
      <div class="photo-upload-actions">
        <button
          type="button"
          class="btn btn-secondary btn-sm"
          disabled={loading}
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          type="button"
          class="btn btn-primary btn-sm"
          disabled={loading}
          onClick={onRead}
        >
          {loading ? 'Reading photos...' : 'Read six photos'}
        </button>
      </div>
    </div>
  )
}

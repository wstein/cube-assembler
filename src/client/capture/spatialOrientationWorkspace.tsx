import { useState } from 'preact/hooks'
import type { FaceKey } from '../../cube/cubeAssembly'
import type { FaceMapping } from './captureFaceMapping'
import type { FaceCaptureData } from './captureTypes'
import { FaceGrid } from './captureNet'

const FACES: FaceKey[] = ['U', 'L', 'F', 'R', 'B', 'D']
const OPPOSITE: Record<FaceKey, FaceKey> = {
  U: 'D',
  D: 'U',
  R: 'L',
  L: 'R',
  F: 'B',
  B: 'F',
}

export function SpatialOrientationWorkspace({
  faces,
  placements,
  captured,
  colors,
  currentFace,
  onInspect,
  onCorrectFace,
}: {
  faces: Record<FaceKey, string[][]>
  placements: FaceMapping
  captured: Record<string, FaceCaptureData>
  colors: Record<string, string>
  currentFace: FaceKey
  onInspect: (face: FaceKey) => void
  onCorrectFace: (slot: string) => void
}) {
  const [photoFace, setPhotoFace] = useState<FaceKey | null>(null)
  const placement = placements.find((p) => p.target === photoFace)
  const photo = placement && captured[placement.slot]
  return (
    <div
      class="spatial-net-panel"
      onPointerLeave={(event) => {
        if (event.pointerType === 'mouse') setPhotoFace(null)
      }}
    >
      <div role="group" aria-label="Recognized cube net" class="spatial-net">
        {FACES.map((face) => (
          <button
            type="button"
            key={face}
            aria-label={`Inspect ${face} face`}
            aria-pressed={face === currentFace}
            class={`spatial-net-slot spatial-net-${face}${face === currentFace ? ' spatial-current' : face !== OPPOSITE[currentFace] ? ' spatial-neighbor' : ''}`}
            onPointerEnter={(event) => {
              if (event.pointerType === 'mouse') setPhotoFace(face)
            }}
            onFocus={() => setPhotoFace(face)}
            onClick={() => {
              onInspect(face)
              setPhotoFace(face)
            }}
          >
            <span>{face}</span>
            <FaceGrid colors={faces[face]} stickerColors={colors} />
          </button>
        ))}
      </div>
      <p class="spatial-net-caption">
        Hover, focus, or tap a face for its photo.
      </p>
      {photoFace && placement && photo?.croppedImage && (
        <aside
          class="spatial-photo"
          aria-label={`Original photo for ${photoFace} face`}
        >
          <img
            src={photo.croppedImage}
            alt={`Captured photo ${placement.slot}, assigned to ${photoFace}`}
            style={{ transform: `rotate(${placement.quarterTurns * 90}deg)` }}
          />
          <span>
            Photo {placement.slot} → {photoFace} · {placement.quarterTurns * 90}
            °
          </span>
          <button
            type="button"
            class="spatial-correct-colors"
            onClick={() => {
              setPhotoFace(null)
              onCorrectFace(placement.slot)
            }}
          >
            Correct detected colors
          </button>
          <button
            type="button"
            aria-label="Close original photo"
            onClick={() => setPhotoFace(null)}
          >
            ×
          </button>
        </aside>
      )}
    </div>
  )
}

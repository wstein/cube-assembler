import type { FaceKey, GuidedArrangement } from '../../cube/cubeAssembly'
import { FaceGrid } from './captureNet'

// How a top/bottom photo was held, from the quarter turns needed to undo it.
const HELD_WORDS = ['', 'sideways', 'upside down', 'sideways']

// What the search changed to make the photos fit, in words.
export function describeArrangement(
  a: GuidedArrangement,
  mirrored = false,
): string[] {
  const [topFix, bottomFix] = a.capsSwapped
    ? [a.capRotations[1], a.capRotations[0]]
    : a.capRotations
  const seenTurn = mirrored ? (a.turn === 'left' ? 'right' : 'left') : a.turn
  return [
    `You turned the cube to the ${seenTurn} between sides${mirrored ? ' in the mirrored view' : ''}.`,
    ...(a.capsSwapped
      ? ['Top and bottom were photographed the other way round.']
      : []),
    ...(topFix ? [`The top was held ${HELD_WORDS[topFix]}.`] : []),
    ...(bottomFix ? [`The bottom was held ${HELD_WORDS[bottomFix]}.`] : []),
  ]
}
// The original photo of a face, shown over its detected colors while the
// pointer (or keyboard focus) is on the face.
export function PhotoOverlay({
  photo,
  label,
}: {
  photo: { image?: string; turns: number } | null | undefined
  label: string
}) {
  if (!photo?.image) return null
  return (
    <img
      class="orientation-net-photo"
      src={photo.image}
      alt={`${label} photo`}
      style={{ transform: `rotate(${photo.turns * 90}deg)` }}
    />
  )
}

export function OrientationNetPreview({
  faces,
  undecidedFaces,
  currentFace,
  autoFaces,
  changedFaces,
  unsureFaces,
  photos,
  flaggedFaces,
  onFaceClick,
  hoveredSticker,
  onStickerHover,
  stickerColors,
}: {
  faces: Record<string, string[][]>
  undecidedFaces?: Set<string>
  currentFace?: string
  autoFaces?: Set<string>
  changedFaces?: Record<string, boolean[][] | undefined>
  unsureFaces?: Record<string, boolean[][] | undefined>
  // The original photo of each face, swapped in on hover.
  photos?: Record<string, { image?: string; turns: number } | null | undefined>
  // Faces to mark (for example a photo shot twice).
  flaggedFaces?: Set<string>
  onFaceClick?: (face: string) => void
  // A sticker to highlight and the pointer moving over one, by net face.
  hoveredSticker?: { face: string; row: number; col: number } | null
  onStickerHover?: (
    cell: { face: string; row: number; col: number } | null,
  ) => void
  stickerColors: Record<string, string>
}) {
  const faceGrid = (face: string) => (
    <FaceGrid
      stickerColors={stickerColors}
      colors={faces[face]}
      undecided={undecidedFaces?.has(face)}
      current={face === currentFace}
      auto={autoFaces?.has(face)}
      changed={changedFaces?.[face]}
      unsure={unsureFaces?.[face]}
      hovered={hoveredSticker?.face === face ? hoveredSticker : null}
      onStickerHover={
        onStickerHover
          ? (cell) => onStickerHover(cell && { face, ...cell })
          : undefined
      }
    />
  )
  // Without a click handler the photo shows while a sticker of the face is
  // pointed at, ringed where that sticker is.
  const photoGrid = (face: string) => {
    const on = hoveredSticker?.face === face ? hoveredSticker : null
    const shown = on && photos?.[face]?.image ? on : null
    const n = faces[face].length
    return (
      <div
        class={`orientation-net-photo-wrap${shown ? ' orientation-net-photo-shown' : ''}`}
      >
        {faceGrid(face)}
        <PhotoOverlay photo={photos?.[face]} label={`${face} face`} />
        {shown && (
          <div
            class="orientation-net-photo-mark"
            style={{
              left: `${((shown.col + 0.5) / n) * 100}%`,
              top: `${((shown.row + 0.5) / n) * 100}%`,
              width: `${100 / n}%`,
              height: `${100 / n}%`,
            }}
          />
        )}
      </div>
    )
  }
  const grid = (face: string) =>
    !onFaceClick && photos ? (
      photoGrid(face)
    ) : onFaceClick ? (
      <button
        type="button"
        class={`orientation-net-face-button${flaggedFaces?.has(face) ? ' orientation-net-face-flagged' : ''}`}
        aria-label={`Check colors for ${face} face`}
        onClick={() => onFaceClick(face)}
      >
        {faceGrid(face)}
        <PhotoOverlay photo={photos?.[face]} label={`${face} face`} />
      </button>
    ) : (
      faceGrid(face)
    )
  return (
    <div class="orientation-net">
      <div class="orientation-net-row">
        <div class="orientation-net-spacer" />
        {grid('U')}
        <div class="orientation-net-spacer" />
        <div class="orientation-net-spacer" />
      </div>
      <div class="orientation-net-row">
        {grid('L')}
        {grid('F')}
        {grid('R')}
        {grid('B')}
      </div>
      <div class="orientation-net-row">
        <div class="orientation-net-spacer" />
        {grid('D')}
        <div class="orientation-net-spacer" />
        <div class="orientation-net-spacer" />
      </div>
    </div>
  )
}

export const FACE_LABELS: Record<FaceKey, string> = {
  U: 'Up',
  R: 'Right',
  F: 'Front',
  D: 'Down',
  L: 'Left',
  B: 'Back',
}
export const ORIENTATION_CHOICES_PER_PAGE = 2

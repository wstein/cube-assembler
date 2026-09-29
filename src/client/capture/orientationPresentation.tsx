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
export function OrientationNetPreview({
  faces,
  undecidedFaces,
  currentFace,
  autoFaces,
  onFaceClick,
  stickerColors,
}: {
  faces: Record<string, string[][]>
  undecidedFaces?: Set<string>
  currentFace?: string
  autoFaces?: Set<string>
  onFaceClick?: (face: string) => void
  stickerColors: Record<string, string>
}) {
  const faceGrid = (face: string) => (
    <FaceGrid
      stickerColors={stickerColors}
      colors={faces[face]}
      undecided={undecidedFaces?.has(face)}
      current={face === currentFace}
      auto={autoFaces?.has(face)}
    />
  )
  const grid = (face: string) =>
    onFaceClick ? (
      <button
        type="button"
        class="orientation-net-face-button"
        aria-label={`Check colors for ${face} face`}
        onClick={() => onFaceClick(face)}
      >
        {faceGrid(face)}
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

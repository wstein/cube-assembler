// Parts of the 3D toolbar that the existing view and the PuzlWerk main view show alike: the CUBE group
// (scramble, random state, undo, reset) and the move history. Classes and markup are the toolbar's.
import { CUBELAB_MOVES_ID, cubeLabMovesJson } from '../cubeLabFingerprint'
import { formatCubeTurn, type CubeTurn } from './cubeView3DState'

// Undo needs a completed move and no turn in progress.
export const undoDisabled = (moves: CubeTurn[], isTurning: boolean): boolean =>
  moves.length === 0 || isTurning

// Reset is off only while the cube is the initial one and nothing was turned.
export const resetDisabled = (isInitial: boolean, moves: CubeTurn[]): boolean =>
  isInitial && moves.length === 0

export const moveHistoryText = (moves: CubeTurn[], size: number): string =>
  moves.length
    ? moves.map((move) => formatCubeTurn(move, size)).join(' ')
    : 'None'

export interface CubeActionsSectionProps {
  isScrambling: boolean
  onToggleScramble: () => void
  onRandomState: () => void
  onUndo: () => void
  onReset: () => void
  undoDisabled: boolean
  resetDisabled: boolean
  // Whether a drag turns a layer; off, scrambling and a random state are unavailable.
  allowLayerMoves?: boolean
}

export function CubeActionsSection({
  isScrambling,
  onToggleScramble,
  onRandomState,
  onUndo,
  onReset,
  undoDisabled: undoOff,
  resetDisabled: resetOff,
  allowLayerMoves = true,
}: CubeActionsSectionProps) {
  return (
    <div class="cube-3d-section">
      <span class="cube-3d-label">Cube:</span>
      <div class="cube-3d-presets">
        <button
          type="button"
          class={`cube-3d-btn ${isScrambling ? 'cube-3d-btn-active' : ''}`}
          disabled={!allowLayerMoves}
          onClick={onToggleScramble}
          title={isScrambling ? 'Stop scramble' : 'Scramble cube'}
        >
          {isScrambling ? 'Stop' : 'Scramble'}
        </button>
        <button
          type="button"
          class="cube-3d-btn"
          disabled={!allowLayerMoves}
          onClick={onRandomState}
          title="Mix the cube at once into a random valid state"
        >
          Random State
        </button>
        <button
          type="button"
          class="cube-3d-btn"
          onClick={onUndo}
          disabled={undoOff}
          title="Undo the last completed layer turn"
        >
          Undo
        </button>
        <button
          type="button"
          class="cube-3d-btn"
          onClick={onReset}
          disabled={resetOff}
          title="Reset cube to initial assembled state"
        >
          Reset
        </button>
      </div>
    </div>
  )
}

export interface MoveHistoryProps {
  moves: CubeTurn[]
  size: number
}

// The move list the user reads, and the block CubeLab reads (escaped JSON, so no "<" ends the element).
export function MoveHistory({ moves, size }: MoveHistoryProps) {
  return (
    <>
      <div class="cube-3d-move-history" role="status" aria-label="Move history">
        Moves: {moveHistoryText(moves, size)}
      </div>
      <script
        type="application/json"
        id={CUBELAB_MOVES_ID}
        dangerouslySetInnerHTML={{ __html: cubeLabMovesJson(moves, size) }}
      />
    </>
  )
}

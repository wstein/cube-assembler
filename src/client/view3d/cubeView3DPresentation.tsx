import type { ComponentChildren, RefObject } from 'preact'
import type { PressLevel } from './cubeGesture'
import {
  facePreset,
  formatCubeTurn,
  type CubeTurn,
  type ViewFace,
} from './cubeView3DState'
import {
  preferenceCookie,
  readPreference,
  VIEW_HELP_COOKIE,
  SEAM_WIDE_COOKIE,
} from '../preferences'
import { CUBELAB_MOVES_ID, cubeLabMovesJson } from '../cubeLabFingerprint'
import { useCubeHelpHint } from './useCubeHelpHint'

interface CubeView3DPresentationProps {
  isSupported: boolean
  canvasRef: RefObject<HTMLCanvasElement | null>
  handleKeyDown: (event: KeyboardEvent) => void
  handlePointerDown: (event: PointerEvent) => void
  handlePointerMove: (event: PointerEvent) => void
  handlePointerUp: (event: PointerEvent) => void
  handleWheel: (event: WheelEvent) => void
  pressMode: PressLevel | null
  coarsePointer: boolean
  setPreset: (pitch: number, yaw: number) => void
  resetView: (back?: boolean) => void
  isScrambling: boolean
  toggleScramble: () => void
  undoLastTurn: () => void
  moves: CubeTurn[]
  isTurning: boolean
  resetCube: () => void
  isInitialCube: boolean
  puzzleSize: number
  isStickerless: boolean
  onToggleStickerless: () => void
  isRotating: boolean
  onToggleAutoRotate: () => void
  // Whether a drag turns a layer; off, a drag only orbits the view.
  layerMoves: boolean
  onToggleLayerMoves: () => void
  // Shown briefly after a drag on a sticker while layer moves are locked.
  lockedHint: boolean
  // The X/Y/Z gizmo, drawn over the canvas's corner.
  gizmo: ComponentChildren
}

export function CubeView3DPresentation({
  isSupported,
  canvasRef,
  handleKeyDown,
  handlePointerDown,
  handlePointerMove,
  handlePointerUp,
  handleWheel,
  pressMode,
  coarsePointer,
  setPreset,
  resetView,
  isScrambling,
  toggleScramble,
  undoLastTurn,
  moves,
  isTurning,
  resetCube,
  isInitialCube,
  puzzleSize,
  isStickerless,
  onToggleStickerless,
  isRotating,
  onToggleAutoRotate,
  layerMoves,
  onToggleLayerMoves,
  lockedHint,
  gizmo,
}: CubeView3DPresentationProps) {
  const showFace = (face: ViewFace) => {
    const { pitch, yaw } = facePreset(face)
    setPreset(pitch, yaw)
  }
  const helpEnabled = readPreference(document.cookie, VIEW_HELP_COOKIE, true)
  const seamWideEnabled = readPreference(document.cookie, SEAM_WIDE_COOKIE)
  const help = useCubeHelpHint(helpEnabled, () => {
    document.cookie = preferenceCookie(VIEW_HELP_COOKIE, false)
  })

  return (
    <div class="cube-3d-container">
      {!isSupported ? (
        <div class="cube-3d-unsupported">
          <p>WebGL is not available in your browser.</p>
        </div>
      ) : (
        <>
          <div
            class="cube-3d-canvas-wrap"
            onPointerDown={(event) => help.pointerDown(event.pointerId)}
            onPointerUp={(event) => help.pointerUp(event.pointerId)}
            onPointerCancel={(event) => help.pointerUp(event.pointerId)}
            tabIndex={0}
            onKeyDown={handleKeyDown}
            role="region"
            aria-label="3D Rubik's cube interactive canvas"
          >
            <canvas
              ref={canvasRef}
              class="cube-3d-canvas"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              onLostPointerCapture={handlePointerUp}
              // A held sticker must not open the long-press menu.
              onContextMenu={(e) => e.preventDefault()}
              onWheel={(event) => {
                help.activity()
                handleWheel(event)
              }}
              aria-label="Interactive 3D Rubik's Cube Viewer"
            />
            {gizmo}
            {pressMode && pressMode !== 'layer' && (
              <div class="cube-3d-press-mode" role="status">
                Wide turn: drag to turn the touched layers
              </div>
            )}
            {lockedHint && (
              <div class="cube-3d-press-mode" role="status">
                Locked - tap the lock to move layers
              </div>
            )}
            {help.visible && (
              <div class="cube-3d-hint">
                {coarsePointer ? (
                  <>
                    Swipe a sticker to turn its layer; gaps are inactive
                    {seamWideEnabled &&
                      '; swipe near a gap and lean toward a side for a wide turn'}{' '}
                    &bull; Two fingers on the cube turn it, beside it rotate the
                    view &bull; Pinch to zoom
                  </>
                ) : (
                  <>
                    Swipe a sticker to turn its layer; gaps are inactive
                    {seamWideEnabled &&
                      '; swipe near a gap and lean toward a side for a wide turn'}{' '}
                    &bull; Shift makes a wide turn &bull; Two fingers on the
                    cube turn the whole cube &bull; Drag the background or swipe
                    two fingers beside the cube to rotate the view &bull; Pinch
                    or scroll to zoom
                  </>
                )}
              </div>
            )}
          </div>
          <div class="cube-3d-toolbar">
            <div class="cube-3d-section">
              <span class="cube-3d-label">Faces:</span>
              <div class="cube-3d-presets">
                <button
                  type="button"
                  class="cube-3d-btn"
                  onClick={() => showFace('u')}
                  title="Up face"
                >
                  Up (U)
                </button>
                <button
                  type="button"
                  class="cube-3d-btn"
                  onClick={() => showFace('r')}
                  title="Right face"
                >
                  Right (R)
                </button>
                <button
                  type="button"
                  class="cube-3d-btn"
                  onClick={() => showFace('f')}
                  title="Front face"
                >
                  Front (F)
                </button>
                <button
                  type="button"
                  class="cube-3d-btn"
                  onClick={() => showFace('d')}
                  title="Down face"
                >
                  Down (D)
                </button>
                <button
                  type="button"
                  class="cube-3d-btn"
                  onClick={() => showFace('l')}
                  title="Left face"
                >
                  Left (L)
                </button>
                <button
                  type="button"
                  class="cube-3d-btn"
                  onClick={() => showFace('b')}
                  title="Back face"
                >
                  Back (B)
                </button>
                <button
                  type="button"
                  class="cube-3d-btn"
                  onClick={() => resetView()}
                  title="Reset to Isometric view"
                >
                  Isometric
                </button>
                <button
                  type="button"
                  class="cube-3d-btn"
                  onClick={() => resetView(true)}
                  title="Isometric view from behind"
                >
                  Iso-back
                </button>
              </div>
            </div>

            <div class="cube-3d-section">
              <span class="cube-3d-label">Cube:</span>
              <div class="cube-3d-presets">
                <button
                  type="button"
                  class={`cube-3d-btn ${isScrambling ? 'cube-3d-btn-active' : ''}`}
                  onClick={toggleScramble}
                  title={isScrambling ? 'Stop scramble' : 'Scramble cube'}
                >
                  {isScrambling ? 'Stop' : 'Scramble'}
                </button>
                <button
                  type="button"
                  class="cube-3d-btn"
                  onClick={undoLastTurn}
                  disabled={moves.length === 0 || isTurning}
                  title="Undo the last completed layer turn"
                >
                  Undo
                </button>
                <button
                  type="button"
                  class="cube-3d-btn"
                  onClick={resetCube}
                  disabled={isInitialCube && moves.length === 0}
                  title="Reset cube to initial assembled state"
                >
                  Reset
                </button>
              </div>
            </div>

            <div
              class="cube-3d-move-history"
              role="status"
              aria-label="Move history"
            >
              Moves:{' '}
              {moves.length
                ? moves
                    .map((move) => formatCubeTurn(move, puzzleSize))
                    .join(' ')
                : 'None'}
            </div>
            <script
              type="application/json"
              id={CUBELAB_MOVES_ID}
              // Escaped JSON (no "<"), so it cannot end the element early.
              dangerouslySetInnerHTML={{
                __html: cubeLabMovesJson(moves, puzzleSize),
              }}
            />

            <div class="cube-3d-actions">
              <button
                type="button"
                class="cube-3d-btn"
                onClick={onToggleStickerless}
                title="Toggle between stickerless and stickered appearance"
              >
                {isStickerless ? 'Stickerless' : 'Stickered'}
              </button>
              <button
                type="button"
                class={`cube-3d-btn ${isRotating ? 'cube-3d-btn-active' : ''}`}
                onClick={onToggleAutoRotate}
              >
                {isRotating ? 'Pause' : 'Auto-rotate'}
              </button>
              <button
                type="button"
                class={`cube-3d-btn ${layerMoves ? 'cube-3d-btn-active' : ''}`}
                aria-pressed={layerMoves}
                onClick={onToggleLayerMoves}
              >
                <svg
                  class="cube-3d-lock"
                  viewBox="0 0 16 16"
                  width="14"
                  height="14"
                  aria-hidden="true"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.6"
                >
                  <rect x="3" y="7" width="10" height="7" rx="1.5" />
                  <path
                    d={
                      layerMoves
                        ? 'M5.5 7V5a2.5 2.5 0 0 1 5 0'
                        : 'M5 7V5a3 3 0 0 1 6 0v2'
                    }
                  />
                </svg>{' '}
                Move layers
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

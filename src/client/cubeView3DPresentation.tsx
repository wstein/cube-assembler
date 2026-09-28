import type { RefObject } from 'preact'
import type { PressLevel } from './cubeGesture'
import { formatCubeTurn, type CubeTurn } from './cubeView3DState'

interface CubeView3DPresentationProps {
  isSupported: boolean
  canvasRef: RefObject<HTMLCanvasElement>
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
  // Turns the whole cube about an axis (0 x, 1 y, 2 z), recorded as a move.
  turnWholeCube: (axis: 0 | 1 | 2, turns: number) => void
}

// Icons for the whole-cube buttons: a clockwise and a counterclockwise
// arrow, and arrows up and down for a half turn.
function TurnIcon({ kind }: { kind: 'cw' | 'ccw' | 'flip' }) {
  return (
    <svg
      class="cube-3d-btn-icon"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      {kind === 'flip' ? (
        <path d="M8 3v18M4 7l4-4 4 4M16 21V3M12 17l4 4 4-4" />
      ) : (
        <g transform={kind === 'ccw' ? 'matrix(-1 0 0 1 24 0)' : undefined}>
          <path d="M21 12a9 9 0 1 1-2.64-6.36" />
          <path d="M21 3v6h-6" />
        </g>
      )}
    </svg>
  )
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
  turnWholeCube,
}: CubeView3DPresentationProps) {
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
              // A held sticker must not open the long-press menu.
              onContextMenu={(e) => e.preventDefault()}
              onWheel={handleWheel}
              aria-label="Interactive 3D Rubik's Cube Viewer"
            />
            {pressMode && pressMode !== 'layer' && (
              <div class="cube-3d-press-mode" role="status">
                {pressMode === 'wide'
                  ? 'Wide turn: drag to turn the touched layers'
                  : 'Whole cube: drag to rotate it'}
              </div>
            )}
            <div class="cube-3d-hint">
              {coarsePointer ? (
                <>
                  Swipe a sticker to turn its layer; hold 300 ms for a wide turn
                  &bull; Two fingers on the cube turn it, beside it rotate the
                  view &bull; Pinch to zoom
                </>
              ) : (
                <>
                  Swipe a sticker to turn its layer; hold 300 ms or Shift for a
                  wide turn &bull; Two fingers on the cube (or Alt) turn the
                  whole cube &bull; Drag the background or swipe two fingers
                  beside the cube to rotate the view &bull; Pinch or scroll to
                  zoom
                </>
              )}
            </div>
          </div>
          <div class="cube-3d-toolbar">
            <div class="cube-3d-section">
              <span class="cube-3d-label">Faces:</span>
              <div class="cube-3d-presets">
                <button
                  type="button"
                  class="cube-3d-btn"
                  onClick={() => setPreset(Math.PI / 2 - 0.05, 0)}
                  title="Up face"
                >
                  Up (U)
                </button>
                <button
                  type="button"
                  class="cube-3d-btn"
                  onClick={() => setPreset(0, -Math.PI / 2)}
                  title="Right face"
                >
                  Right (R)
                </button>
                <button
                  type="button"
                  class="cube-3d-btn"
                  onClick={() => setPreset(0, 0)}
                  title="Front face"
                >
                  Front (F)
                </button>
                <button
                  type="button"
                  class="cube-3d-btn"
                  onClick={() => setPreset(-Math.PI / 2 + 0.05, 0)}
                  title="Down face"
                >
                  Down (D)
                </button>
                <button
                  type="button"
                  class="cube-3d-btn"
                  onClick={() => setPreset(0, Math.PI / 2)}
                  title="Left face"
                >
                  Left (L)
                </button>
                <button
                  type="button"
                  class="cube-3d-btn"
                  onClick={() => setPreset(0, Math.PI)}
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

            <div class="cube-3d-section">
              <span class="cube-3d-label">Turn:</span>
              <div class="cube-3d-presets">
                <button
                  type="button"
                  class="cube-3d-btn"
                  onClick={() => turnWholeCube(1, 1)}
                  title="Turn the whole cube like U (y)"
                >
                  <TurnIcon kind="cw" />
                  Rotate y
                </button>
                <button
                  type="button"
                  class="cube-3d-btn"
                  onClick={() => turnWholeCube(1, -1)}
                  title="Turn the whole cube like U' (y')"
                >
                  <TurnIcon kind="ccw" />
                  Rotate y'
                </button>
                <button
                  type="button"
                  class="cube-3d-btn"
                  onClick={() => turnWholeCube(0, 2)}
                  title="Turn the whole cube upside down (x2)"
                >
                  <TurnIcon kind="flip" />
                  Flip x2
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
            </div>
          </div>
        </>
      )}
    </div>
  )
}

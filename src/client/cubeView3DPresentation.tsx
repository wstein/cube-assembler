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
                  &bull; Swipe the mini cube to turn the whole cube &bull; Two
                  fingers rotate the view or pinch to zoom
                </>
              ) : (
                <>
                  Swipe a sticker to turn its layer; hold 300 ms or Shift for a
                  wide turn &bull; Swipe the mini cube or hold Alt to turn the
                  whole cube &bull; Drag the background to rotate the view
                  &bull; Scroll to zoom
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

import { lazy, Suspense } from 'preact/compat'
import type { CubeState } from '../cube/cubeAssembly'
import type { ParityResult } from '../cube/parity'
import type { FaceCaptureData } from './captureTypes'
import type { CubeTurn } from './cubeView3D'
import { CubeNetView } from './cubeNetView'

const CubeView3D = lazy(() =>
  import('./cubeView3D').then((module) => ({ default: module.CubeView3D })),
)

const PARITY_CHECK_NAMES: Record<string, string> = {
  colorBalance: 'Color balance',
  cornerColors: 'Corner colors',
  cornerOrientation: 'Corner twist',
  edgeColors: 'Edge colors',
  edgeOrientation: 'Edge flip',
  permutationParity: 'Parity',
  wingEdgeColors: 'Wing colors',
}

interface CubeDisplayCardProps {
  sourceCube: CubeState
  visibleCube: CubeState
  size: number
  parity: ParityResult | null
  capturedFaces: Record<string, FaceCaptureData>
  faceOrder: readonly string[]
  stickerColors: Record<string, string>
  colorNames: Record<string, string>
  confidenceTier: (confidence: number) => 'high' | 'medium' | 'low'
  viewMode: 'net' | '3d'
  initialMoves: CubeTurn[]
  onViewModeChange: (mode: 'net' | '3d') => void
  onTurnStateChange: (cube: CubeState, moves: CubeTurn[]) => void
}

export function CubeDisplayCard({
  sourceCube,
  visibleCube,
  size,
  parity,
  capturedFaces,
  faceOrder,
  stickerColors,
  colorNames,
  confidenceTier,
  viewMode,
  initialMoves,
  onViewModeChange,
  onTurnStateChange,
}: CubeDisplayCardProps) {
  return (
    <section class="card cube-card">
      <div class="card-header">
        <h2>Your cube</h2>
        <div role="status">
          {parity && (
            <span class={`verdict ${parity.valid ? 'is-valid' : 'is-invalid'}`}>
              {parity.valid
                ? '✓ Valid cube — every check passed'
                : parity.result}
              {!parity.valid && parity.detail && (
                <span class="status-detail">: {parity.detail}</span>
              )}
            </span>
          )}
        </div>
        <div class="header-spacer" />
        <div class="cube-view-toggle" role="group" aria-label="Cube view mode">
          <button
            type="button"
            class={`cube-view-toggle-btn ${viewMode === 'net' ? 'is-active' : ''}`}
            onClick={() => onViewModeChange('net')}
          >
            2D Net
          </button>
          <button
            type="button"
            class={`cube-view-toggle-btn ${viewMode === '3d' ? 'is-active' : ''}`}
            onClick={() => onViewModeChange('3d')}
          >
            3D View
          </button>
        </div>
      </div>
      {viewMode === '3d' ? (
        <Suspense
          fallback={
            <div class="cube-3d-container">
              <div class="cube-3d-hint">Loading 3D view...</div>
            </div>
          }
        >
          <CubeView3D
            cube={sourceCube}
            initialCube={visibleCube}
            initialMoves={initialMoves}
            onTurnStateChange={onTurnStateChange}
            puzzleSize={size}
            palette={stickerColors}
          />
        </Suspense>
      ) : (
        <CubeNetView
          key={size}
          cube={visibleCube}
          size={size}
          parity={parity}
          capturedFaces={capturedFaces}
          faceOrder={faceOrder}
          stickerColors={stickerColors}
          colorNames={colorNames}
          confidenceTier={confidenceTier}
        />
      )}
      {parity && (
        <div class="parity-checks">
          {Object.entries(parity.checks).map(([check, valid]) => (
            <div
              class={`parity-check ${valid ? 'is-ok' : 'is-failed'}`}
              key={check}
            >
              <span class="parity-check-name">
                {PARITY_CHECK_NAMES[check] ?? check}
              </span>
              <span class="parity-check-result">
                {valid ? '✓ ok' : '✗ failed'}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

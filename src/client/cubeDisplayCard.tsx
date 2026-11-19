import type { CandidatePhotoEvidence } from './capture/photoProvenance'
import { useMemo } from 'preact/hooks'
import { validateMapping } from './capture/captureFaceMapping'
import {
  presentationCube,
  presentationMoves,
  presentationColorFrame,
} from './capture/recoveryPresentation'
import type { CaptureRecovery } from './capture/captureRecovery'
import { lazy, Suspense } from 'preact/compat'
import type { CubeState } from '../cube/cubeAssembly'
import type { ParityResult } from '../cube/parity'
import type { FaceCaptureData } from './capture/captureTypes'
import type { CubeTurn } from './view3d/cubeView3DState'
import {
  initialColorFrame,
  type colorFrame as ColorFrame,
} from '../core/view/AxisGizmo.gen'
import { CubeNetView } from './cubeNetView'
import {
  mainViewerKind,
  puzlwerkMainViewProps,
} from './view3d/puzlwerkMainView'

const CubeView3D = lazy(() =>
  import('./view3d/cubeView3D').then((module) => ({
    default: module.CubeView3D,
  })),
)
// Only requested with `?viewer=puzlwerk`.
const PuzlwerkCubeView = lazy(() =>
  import('./view3d/puzlwerkCubeView').then((module) => ({
    default: module.PuzlwerkCubeView,
  })),
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
  photoEvidence?: CandidatePhotoEvidence
  recovery?: CaptureRecovery | null
  sourceCube: CubeState
  visibleCube: CubeState
  size: number
  parity: ParityResult | null
  capturedFaces: Record<string, FaceCaptureData>
  faceOrder: readonly string[]
  stickerColors: Record<string, string>
  colorNames: Record<string, string>
  viewMode: 'net' | '3d'
  initialMoves: CubeTurn[]
  initialFrame?: ColorFrame
  onViewModeChange: (mode: 'net' | '3d') => void
  onEditSticker?: (
    face: string,
    row: number,
    col: number,
    turns: number,
    sourceOnly?: boolean,
  ) => void
  onTurnStateChange: (
    cube: CubeState,
    moves: CubeTurn[],
    frame: ColorFrame,
  ) => void
}

export function CubeDisplayCard({
  recovery = null,
  photoEvidence,
  sourceCube,
  visibleCube,
  size,
  parity,
  capturedFaces,
  faceOrder,
  stickerColors,
  colorNames,
  viewMode,
  initialMoves,
  initialFrame,
  onViewModeChange,
  onEditSticker,
  onTurnStateChange,
}: CubeDisplayCardProps) {
  const displayRecovery = useMemo<CaptureRecovery | null>(
    () => (recovery ? { ...recovery, view: 'canonical' } : null),
    [recovery],
  )
  const shownSource = useMemo(
    () => presentationCube(sourceCube, size, displayRecovery),
    [sourceCube, size, displayRecovery],
  )
  const shownVisible = useMemo(
    () => presentationCube(visibleCube, size, displayRecovery),
    [visibleCube, size, displayRecovery],
  )
  const mainFrame = presentationColorFrame(
    initialFrame ?? initialColorFrame(sourceCube, size),
    displayRecovery,
  )
  const captureInitial = recovery
    ? validateMapping(
        Object.fromEntries(
          Object.entries(capturedFaces).map(([f, d]) => [f, d.colors]),
        ),
        recovery.mapping,
        size,
      ).candidate
    : null
  const captureCube = captureInitial
    ? (Object.fromEntries(
        (['U', 'R', 'F', 'D', 'L', 'B'] as const).map((f) => [
          f.toLowerCase(),
          captureInitial.faces[f].flat(),
        ]),
      ) as CubeState)
    : sourceCube
  const atSource = (['u', 'r', 'f', 'd', 'l', 'b'] as const).every(
    (f) =>
      visibleCube[f].length === captureCube[f].length &&
      visibleCube[f].every((v, i) => v === captureCube[f][i]),
  )
  return (
    <section class="card cube-card">
      <div class="card-header">
        <h2>Your cube</h2>
        <div role="status">
          {parity && (
            <span class={`verdict ${parity.valid ? 'is-valid' : 'is-invalid'}`}>
              {parity.valid
                ? size >= 4
                  ? '✓ Available checks passed — full reachability unverified'
                  : '✓ Valid cube — every check passed'
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
      {recovery?.stateRelation === 'after-viewer-moves' && (
        <p class="capture-warning">
          This saved state includes later viewer edits. The initial photo
          mapping is preserved separately; the relationship to the photos is
          unverified. Available state checks are shown below.
        </p>
      )}
      {viewMode === '3d' ? (
        <Suspense
          fallback={
            <div class="cube-3d-container">
              <div class="cube-3d-hint">Loading 3D view...</div>
            </div>
          }
        >
          {mainViewerKind(window.location.search) === 'puzlwerk' ? (
            <PuzlwerkCubeView
              {...puzlwerkMainViewProps({
                cube: shownSource,
                initialCube: shownVisible,
                initialMoves: presentationMoves(initialMoves, displayRecovery),
                puzzleSize: size,
                palette: stickerColors,
              })}
              colorFrame={mainFrame}
              initialFrame={mainFrame}
              publicMoves={(moves) =>
                presentationMoves(moves, displayRecovery, true)
              }
              onTurnStateChange={(value, moves, frame) =>
                onTurnStateChange(
                  presentationCube(value, size, displayRecovery, true),
                  presentationMoves(moves, displayRecovery, true),
                  presentationColorFrame(frame, displayRecovery, true),
                )
              }
              main
            />
          ) : (
            <CubeView3D
              cube={shownSource}
              initialCube={shownVisible}
              initialMoves={presentationMoves(initialMoves, displayRecovery)}
              initialFrame={mainFrame}
              publicMoves={(moves) =>
                presentationMoves(moves, displayRecovery, true)
              }
              onTurnStateChange={(value, moves, frame) =>
                onTurnStateChange(
                  presentationCube(value, size, displayRecovery, true),
                  presentationMoves(moves, displayRecovery, true),
                  presentationColorFrame(frame, displayRecovery, true),
                )
              }
              puzzleSize={size}
              palette={stickerColors}
            />
          )}
        </Suspense>
      ) : (
        <CubeNetView
          key={size}
          cube={shownVisible}
          photoEvidence={atSource ? photoEvidence : undefined}
          size={size}
          parity={parity}
          capturedFaces={capturedFaces}
          faceOrder={faceOrder}
          stickerColors={stickerColors}
          colorNames={colorNames}
          onEditSticker={onEditSticker}
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

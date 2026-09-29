import { useEffect, useRef, useState } from 'preact/hooks'
import '../../web/cube3d.css'
import {
  STICKERLESS_COOKIE,
  preferenceCookie,
  readPreference,
} from './preferences'
import type { CubeState } from '../cube/cubeAssembly'

import { AxisGizmo } from './axisGizmo'
import { CubeView3DPresentation } from './cubeView3DPresentation'
import { useCubeCamera } from './useCubeCamera'
import { useCubeTurns } from './useCubeTurns'
import { useCubeRenderer } from './useCubeRenderer'
import { useCubeGestures } from './useCubeGestures'
import { createCubeViewControls } from './cubeViewControls'
import { DEFAULT_STICKER_HEX, type CubeTurn } from './cubeView3DState'
export * from './cubeMesh'
export * from './cubeView3DGraphics'
export * from './cubeView3DState'

export interface CubeView3DProps {
  cube: CubeState
  initialCube?: CubeState
  initialMoves?: CubeTurn[]
  onTurnStateChange?: (cube: CubeState, moves: CubeTurn[]) => void
  puzzleSize: number
  palette?: Record<string, string>
  stickerless?: boolean
  onClose?: () => void
}

export function CubeView3D({
  cube,
  initialCube = cube,
  initialMoves = [],
  onTurnStateChange,
  puzzleSize,
  palette = DEFAULT_STICKER_HEX,
  stickerless = true,
}: CubeView3DProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const {
    pitch,
    setPitch,
    yaw,
    setYaw,
    setZoom,
    stateRef,
    isDraggingRef,
    resumeAutoAtRef,
    lastPointerRef,
    inertiaRef,
    pauseAutoRotation,
    rotateView,
    stepCamera,
    gestureCamera,
    isRotating,
    toggleAutoRotate,
  } = useCubeCamera(puzzleSize)
  const [isStickerless, setIsStickerless] = useState<boolean>(() =>
    readPreference(document.cookie, STICKERLESS_COOKIE, stickerless),
  )
  const {
    currentCube,
    currentCubeRef,
    moves,
    isScrambling,
    isTurning,
    setIsTurning,
    dragTurnRef,
    busy,
    finishSettlingTurn,
    settleDrag,
    toggleScramble,
    resetCube,
    undoLastTurn,
    isInitialCube,
    advance,
  } = useCubeTurns({
    cube,
    initialCube,
    initialMoves,
    puzzleSize,
    onTurnStateChange,
    pauseAutoRotation,
  })
  const isSupported = useCubeRenderer({
    canvasRef,
    cubeRef: currentCubeRef,
    resetKey: cube,
    puzzleSize,
    palette,
    isStickerless,
    viewRef: stateRef,
    onFrame: (time, elapsed) => {
      const update = advance(time)
      stepCamera(time, elapsed)
      return update
    },
  })

  useEffect(() => {
    document.cookie = preferenceCookie(STICKERLESS_COOKIE, isStickerless)
  }, [isStickerless])

  const [coarsePointer] = useState(
    () => window.matchMedia?.('(pointer: coarse)').matches ?? false,
  )

  const {
    resetView,
    setPreset,
    handleWheel: handleViewWheel,
    handleKeyDown,
  } = createCubeViewControls({
    puzzleSize,
    pauseAutoRotation,
    setPitch,
    setYaw,
    setZoom,
    rotateView,
  })

  const {
    pressMode,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleCubeWheel,
  } = useCubeGestures({
    canvasRef,
    puzzleSize,
    camera: {
      isDraggingRef,
      resumeAutoAtRef,
      lastPointerRef,
      inertiaRef,
      pauseAutoRotation,
      rotateView,
      gestureCamera,
      setZoom,
    },
    turns: { dragTurnRef, setIsTurning, busy, finishSettlingTurn, settleDrag },
    handleViewWheel,
  })

  return (
    <CubeView3DPresentation
      isSupported={isSupported}
      canvasRef={canvasRef}
      handleKeyDown={handleKeyDown}
      handlePointerDown={handlePointerDown}
      handlePointerMove={handlePointerMove}
      handlePointerUp={handlePointerUp}
      handleWheel={handleCubeWheel}
      gizmo={
        <AxisGizmo
          cube={currentCube}
          puzzleSize={puzzleSize}
          pitch={pitch}
          yaw={yaw}
          palette={palette}
        />
      }
      pressMode={pressMode}
      coarsePointer={coarsePointer}
      setPreset={setPreset}
      resetView={resetView}
      isScrambling={isScrambling}
      toggleScramble={toggleScramble}
      undoLastTurn={undoLastTurn}
      moves={moves}
      isTurning={isTurning}
      resetCube={resetCube}
      isInitialCube={isInitialCube}
      puzzleSize={puzzleSize}
      isStickerless={isStickerless}
      onToggleStickerless={() => setIsStickerless((value) => !value)}
      isRotating={isRotating}
      onToggleAutoRotate={toggleAutoRotate}
    />
  )
}

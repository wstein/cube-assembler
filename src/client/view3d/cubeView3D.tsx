import { useEffect, useRef, useState } from 'preact/hooks'
import '../../../web/cube3d.css'
import { lockedHintDue } from './cubeGesture'
import {
  LAYER_MOVES_COOKIE,
  STICKERLESS_COOKIE,
  layerMovesOn,
  preferenceCookie,
  readPreference,
} from '../preferences'
import type { CubeState } from '../../cube/cubeAssembly'
import type { colorFrame as ColorFrame } from '../../core/view/AxisGizmo.gen'

import { AxisGizmo } from './axisGizmo'
import { CubeView3DPresentation } from './cubeView3DPresentation'
import { useCubeCamera } from './useCubeCamera'
import { useCubeTurns } from './useCubeTurns'
import { useCubeRenderer } from './useCubeRenderer'
import { useCubeGestures } from './useCubeGestures'
import { createCubeViewControls } from './cubeViewControls'
import { DEFAULT_STICKER_HEX, type CubeTurn } from './cubeView3DState'

export interface CubeView3DProps {
  cube: CubeState
  initialCube?: CubeState
  initialMoves?: CubeTurn[]
  initialFrame?: ColorFrame
  onTurnStateChange?: (
    cube: CubeState,
    moves: CubeTurn[],
    frame: ColorFrame,
  ) => void
  puzzleSize: number
  palette?: Record<string, string>
  stickerless?: boolean
  onClose?: () => void
}

const LOCKED_HINT_VISIBLE_MS = 2500

export function CubeView3D({
  cube,
  initialCube = cube,
  initialMoves = [],
  initialFrame,
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
    isCameraIdle,
    gestureCamera,
    isRotating,
    toggleAutoRotate,
  } = useCubeCamera(puzzleSize)
  const [isStickerless, setIsStickerless] = useState<boolean>(() =>
    readPreference(document.cookie, STICKERLESS_COOKIE, stickerless),
  )
  const {
    currentCubeRef,
    frame,
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
    initialFrame,
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
    isIdle: (time) => !busy() && isCameraIdle(time),
  })

  const [layerMoves, setLayerMoves] = useState<boolean>(() =>
    layerMovesOn(document.cookie),
  )
  // Dragging a sticker while locked explains the lock, at most once per gap.
  const [lockedHint, setLockedHint] = useState(false)
  const lockedHintShownAtRef = useRef<number | null>(null)
  const lockedHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const showLockedHint = () => {
    const now = Date.now()
    if (!lockedHintDue(lockedHintShownAtRef.current, now)) return
    lockedHintShownAtRef.current = now
    setLockedHint(true)
    if (lockedHintTimerRef.current !== null)
      clearTimeout(lockedHintTimerRef.current)
    lockedHintTimerRef.current = setTimeout(
      () => setLockedHint(false),
      LOCKED_HINT_VISIBLE_MS,
    )
  }
  useEffect(
    () => () => {
      if (lockedHintTimerRef.current !== null)
        clearTimeout(lockedHintTimerRef.current)
    },
    [],
  )
  useEffect(() => {
    document.cookie = preferenceCookie(LAYER_MOVES_COOKIE, layerMoves)
  }, [layerMoves])

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
    onLockedDrag: showLockedHint,
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
        <AxisGizmo frame={frame} pitch={pitch} yaw={yaw} palette={palette} />
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
      layerMoves={layerMoves}
      lockedHint={lockedHint && !layerMoves}
      onToggleLayerMoves={() => setLayerMoves((value) => !value)}
    />
  )
}

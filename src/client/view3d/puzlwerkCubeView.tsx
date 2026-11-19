// Spike: the capture-review 3D view on the shared PuzlWerk viewer (@puzlwerk/viewer), view only.
// Selected by `?viewer=puzlwerk` (see cubeView3DChoice.tsx); the CubeState becomes wire-v1 documents
// in @puzlwerk/viewer/bridge, so no translation lives in this app.
import { useEffect, useRef, useState } from 'preact/hooks'
import {
  createCubeStage,
  cubePresentationRadius,
  indicatorColorsFromFrame,
  presentationCameraRadius,
  type CubeStage,
  type StageChild,
  type ViewPreset,
} from '@puzlwerk/viewer'
import { open } from '@puzlwerk/viewer/bridge'
import {
  cubePresentation,
  cubeStateDocuments,
  faceStickerIds,
} from '@puzlwerk/viewer/bridge/cube-state'
import '../../../web/cube3d.css'
import type { CubeState, FaceKey } from '../../cube/cubeAssembly'
import {
  DEFAULT_STICKER_HEX,
  ISOMETRIC_PITCH,
  ISOMETRIC_YAW,
} from './cubeView3DState'
import { eulerPitchYaw } from './puzlwerkOrientation'
import { frameHexes } from './puzlwerkMainView'
import { LOCKED_HINT_TEXT, turnSignal, WIDE_BADGE_TEXT } from './puzlwerkHints'
import { usePuzlwerkHints } from './usePuzlwerkHints'
import { applyConstruction, mountMainPlay, type MainPlay } from './puzlwerkPlay'
import { arrowOrientation, keyPreset } from './puzlwerkBars'
import { PuzlwerkToolbar } from './puzlwerkToolbar'
import { usePuzlwerkTurns } from './usePuzlwerkTurns'
import { resetDisabled, undoDisabled } from './cubeToolbarSections'
import type { CubeTurn } from './cubeView3DState'
import {
  AUTO_ROTATE_COOKIE,
  LAYER_MOVES_COOKIE,
  layerMovesOn,
  preferenceCookie,
  readPreference,
  STICKERLESS_COOKIE,
} from '../preferences'
import type { colorFrame as ColorFrame } from '../../core/view/AxisGizmo.gen'

export interface PuzlwerkCubeViewProps {
  cube: CubeState
  puzzleSize: number
  palette?: Record<string, string>
  highlightedFace?: FaceKey
  // Color frame of the cube; the axis gizmo shows the colors of its R, U and F faces.
  colorFrame?: ColorFrame
  // Main view: the state shown at first (`cube` is what Reset returns to), the moves and color frame
  // that go with it, the moves as the user reads them and the app's hook for every state change.
  initialCube?: CubeState
  initialMoves?: CubeTurn[]
  initialFrame?: ColorFrame
  publicMoves?: (moves: CubeTurn[]) => CubeTurn[]
  onTurnStateChange?: (
    cube: CubeState,
    moves: CubeTurn[],
    frame: ColorFrame,
  ) => void
  // Main view: layers can be turned (unless locked) and the overlay hints show. The dialogs are view only.
  main?: boolean
}

const DEFAULT_INDICATOR = { x: 0xd9493f, y: 0xf4f4f4, z: 0x4caf67 }

const faceName = (face: FaceKey) =>
  face.toLowerCase() as 'u' | 'r' | 'f' | 'd' | 'l' | 'b'

export function PuzlwerkCubeView({
  cube,
  puzzleSize,
  palette = DEFAULT_STICKER_HEX,
  highlightedFace,
  colorFrame,
  initialCube,
  initialMoves,
  initialFrame,
  publicMoves,
  onTurnStateChange,
  main = false,
}: PuzlwerkCubeViewProps) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  // Layer moves are locked until the setting is on: the viewer then stays in its view mode.
  const [layerMoves, setLayerMoves] = useState(
    () => main && layerMovesOn(document.cookie),
  )
  const [stickerless, setStickerless] = useState(() =>
    readPreference(document.cookie, STICKERLESS_COOKIE, true),
  )
  const [autoRotate, setAutoRotate] = useState(() =>
    readPreference(document.cookie, AUTO_ROTATE_COOKIE),
  )
  const stickerlessRef = useRef(stickerless)
  // The stage applies the construction to the children it shows, so it is set once a state is shown and on each toggle.
  const stageRef = useRef<CubeStage | null>(null)
  const syncConstruction = () => {
    const current = stageRef.current
    if (!current) return
    void applyConstruction(current, () =>
      stickerlessRef.current ? 'stickerless' : 'stickered',
    ).then((construction) => {
      // Signal for tests: the construction the stage committed.
      if (hostRef.current && stageRef.current === current)
        hostRef.current.dataset.appearance = construction
    })
  }
  const hints = usePuzlwerkHints({ size: puzzleSize, locked: !layerMoves })
  const layerMovesRef = useRef(layerMoves)
  layerMovesRef.current = layerMoves
  const playRef = useRef<MainPlay | null>(null)
  // The cube, its moves and the CUBE group actions (main view); the viewer plays, the hook records.
  const turns = usePuzlwerkTurns({
    size: puzzleSize,
    source: cube,
    start: initialCube,
    moves: initialMoves,
    frame: initialFrame ?? colorFrame,
    onTurnStateChange,
    playRef,
  })
  // The play effect below makes another player when the palette or the seam setting changes; a turn the
  // old one is playing then no longer counts.
  const playInputsRef = useRef({ palette, seamWide: hints.seamWide })
  if (
    playInputsRef.current.palette !== palette ||
    playInputsRef.current.seamWide !== hints.seamWide
  ) {
    playInputsRef.current = { palette, seamWide: hints.seamWide }
    turns.invalidate()
  }
  const turnsRef = useRef(turns)
  turnsRef.current = turns
  // The display orientation the stage reported last, for the arrow keys.
  const orientationRef = useRef<readonly [number, number, number, number]>(
    eulerPitchYaw(ISOMETRIC_PITCH, ISOMETRIC_YAW),
  )
  const onPlayEventRef = useRef(hints.onPlayEvent)
  onPlayEventRef.current = (event) => {
    hints.onPlayEvent(event)
    if (main) turnsRef.current.onPlayEvent(event)
  }
  // The dialogs keep one child for the stage; the main view makes one per shown state (puzlwerkPlay.ts).
  const sceneRef = useRef<{ stage: CubeStage; child?: StageChild } | null>(null)
  const [stage, setStage] = useState<{
    stage: CubeStage
    child?: StageChild
  } | null>(null)
  stageRef.current = stage?.stage ?? null
  const [problem, setProblem] = useState<string | null>(null)
  // Main view: the gizmo follows the frame of the state held; the dialogs show the frame they are given.
  const frame = frameHexes(main ? turns.state.frame : colorFrame, palette)
  const indicatorColors = (frame && indicatorColorsFromFrame(frame)) || null
  const colors = indicatorColors?.ok ? indicatorColors.value : DEFAULT_INDICATOR
  const colorsRef = useRef(colors)
  colorsRef.current = colors
  const colorKey = `${colors.x},${colors.y},${colors.z}`

  // One stage per cube size: the camera fit and the shadow envelope depend on the nominal edge.
  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const radius = cubePresentationRadius(
      cubePresentation(puzzleSize).nominalEdge / 2,
    )
    const created = createCubeStage(host, {
      appearanceControls: 'hidden',
      resolveAsset: async (id) => ({
        ok: false,
        error: { code: 'UnresolvedAsset', message: id },
      }),
      initialOrientation: eulerPitchYaw(ISOMETRIC_PITCH, ISOMETRIC_YAW),
      casterEnvelope: { radius, clearance: 0.08 },
      onPlayEvent: (event) => {
        const signal = turnSignal(event)
        if (hostRef.current && signal !== undefined)
          hostRef.current.dataset.turn = signal
        onPlayEventRef.current(event)
      },
      onViewChanged: (view) => {
        orientationRef.current = view.orientation
        // Signal for tests: the display orientation the stage reports.
        if (hostRef.current)
          hostRef.current.dataset.orientation = view.orientation
            .map((value) => value.toFixed(6))
            .join(',')
      },
      viewPolicy: (view) => {
        const distance =
          presentationCameraRadius(view.aspect, radius, view.fovDegrees) *
          view.zoom
        return {
          distance,
          far: Math.max(100, distance + 2 * radius),
          groupScale: 1,
        }
      },
    })
    if (!created.ok) {
      setProblem(created.error.message)
      return
    }
    // The X/Y/Z axis gizmo of the existing view: the viewer's overlay, reference frame and colors as default.
    const indicator = created.value.setOrientationIndicator({
      physicalOrientation: [0, 0, 0, 1],
      solverFrame: [0, 0, 0, 1],
      colors: colorsRef.current,
    })
    if (!indicator.ok) {
      created.value.dispose()
      setProblem(indicator.error.message)
      return
    }
    const added = main
      ? undefined
      : created.value.addCube({ position: [0, 0, 0] })
    if (added && !added.ok) {
      created.value.dispose()
      setProblem(added.error.message)
      return
    }
    const value = { stage: created.value, child: added?.value }
    sceneRef.current = value
    setStage(value)
    return () => {
      sceneRef.current = null
      setStage(null)
      created.value.dispose()
    }
  }, [puzzleSize, main])

  // A new frame recolors the gizmo without rebuilding the stage.
  useEffect(() => {
    if (!stage) return
    const applied = stage.stage.setOrientationIndicator({
      physicalOrientation: [0, 0, 0, 1],
      solverFrame: [0, 0, 0, 1],
      colors: colorsRef.current,
    })
    // Signal for tests: the X, Y and Z colors the stage was given.
    const host = hostRef.current
    if (host && applied.ok)
      host.dataset.indicator = [colors.x, colors.y, colors.z]
        .map((c) => `#${c.toString(16).padStart(6, '0')}`)
        .join(',')
  }, [stage, colorKey])

  // Main view: the layers play in the viewer (locked: view mode only).
  useEffect(() => {
    if (!stage || !main) return
    // The state held is shown; a reset, a random state or a new source (`turns.epoch`) shows another.
    const play = mountMainPlay({
      stage: stage.stage,
      cube: turns.stateRef.current.cube,
      size: puzzleSize,
      palette,
      layerMoves: layerMovesRef.current,
      seamWide: hints.seamWide,
      onProblem: setProblem,
      onShown: () => syncConstruction(),
      // Signal for tests: the interaction mode the stage is in.
      onMode: (mode) => {
        if (hostRef.current) hostRef.current.dataset.interaction = mode
      },
    })
    playRef.current = play
    return () => {
      playRef.current = null
      play.dispose()
    }
  }, [stage, main, turns.epoch, puzzleSize, palette, hints.seamWide])

  // The lock switches the stage between play and view mode; the state shown stays.
  useEffect(() => {
    if (main) document.cookie = preferenceCookie(LAYER_MOVES_COOKIE, layerMoves)
    playRef.current?.setLayerMoves(layerMoves)
  }, [main, layerMoves])

  useEffect(() => {
    if (!main) return
    document.cookie = preferenceCookie(STICKERLESS_COOKIE, stickerless)
    stickerlessRef.current = stickerless
    syncConstruction()
  }, [stage, main, stickerless])

  useEffect(() => {
    if (!main) return
    document.cookie = preferenceCookie(AUTO_ROTATE_COOKIE, autoRotate)
    if (!stage) return
    stage.stage.setAutoRotate(autoRotate)
    // Signal for tests: whether the stage spins.
    if (hostRef.current)
      hostRef.current.dataset.autoRotate = String(
        stage.stage.getAutoRotate().enabled,
      )
  }, [stage, main, autoRotate])

  // Dialogs: a state shown without play.
  useEffect(() => {
    if (!stage?.child || main) return
    const child = stage.child
    let current = true
    const documents = cubeStateDocuments(puzzleSize, cube, palette)
    if (!documents.ok) {
      setProblem(documents.error.code)
      return
    }
    const { definition, state, appearance, options } = documents.value
    const opened = open(definition, state, appearance, options)
    if (!opened.ok) {
      setProblem(opened.error.code)
      return
    }
    setProblem(null)
    void child.setProjection(opened.value.projection).then((result) => {
      if (!current) return
      if (!result.ok) {
        setProblem(result.error.code)
        return
      }
      const ids = highlightedFace
        ? faceStickerIds(puzzleSize, faceName(highlightedFace))
        : undefined
      const applied = stage.stage.setStickerHighlight(child, ids)
      // Signal for tests: the face of the outlined stickers (from their IDs) and their number.
      const host = hostRef.current
      if (host)
        host.dataset.highlight =
          applied.ok && ids
            ? `${ids[0].slice(-1).toLowerCase()}:${ids.length}`
            : ''
    })
    return () => {
      current = false
    }
  }, [stage, main, cube, puzzleSize, palette, highlightedFace])

  // A view change by button or key: the stage shows it and auto-rotate pauses, as the existing view.
  const showPreset = (preset: ViewPreset) => {
    stage?.stage.setViewPreset(preset)
    stage?.stage.interact()
  }
  const handleKeyDown = (event: KeyboardEvent) => {
    const preset = keyPreset(event.key)
    if (preset) {
      showPreset(preset)
      return
    }
    const next = arrowOrientation(event.key, orientationRef.current)
    if (!next) return
    event.preventDefault()
    stage?.stage.setDisplayOrientation(next)
    stage?.stage.interact()
  }

  return (
    <div class="cube-3d-container">
      {problem && (
        <div class="cube-3d-unsupported" role="alert">
          <p>3D view unavailable: {problem}</p>
        </div>
      )}
      <div
        class="cube-3d-canvas-wrap"
        hidden={problem !== null}
        role="region"
        aria-label="3D Rubik's cube view (PuzlWerk viewer)"
        {...(main
          ? { ...hints.handlers, tabIndex: 0, onKeyDown: handleKeyDown }
          : {})}
      >
        <div ref={hostRef} class="cube-3d-puzlwerk" />
        {main && hints.wideBadge && (
          <div class="cube-3d-press-mode" role="status">
            {WIDE_BADGE_TEXT}
          </div>
        )}
        {main && hints.lockedHint && (
          <div class="cube-3d-press-mode" role="status">
            {LOCKED_HINT_TEXT}
          </div>
        )}
        {main && hints.helpVisible && (
          <div class="cube-3d-hint">{hints.helpText}</div>
        )}
      </div>
      {main && (
        <PuzlwerkToolbar
          onPreset={showPreset}
          stickerless={stickerless}
          onToggleStickerless={() => setStickerless((value) => !value)}
          autoRotate={autoRotate}
          onToggleAutoRotate={() => setAutoRotate((value) => !value)}
          layerMoves={layerMoves}
          onToggleLayerMoves={() => setLayerMoves((value) => !value)}
          cube={{
            isScrambling: turns.scrambling,
            onToggleScramble: turns.toggleScramble,
            onRandomState: turns.randomState,
            onUndo: () => void turns.undo(),
            onReset: turns.reset,
            undoDisabled: undoDisabled(turns.state.moves, turns.isTurning),
            resetDisabled: resetDisabled(turns.isInitial, turns.state.moves),
          }}
          moves={publicMoves?.(turns.state.moves) ?? turns.state.moves}
          size={puzzleSize}
        />
      )}
    </div>
  )
}

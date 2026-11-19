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
import { mountMainPlay } from './puzlwerkPlay'
import { layerMovesOn } from '../preferences'
import type { colorFrame as ColorFrame } from '../../core/view/AxisGizmo.gen'

export interface PuzlwerkCubeViewProps {
  cube: CubeState
  puzzleSize: number
  palette?: Record<string, string>
  highlightedFace?: FaceKey
  // Color frame of the cube; the axis gizmo shows the colors of its R, U and F faces.
  colorFrame?: ColorFrame
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
  main = false,
}: PuzlwerkCubeViewProps) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  // Layer moves are locked until the setting is on: the viewer then stays in its view mode.
  const layerMoves = main && layerMovesOn(document.cookie)
  const hints = usePuzlwerkHints({ size: puzzleSize, locked: !layerMoves })
  const onPlayEventRef = useRef(hints.onPlayEvent)
  onPlayEventRef.current = hints.onPlayEvent
  // The dialogs keep one child for the stage; the main view makes one per shown state (puzlwerkPlay.ts).
  const sceneRef = useRef<{ stage: CubeStage; child?: StageChild } | null>(null)
  const [stage, setStage] = useState<{
    stage: CubeStage
    child?: StageChild
  } | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const frame = frameHexes(colorFrame, palette)
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
    return mountMainPlay({
      stage: stage.stage,
      cube,
      size: puzzleSize,
      palette,
      layerMoves,
      onProblem: setProblem,
      // Signal for tests: the interaction mode the stage is in.
      onMode: (mode) => {
        if (hostRef.current) hostRef.current.dataset.interaction = mode
      },
    })
  }, [stage, main, cube, puzzleSize, palette, layerMoves])

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
        {...(main ? hints.handlers : {})}
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
    </div>
  )
}

// Spike: the capture-review 3D view on the shared PuzlWerk viewer (@puzlwerk/viewer), view only.
// Selected by `?viewer=puzlwerk` (see cubeView3DChoice.tsx); the CubeState becomes wire-v1 documents
// in @puzlwerk/viewer/bridge, so no translation lives in this app.
import { useEffect, useRef, useState } from 'preact/hooks'
import {
  createCubeStage,
  cubePresentationRadius,
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

export interface PuzlwerkCubeViewProps {
  cube: CubeState
  puzzleSize: number
  palette?: Record<string, string>
  highlightedFace?: FaceKey
}

const faceName = (face: FaceKey) =>
  face.toLowerCase() as 'u' | 'r' | 'f' | 'd' | 'l' | 'b'

export function PuzlwerkCubeView({
  cube,
  puzzleSize,
  palette = DEFAULT_STICKER_HEX,
  highlightedFace,
}: PuzlwerkCubeViewProps) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const sceneRef = useRef<{ stage: CubeStage; child: StageChild } | null>(null)
  const [stage, setStage] = useState<{
    stage: CubeStage
    child: StageChild
  } | null>(null)
  const [problem, setProblem] = useState<string | null>(null)

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
    const added = created.value.addCube({ position: [0, 0, 0] })
    if (!added.ok) {
      created.value.dispose()
      setProblem(added.error.message)
      return
    }
    const value = { stage: created.value, child: added.value }
    sceneRef.current = value
    setStage(value)
    return () => {
      sceneRef.current = null
      setStage(null)
      created.value.dispose()
    }
  }, [puzzleSize])

  useEffect(() => {
    if (!stage) return
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
    void stage.child.setProjection(opened.value.projection).then((result) => {
      if (!current) return
      if (!result.ok) {
        setProblem(result.error.code)
        return
      }
      const ids = highlightedFace
        ? faceStickerIds(puzzleSize, faceName(highlightedFace))
        : undefined
      const applied = stage.stage.setStickerHighlight(stage.child, ids)
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
  }, [stage, cube, puzzleSize, palette, highlightedFace])

  return (
    <div class="cube-3d-container">
      {problem && (
        <div class="cube-3d-unsupported" role="alert">
          <p>3D view unavailable: {problem}</p>
        </div>
      )}
      <div
        ref={hostRef}
        class="cube-3d-canvas-wrap cube-3d-puzlwerk"
        hidden={problem !== null}
        role="region"
        aria-label="3D Rubik's cube view (PuzlWerk viewer)"
      />
    </div>
  )
}

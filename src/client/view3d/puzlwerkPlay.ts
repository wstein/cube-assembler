// The main view's layers on the PuzlWerk viewer: one player and one stage child per shown state.
// The player owns its child (`dispose` disposes the scene), so a new state gets a new child. Turns
// are played in the viewer; holding them in app state is a later package.
import {
  standardLayerWidths,
  type CubeStage,
  type InteractionMode,
} from '@puzlwerk/viewer'
import { createPlayer } from '@puzlwerk/viewer/bridge'
import { cubeStateDocuments } from '@puzlwerk/viewer/bridge/cube-state'
import type { CubeState } from '../../cube/cubeAssembly'

export interface MainPlayInput {
  stage: CubeStage
  cube: CubeState
  size: number
  palette: Record<string, string>
  // Layer moves are on: the stage plays, else it only rotates the view.
  layerMoves: boolean
  onProblem: (code: string | null) => void
  onMode: (mode: InteractionMode) => void
}

// Shows the state and wires the play target; returns the cleanup.
export function mountMainPlay(input: MainPlayInput): () => void {
  const { stage, size, onProblem } = input
  let current = true
  const documents = cubeStateDocuments(size, input.cube, input.palette, {
    movePolicy: 'any',
  })
  if (!documents.ok) {
    onProblem(documents.error.code)
    return () => {}
  }
  const added = stage.addCube({ position: [0, 0, 0] })
  if (!added.ok) {
    onProblem(added.error.code)
    return () => {}
  }
  const child = added.value
  const { definition, state, appearance, options } = documents.value
  const made = createPlayer(definition, state, appearance, options, child)
  if (!made.ok) {
    child.dispose()
    onProblem(made.error.code)
    return () => {}
  }
  const player = made.value
  onProblem(null)
  void child.setProjection(player.projection()).then((result) => {
    if (!current) return
    if (!result.ok) {
      onProblem(result.error.code)
      return
    }
    const widths = standardLayerWidths(size)
    const target = stage.setPlayTarget({
      child,
      player,
      size,
      layerWidths: widths,
      halfExtent: widths.reduce((sum, width) => sum + width, 0) / 2,
    })
    if (!target.ok) {
      onProblem(target.error.code)
      return
    }
    const mode = stage.setInteractionMode(input.layerMoves ? 'play' : 'view')
    if (!mode.ok) {
      onProblem(mode.error.code)
      return
    }
    input.onMode(stage.getInteractionMode())
  })
  return () => {
    current = false
    stage.setPlayTarget(undefined)
    player.dispose()
  }
}

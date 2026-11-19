// The main view's layers on the PuzlWerk viewer: one player and one stage child per shown state.
// The player owns its child (`dispose` disposes the scene), so a new state gets a new child. Turns
// are played in the viewer; holding them in app state is a later package.
import {
  standardLayerWidths,
  type Construction,
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
  // The seam setting: a swipe that starts next to a gap turns a wide block.
  seamWide: boolean
  onProblem: (code: string | null) => void
  onMode: (mode: InteractionMode) => void
  // The state is shown: stage settings that act on a shown child (the appearance) apply here.
  onShown: () => void
}

export interface MainPlay {
  // Switches between play mode (layer moves on) and view mode (locked) without touching the state shown.
  setLayerMoves(on: boolean): void
  dispose(): void
}

const NOTHING: MainPlay = { setLayerMoves: () => {}, dispose: () => {} }

// Shows the state and wires the play target.
export function mountMainPlay(input: MainPlayInput): MainPlay {
  const { stage, size, onProblem } = input
  let current = true
  let ready = false
  let wanted = input.layerMoves
  const documents = cubeStateDocuments(size, input.cube, input.palette, {
    movePolicy: 'any',
  })
  if (!documents.ok) {
    onProblem(documents.error.code)
    return NOTHING
  }
  const added = stage.addCube({ position: [0, 0, 0] })
  if (!added.ok) {
    onProblem(added.error.code)
    return NOTHING
  }
  const child = added.value
  const { definition, state, appearance, options } = documents.value
  const made = createPlayer(definition, state, appearance, options, child)
  if (!made.ok) {
    child.dispose()
    onProblem(made.error.code)
    return NOTHING
  }
  const player = made.value
  const applyMode = () => {
    const mode = stage.setInteractionMode(wanted ? 'play' : 'view')
    if (!mode.ok) {
      onProblem(mode.error.code)
      return
    }
    input.onMode(stage.getInteractionMode())
  }
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
      ...(input.seamWide ? { seamWide: true as const } : {}),
    })
    if (!target.ok) {
      onProblem(target.error.code)
      return
    }
    ready = true
    applyMode()
    input.onShown()
  })
  return {
    setLayerMoves(on) {
      wanted = on
      if (current && ready) applyMode()
    },
    dispose() {
      current = false
      stage.setPlayTarget(undefined)
      player.dispose()
    },
  }
}

const nextFrame = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

// Sets the construction the caller wants now (`wanted` is read again on every attempt, so the last
// request wins). The stage answers `Busy` while it loads or applies a state; the call tries again on
// the next frame, at most `attempts` times. Resolves with the construction the stage committed.
export async function applyConstruction(
  stage: CubeStage,
  wanted: () => Construction,
  attempts = 120,
): Promise<Construction> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const result = await stage.setAppearance({
      ...stage.getAppearance(),
      construction: wanted(),
    })
    if (result.ok || result.error.code !== 'Busy') break
    await nextFrame()
  }
  return stage.getAppearance().construction
}

// The state the main 3D view on the PuzlWerk viewer holds for the app: the cube, its move list and the
// color frame, as pure functions. The viewer plays the layers; the app records each finished turn here
// (a gesture, Undo or a scramble step), so the same turn updates the cube the way `useCubeTurns.ts` does for
// the existing view. `test/puzlwerkMainState.test.ts` checks that this state equals the wire state the viewer
// bridge reads back. It imports the bridge's turn mapping, so only the PuzlWerk view's chunk loads it.
import { moveToCubeTurn } from '@puzlwerk/viewer/bridge/cube-state'
import {
  advanceColorFrame,
  initialColorFrame,
  type colorFrame as ColorFrame,
} from '../../core/view/AxisGizmo.gen'
import { isInitialCube } from '../../core/view/TurnAnimation.gen'
import type { CubeState } from '../../cube/cubeAssembly'
import {
  applyCubeLayerMove,
  generateScrambleMoves,
  recordTurn,
  type CubeTurn,
} from './cubeView3DState'
import { randomCube } from '../../cube/randomState'

export interface MainTurnState {
  cube: CubeState
  moves: CubeTurn[]
  frame: ColorFrame
}

export const startTurnState = (
  cube: CubeState,
  moves: CubeTurn[],
  frame: ColorFrame | undefined,
  size: number,
): MainTurnState => ({
  cube,
  moves,
  frame: frame ?? initialColorFrame(cube, size),
})

const turned = (
  state: MainTurnState,
  size: number,
  turn: CubeTurn,
): Pick<MainTurnState, 'cube' | 'frame'> => ({
  cube: applyCubeLayerMove(
    state.cube,
    size,
    turn.face,
    turn.depth,
    turn.turns,
    turn.width ?? 1,
  ),
  frame: advanceColorFrame(
    state.frame,
    size,
    turn.face,
    turn.depth,
    turn.turns,
    turn.width ?? 1,
  ),
})

// A finished turn: the cube turned, the turn recorded as its shortest form in the history.
export const afterTurn = (
  state: MainTurnState,
  size: number,
  turn: CubeTurn,
): MainTurnState => ({
  ...turned(state, size, turn),
  moves: recordTurn(state.moves, turn),
})

// The turn that takes the last move back, if there is one.
export const undoTurn = (state: MainTurnState): CubeTurn | undefined => {
  const last = state.moves.at(-1)
  return last && { ...last, turns: -last.turns }
}

// An undo removes the last move instead of recording the inverse turn.
export const afterUndo = (
  state: MainTurnState,
  size: number,
): MainTurnState => {
  const inverse = undoTurn(state)
  return inverse
    ? { ...turned(state, size, inverse), moves: state.moves.slice(0, -1) }
    : state
}

// Back to the source cube with no history.
export const afterReset = (source: CubeState, size: number): MainTurnState =>
  startTurnState(source, [], undefined, size)

// Another cube with no history: its frame is that of a solved cube turned into it.
export const afterShownCube = (cube: CubeState, size: number): MainTurnState =>
  startTurnState(cube, [], undefined, size)

export const isInitialState = (
  state: MainTurnState,
  source: CubeState,
): boolean => isInitialCube(state.cube, source)

// A random valid cube; `random` returns numbers in [0, 1).
export const randomShownCube = (
  size: number,
  random: () => number = Math.random,
): CubeState => randomCube(size, Math.floor(random() * 0x7fffffff))

// The turns of a scramble for the cube size and the scramble settings.
export const scrambleTurns = (
  size: number,
  options: Parameters<typeof generateScrambleMoves>[1],
  random: () => number = Math.random,
): CubeTurn[] => generateScrambleMoves(size, options, random)

// The app turn of a played gesture: the layers its `turn-begin` selected and the quarter turns its
// `turn-end` committed. Nothing for a selection that is no contiguous run of layers.
export const committedTurn = (
  size: number,
  selected: { axis: 'X' | 'Y' | 'Z'; layers: readonly number[] },
  turns: -1 | 1 | 2,
): CubeTurn | undefined => {
  const mapped = moveToCubeTurn(size, { ...selected, turns })
  return mapped.ok ? mapped.value : undefined
}

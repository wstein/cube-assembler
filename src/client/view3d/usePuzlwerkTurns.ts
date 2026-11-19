// The cube, its move list and the CUBE group actions of the main 3D view on the PuzlWerk viewer. The
// viewer plays the layers; this hook records each finished turn (puzlwerkMainState.ts) and reports the
// state to the app like the existing view's `useCubeTurns.ts`: `onTurnStateChange(cube, moves, frame)`.
import { useEffect, useRef, useState } from 'preact/hooks'
import type { PlayEvent } from '@puzlwerk/viewer'
import type { colorFrame as ColorFrame } from '../../core/view/AxisGizmo.gen'
import type { CubeState } from '../../cube/cubeAssembly'
import { readScrambleOptions, readTurnFeel } from '../preferences'
import type { CubeTurn } from './cubeView3DState'
import {
  afterReset,
  afterShownCube,
  afterTurn,
  afterUndo,
  committedTurn,
  isInitialState,
  randomShownCube,
  scrambleTurns,
  startTurnState,
  undoTurn,
  type MainTurnState,
} from './puzlwerkMainState'
import type { MainPlay } from './puzlwerkPlay'
import { scrambleDuration } from './turnFeel'

export interface PuzlwerkTurnsOptions {
  size: number
  // The cube Reset returns to. A new one starts over, as in the existing view.
  source: CubeState
  // The state shown at first; the source, no moves and its frame when left out.
  start?: CubeState
  moves?: CubeTurn[]
  frame?: ColorFrame
  onTurnStateChange?: (
    cube: CubeState,
    moves: CubeTurn[],
    frame: ColorFrame,
  ) => void
  // The player to turn on (scramble steps, undo); set by the view once the state is shown.
  playRef: { current: MainPlay | null }
}

export function usePuzlwerkTurns({
  size,
  source,
  start,
  moves,
  frame,
  onTurnStateChange,
  playRef,
}: PuzlwerkTurnsOptions) {
  const [state, setState] = useState<MainTurnState>(() =>
    startTurnState(start ?? source, moves ?? [], frame, size),
  )
  const stateRef = useRef(state)
  // Counts the cubes put on show that the player must be made for again (reset, random state, new source).
  const [epoch, setEpoch] = useState(0)
  const [scrambling, setScrambling] = useState(false)
  // A turn of the app plays (undo, scramble step) or a drag turns a layer.
  const [playing, setPlaying] = useState(false)
  const [dragging, setDragging] = useState(false)
  const sizeRef = useRef(size)
  sizeRef.current = size
  const sourceRef = useRef(source)
  const onChangeRef = useRef(onTurnStateChange)
  onChangeRef.current = onTurnStateChange
  const runRef = useRef<{ stopped: boolean } | null>(null)
  const inFlightRef = useRef(0)
  const beginRef = useRef<{
    axis: 'X' | 'Y' | 'Z'
    layers: readonly number[]
  } | null>(null)

  const put = (next: MainTurnState, notify: boolean) => {
    stateRef.current = next
    setState(next)
    if (notify) onChangeRef.current?.(next.cube, next.moves, next.frame)
  }
  const stopScramble = () => {
    if (runRef.current) runRef.current.stopped = true
    runRef.current = null
    setScrambling(false)
  }
  // Another cube is on show: the player is made for it again.
  const show = (next: MainTurnState, notify: boolean) => {
    stopScramble()
    beginRef.current = null
    setDragging(false)
    put(next, notify)
    setEpoch((value) => value + 1)
  }

  useEffect(() => {
    if (sourceRef.current === source) return
    sourceRef.current = source
    show(afterReset(source, sizeRef.current), false)
  }, [source])
  useEffect(() => stopScramble, [])

  const playTurn = async (turn: CubeTurn, durationMs: number) => {
    const play = playRef.current
    if (!play) return false
    inFlightRef.current += 1
    setPlaying(true)
    try {
      return await play.turn(turn, durationMs)
    } finally {
      inFlightRef.current -= 1
      if (inFlightRef.current === 0) setPlaying(false)
    }
  }

  const undo = async () => {
    const turn = undoTurn(stateRef.current)
    if (!turn || inFlightRef.current > 0 || beginRef.current) return
    if (await playTurn(turn, readTurnFeel(document.cookie).turnMs))
      put(afterUndo(stateRef.current, sizeRef.current), true)
  }

  const reset = () => show(afterReset(sourceRef.current, sizeRef.current), true)

  // A random valid cube at once; turns in progress are dropped.
  const randomState = () =>
    show(
      afterShownCube(randomShownCube(sizeRef.current), sizeRef.current),
      true,
    )

  const toggleScramble = () => {
    if (runRef.current) {
      stopScramble()
      return
    }
    const run = { stopped: false }
    runRef.current = run
    setScrambling(true)
    const turns = scrambleTurns(
      sizeRef.current,
      readScrambleOptions(document.cookie),
    )
    const durationMs = scrambleDuration(readTurnFeel(document.cookie).turnMs)
    void (async () => {
      for (const turn of turns) {
        if (run.stopped) break
        if (!(await playTurn(turn, durationMs))) break
        put(afterTurn(stateRef.current, sizeRef.current, turn), true)
      }
      if (runRef.current === run) {
        runRef.current = null
        setScrambling(false)
      }
    })()
  }

  // Stage `onPlayEvent`: a committed drag turn is a turn of the cube.
  const onPlayEvent = (event: PlayEvent) => {
    if (event.type === 'turn-begin') {
      beginRef.current = { axis: event.axis, layers: event.layers }
      setDragging(true)
    } else if (event.type === 'turn-end') {
      const begin = beginRef.current
      beginRef.current = null
      setDragging(false)
      if (begin && event.outcome === 'committed') {
        const turn = committedTurn(sizeRef.current, begin, event.turns)
        if (turn) put(afterTurn(stateRef.current, sizeRef.current, turn), true)
      }
    }
  }

  return {
    state,
    stateRef,
    epoch,
    scrambling,
    isTurning: scrambling || playing || dragging,
    isInitial: isInitialState(state, source),
    undo,
    reset,
    randomState,
    toggleScramble,
    onPlayEvent,
  }
}

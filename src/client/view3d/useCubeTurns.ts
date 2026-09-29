import { useEffect, useRef, useState } from 'preact/hooks'
import {
  dragMeshKey,
  finishTurn,
  isInitialCube as isInitialCubeOf,
  scrambleQueue,
  settleTurn,
  startTurn,
  turnFrame,
  type activeTurn as ActiveTurn,
  type queuedTurn as QueuedTurn,
} from '../../core/view/TurnAnimation.gen'
import type { CubeState, FaceKey } from '../../cube/cubeAssembly'
import type { DragTurn } from './cubeDragInteraction'
import type { buildCubeMesh } from './cubeMesh'
import { generateScrambleMoves, type CubeTurn } from './cubeView3DState'
import { readScrambleOptions, readTurnFeel, turnSoundOn } from '../preferences'
import {
  magneticDragAngle,
  playTurnClick,
  scrambleDuration,
  turnClickGain,
} from './turnFeel'

// The layers the mesh shows turned this frame, and whether the sticker
// colors must be rebuilt too.
export interface MeshUpdate {
  colors: boolean
  layer?: Parameters<typeof buildCubeMesh>[4]
}

interface CubeTurnsOptions {
  // The cube handed in; a new one starts over.
  cube: CubeState
  initialCube: CubeState
  initialMoves: CubeTurn[]
  puzzleSize: number
  onTurnStateChange?: (cube: CubeState, moves: CubeTurn[]) => void
  pauseAutoRotation: () => void
}

// The 3D view's turns: the cube and its moves, the turns waiting to play,
// the one animating now and a layer the finger drags (see
// TurnAnimation.res). advance() plays them frame by frame.
export function useCubeTurns({
  cube,
  initialCube,
  initialMoves,
  puzzleSize,
  onTurnStateChange,
  pauseAutoRotation,
}: CubeTurnsOptions) {
  const [currentCube, setCurrentCube] = useState<CubeState>(initialCube)
  const [moves, setMoves] = useState<CubeTurn[]>(initialMoves)
  const [isScrambling, setIsScrambling] = useState<boolean>(false)
  const [isTurning, setIsTurning] = useState(false)

  const currentCubeRef = useRef<CubeState>(initialCube)
  currentCubeRef.current = currentCube
  const movesRef = useRef(initialMoves)
  movesRef.current = moves
  const onTurnStateChangeRef = useRef(onTurnStateChange)
  onTurnStateChangeRef.current = onTurnStateChange
  const sourceCubeRef = useRef(cube)

  const turnQueueRef = useRef<QueuedTurn[]>([])
  const currentTurnRef = useRef<ActiveTurn | null>(null)
  const dragTurnRef = useRef<DragTurn | null>(null)
  const forceUpdateMeshRef = useRef(false)
  // Read once per view: the settings page is a page of its own.
  const [magnetic] = useState(() => readTurnFeel(document.cookie).overshoot)

  useEffect(() => {
    if (sourceCubeRef.current === cube) return
    sourceCubeRef.current = cube
    setCurrentCube(cube)
    currentCubeRef.current = cube
    movesRef.current = []
    setMoves([])
    turnQueueRef.current = []
    currentTurnRef.current = null
    dragTurnRef.current = null
    setIsScrambling(false)
    setIsTurning(false)
    forceUpdateMeshRef.current = true
  }, [cube])

  // Records a finished turn. A drag released short of a quarter turn
  // springs back silently.
  const applyTurn = (anim: ActiveTurn) => {
    const turned = finishTurn(
      currentCubeRef.current,
      puzzleSize,
      movesRef.current,
      anim,
    )
    if (!turned) return
    playTurnClick(turnClickGain(anim.duration, turnSoundOn(document.cookie)))
    currentCubeRef.current = turned.cube
    setCurrentCube(turned.cube)
    movesRef.current = turned.moves
    setMoves(turned.moves)
    onTurnStateChangeRef.current?.(turned.cube, turned.moves)
  }

  // A press while the last turn settles finishes it at once, so swipes in
  // quick succession each turn their layer instead of rotating the view.
  const finishSettlingTurn = () => {
    const anim = currentTurnRef.current
    if (!anim || turnQueueRef.current.length > 0) return
    currentTurnRef.current = null
    applyTurn(anim)
    forceUpdateMeshRef.current = true
    setIsScrambling(false)
    setIsTurning(false)
  }

  // Whether a turn plays, waits or follows the finger.
  const busy = () =>
    currentTurnRef.current !== null ||
    dragTurnRef.current !== null ||
    turnQueueRef.current.length > 0

  const triggerTurn = (
    face: FaceKey,
    turns: number,
    depth = 1,
    undo = false,
    width = 1,
  ) => {
    pauseAutoRotation()
    turnQueueRef.current.push({
      face,
      depth,
      width,
      turns,
      duration: readTurnFeel(document.cookie).turnMs,
      undo,
    })
    setIsTurning(true)
  }

  const toggleScramble = () => {
    pauseAutoRotation()
    if (isScrambling) {
      turnQueueRef.current = []
      setIsScrambling(false)
      if (!currentTurnRef.current) setIsTurning(false)
    } else {
      setIsScrambling(true)
      setIsTurning(true)
      const moves = generateScrambleMoves(
        puzzleSize,
        readScrambleOptions(document.cookie),
      )
      const duration = scrambleDuration(readTurnFeel(document.cookie).turnMs)
      turnQueueRef.current = scrambleQueue(moves, duration)
    }
  }

  const resetCube = () => {
    turnQueueRef.current = []
    currentTurnRef.current = null
    dragTurnRef.current = null
    setIsScrambling(false)
    setIsTurning(false)
    currentCubeRef.current = cube
    setCurrentCube(cube)
    movesRef.current = []
    setMoves([])
    onTurnStateChangeRef.current?.(cube, [])
    forceUpdateMeshRef.current = true
  }

  const undoLastTurn = () => {
    if (isTurning) return
    const last = movesRef.current.at(-1)
    if (last)
      triggerTurn(last.face, -last.turns, last.depth, true, last.width ?? 1)
  }

  // Hands a released drag to the turn animation, which settles the layer on
  // whole quarter turns from where the finger left it.
  const settleDrag = (turns: number, speed = 0) => {
    const drag = dragTurnRef.current
    if (!drag) return
    dragTurnRef.current = null
    const feel = readTurnFeel(document.cookie)
    turnQueueRef.current.unshift(
      settleTurn(
        drag.layer,
        // From where the magnet held it on screen, so it doesn't jump.
        feel.overshoot ? magneticDragAngle(drag.angle) : drag.angle,
        turns,
        feel.turnMs,
        speed,
      ),
    )
  }

  // One frame of turning: what the mesh must show, or null when it is
  // unchanged. Queued turns wait until the finger lets go of a layer; with
  // the magnetic snap each quarter turn holds a dragged layer like a magnet.
  const advance = (time: number): MeshUpdate | null => {
    if (forceUpdateMeshRef.current) {
      forceUpdateMeshRef.current = false
      return { colors: true }
    }
    const anim = currentTurnRef.current
    if (anim) {
      const { angle, finished } = turnFrame(anim, time)
      if (!finished)
        return {
          colors: false,
          layer: {
            face: anim.face,
            depth: anim.depth,
            width: anim.width,
            angle,
          },
        }
      applyTurn(anim)
      if (turnQueueRef.current.length > 0) {
        const next = turnQueueRef.current.shift()!
        currentTurnRef.current = startTurn(
          next,
          time,
          readTurnFeel(document.cookie).overshoot,
          90,
        )
      } else {
        currentTurnRef.current = null
        setIsScrambling(false)
        setIsTurning(false)
      }
      return { colors: true }
    }
    const drag = dragTurnRef.current
    if (drag) {
      const angle = magnetic ? magneticDragAngle(drag.angle) : drag.angle
      const shown = dragMeshKey(drag.layer, angle, drag.highlight === true)
      if (drag.drawn === shown) return null
      drag.drawn = shown
      return {
        colors: true,
        layer: {
          face: drag.layer.face,
          depth: drag.layer.depth,
          width: drag.layer.width,
          angle,
          highlight: drag.highlight,
        },
      }
    }
    if (turnQueueRef.current.length > 0) {
      const next = turnQueueRef.current.shift()!
      currentTurnRef.current = startTurn(
        next,
        time,
        readTurnFeel(document.cookie).overshoot,
        160,
      )
    }
    return null
  }

  return {
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
    isInitialCube: isInitialCubeOf(currentCube, cube),
    advance,
  }
}

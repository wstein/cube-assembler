import type { RefObject } from 'preact'
import { pickBlockStep } from '../core/view/BlockPick.gen'
import {
  swipeLayerAngle,
  type CubeGesture,
  type CubeGestureCamera,
  type CubeSurfaceHit,
  type GestureAxis,
  type PressLevel,
  type SwipeLayer,
  type SwipeTuning,
} from './cubeGesture'
import type { Point } from './cubeView3DState'

export interface DragTurn {
  layer: SwipeLayer
  angle: number
  velocity: number
  time: number
  // Lights up the grabbed layers of a block or whole-cube turn.
  highlight?: boolean
  // What the mesh last showed, so it is rebuilt only when that changes.
  drawn: string | null
}
export interface CubePointerGesture {
  x: number
  y: number
  hit: CubeSurfaceHit | null
  mode: CubeGesture
  pointerType: string
  // What a held sticker turns: its layer, a block of layers, the cube.
  level: PressLevel
  holdTimer?: ReturnType<typeof setTimeout>
  // A block being picked: the layers from `from` to `to` along `axis`,
  // and where the finger was when it last moved across them.
  block?: { axis: GestureAxis; from: number; to: number; anchor: Point }
  // Read once when the gesture starts so settings stay stable during a swipe.
  tuning: SwipeTuning
  // Where the turn's angle is measured from once dragging turns layers.
  turnHit?: CubeSurfaceHit
  turnFrom?: Point
}

interface BlockInteractionOptions {
  puzzleSize: number
  dragTurnRef: RefObject<DragTurn | null>
  clearHold: () => void
  setIsTurning: (turning: boolean) => void
}

export function createBlockInteraction({
  puzzleSize,
  dragTurnRef,
  clearHold,
  setIsTurning,
}: BlockInteractionOptions) {
  // From here the layers follow the finger until release.
  const startDragTurn = (
    gesture: CubePointerGesture,
    layer: SwipeLayer,
    from: Point,
    hit: CubeSurfaceHit,
    e: PointerEvent,
    camera: CubeGestureCamera,
  ) => {
    clearHold()
    gesture.mode = 'turn'
    gesture.turnHit = hit
    gesture.turnFrom = from
    dragTurnRef.current = {
      layer,
      angle: swipeLayerAngle(
        hit,
        layer,
        e.clientX - from[0],
        e.clientY - from[1],
        camera,
      ),
      velocity: 0,
      time: e.timeStamp,
      highlight: gesture.level !== 'layer',
      drawn: null,
    }
    setIsTurning(true)
  }

  // Picking a block (see pickBlockStep): the first clear move across layers
  // chooses the axis, later moves stretch the block to the layer under the
  // finger, and a move the other way starts turning it.
  const pickBlock = (
    gesture: CubePointerGesture,
    hit: CubeSurfaceHit,
    e: PointerEvent,
    rect: DOMRect,
    camera: CubeGestureCamera,
  ) => {
    const step = pickBlockStep(
      gesture.block,
      hit,
      [e.clientX, e.clientY],
      [gesture.x, gesture.y],
      [rect.left, rect.top],
      camera,
      gesture.tuning.startPx,
      puzzleSize,
    )
    if (step === 'none') return
    if (step.kind === 'turn') {
      startDragTurn(
        gesture,
        step.layer as SwipeLayer,
        step.from,
        step.hit as CubeSurfaceHit,
        e,
        camera,
      )
      return
    }
    gesture.block = step.block as CubePointerGesture['block']
    // The picked layers light up until they start turning.
    dragTurnRef.current = {
      layer: step.layer as SwipeLayer,
      angle: 0,
      velocity: 0,
      time: e.timeStamp,
      highlight: true,
      drawn: dragTurnRef.current?.drawn ?? null,
    }
    setIsTurning(true)
  }

  return { startDragTurn, pickBlock }
}

import type { RefObject } from 'preact'
import {
  blockLayer,
  facePlanePoint,
  layerIndex,
  pickSwipeLayer,
  swipeLayerAngle,
  swipeMoveAxis,
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

  // Picking a block: the first clear move across layers chooses the axis,
  // later moves stretch the block to the layer under the finger, and a move
  // the other way starts turning it.
  const pickBlock = (
    gesture: CubePointerGesture,
    hit: CubeSurfaceHit,
    e: PointerEvent,
    rect: DOMRect,
    camera: CubeGestureCamera,
  ) => {
    const here: Point = [e.clientX, e.clientY]
    const onPlane = (point: Point) =>
      facePlanePoint(point[0] - rect.left, point[1] - rect.top, camera, hit)
    let block = gesture.block
    if (!block) {
      const axis = swipeMoveAxis(
        hit,
        e.clientX - gesture.x,
        e.clientY - gesture.y,
        camera,
        gesture.tuning.startPx,
      )
      if (axis === null) return
      const start = layerIndex(hit.point[axis], puzzleSize)
      block = { axis, from: start, to: start, anchor: here }
      gesture.block = block
    } else {
      const anchorPoint = onPlane(block.anchor)
      if (anchorPoint) {
        const anchorHit = { ...hit, point: anchorPoint }
        const move = pickSwipeLayer(
          anchorHit,
          e.clientX - block.anchor[0],
          e.clientY - block.anchor[1],
          camera,
          gesture.tuning.startPx,
        )
        if (move?.axis === block.axis) {
          startDragTurn(
            gesture,
            blockLayer(block.axis, block.from, block.to, puzzleSize),
            block.anchor,
            anchorHit,
            e,
            camera,
          )
          return
        }
        if (move) block.anchor = here
      }
    }
    const point = onPlane(here)
    if (point) block.to = layerIndex(point[block.axis], puzzleSize)
    // The picked layers light up until they start turning.
    dragTurnRef.current = {
      layer: blockLayer(block.axis, block.from, block.to, puzzleSize),
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

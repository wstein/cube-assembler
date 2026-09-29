import { useEffect, useRef, useState } from 'preact/hooks'
import { clampPitch, viewTurn } from '../../core/view/TurnAnimation.gen'
import type { CubeGestureCamera } from './cubeGesture'
import {
  AUTO_ROTATE_RADIANS_PER_MS,
  AUTO_ROTATE_RESUME_DELAY_MS,
  ISOMETRIC_PITCH,
  ISOMETRIC_YAW,
  getDefaultZoom,
} from './cubeView3DState'
import { stepDragInertia } from './dragInertia'
import {
  AUTO_ROTATE_COOKIE,
  preferenceCookie,
  readPreference,
} from '../preferences'

// How the 3D view looks at the cube: pitch, yaw and zoom, the spin a drag
// leaves behind, and auto-rotate, which pauses while the cube is handled.
export function useCubeCamera(puzzleSize: number) {
  const [pitch, setPitch] = useState<number>(ISOMETRIC_PITCH)
  const [yaw, setYaw] = useState<number>(ISOMETRIC_YAW)
  const [zoom, setZoom] = useState<number>(getDefaultZoom(puzzleSize))
  const [isRotating, setIsRotating] = useState<boolean>(() =>
    readPreference(document.cookie, AUTO_ROTATE_COOKIE),
  )
  useEffect(() => {
    document.cookie = preferenceCookie(AUTO_ROTATE_COOKIE, isRotating)
  }, [isRotating])

  const isDraggingRef = useRef(false)
  const resumeAutoAtRef = useRef(0)
  const lastPointerRef = useRef({ x: 0, y: 0, time: 0 })
  const inertiaRef = useRef({ yaw: 0, pitch: 0 })

  // Keep state accessible to render loop
  const stateRef = useRef({ pitch, yaw, zoom, isRotating })
  stateRef.current = { pitch, yaw, zoom, isRotating }

  // Auto-scale zoom when puzzleSize changes
  useEffect(() => {
    setZoom(getDefaultZoom(puzzleSize))
  }, [puzzleSize])

  const pauseAutoRotation = () => {
    inertiaRef.current = { yaw: 0, pitch: 0 }
    resumeAutoAtRef.current = performance.now() + AUTO_ROTATE_RESUME_DELAY_MS
  }

  const rotateView = (dx: number, dy: number, timeStamp: number) => {
    const elapsed = Math.max(timeStamp - lastPointerRef.current.time, 8)
    lastPointerRef.current = {
      x: lastPointerRef.current.x + dx,
      y: lastPointerRef.current.y + dy,
      time: timeStamp,
    }
    const turn = viewTurn(dx, dy, elapsed)
    inertiaRef.current = { yaw: turn.yawVelocity, pitch: turn.pitchVelocity }
    setYaw((prev) => prev + turn.yaw)
    setPitch((prev) => clampPitch(prev + turn.pitch))
  }

  // One frame: the drag's spin slows down, then auto-rotate takes over.
  const stepCamera = (time: number, elapsed: number) => {
    if (!isDraggingRef.current) {
      const yawStep = stepDragInertia(inertiaRef.current.yaw, elapsed)
      const pitchStep = stepDragInertia(inertiaRef.current.pitch, elapsed)
      inertiaRef.current = {
        yaw: yawStep.velocity,
        pitch: pitchStep.velocity,
      }
      if (yawStep.delta) setYaw((prev) => prev + yawStep.delta)
      if (pitchStep.delta) {
        setPitch((prev) => clampPitch(prev + pitchStep.delta))
      }
    }
    if (
      stateRef.current.isRotating &&
      !isDraggingRef.current &&
      time >= resumeAutoAtRef.current &&
      inertiaRef.current.yaw === 0 &&
      inertiaRef.current.pitch === 0
    ) {
      setYaw((prev) => prev + elapsed * AUTO_ROTATE_RADIANS_PER_MS)
    }
  }

  const isCameraIdle = (time: number) =>
    !isDraggingRef.current &&
    inertiaRef.current.yaw === 0 &&
    inertiaRef.current.pitch === 0 &&
    (!stateRef.current.isRotating || time < resumeAutoAtRef.current)

  const gestureCamera = (rect: DOMRect): CubeGestureCamera => ({
    width: rect.width,
    height: rect.height,
    zoom: stateRef.current.zoom,
    pitch: stateRef.current.pitch,
    yaw: stateRef.current.yaw,
    size: puzzleSize,
  })

  const toggleAutoRotate = () => {
    inertiaRef.current = { yaw: 0, pitch: 0 }
    resumeAutoAtRef.current = 0
    setIsRotating((value) => !value)
  }

  return {
    pitch,
    setPitch,
    yaw,
    setYaw,
    zoom,
    setZoom,
    isRotating,
    stateRef,
    isDraggingRef,
    resumeAutoAtRef,
    lastPointerRef,
    inertiaRef,
    pauseAutoRotation,
    rotateView,
    stepCamera,
    isCameraIdle,
    gestureCamera,
    toggleAutoRotate,
  }
}

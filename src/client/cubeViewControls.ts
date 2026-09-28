import { clampZoom, wheelGesture } from './cubeGesture'
import {
  getDefaultZoom,
  ISOMETRIC_PITCH,
  ISOMETRIC_YAW,
} from './cubeView3DState'

type SetNumber = (value: number | ((previous: number) => number)) => void

interface CubeViewControlsOptions {
  puzzleSize: number
  pauseAutoRotation: () => void
  setPitch: SetNumber
  setYaw: SetNumber
  setZoom: SetNumber
  rotateView: (dx: number, dy: number, time: number) => void
}

export function createCubeViewControls({
  puzzleSize,
  pauseAutoRotation,
  setPitch,
  setYaw,
  setZoom,
  rotateView,
}: CubeViewControlsOptions) {
  // The isometric view, from the front corner or the opposite back one.
  const resetView = (back = false) => {
    pauseAutoRotation()
    setPitch(back ? -ISOMETRIC_PITCH : ISOMETRIC_PITCH)
    setYaw(ISOMETRIC_YAW + (back ? Math.PI : 0))
    setZoom(getDefaultZoom(puzzleSize))
  }

  // Preset face views
  const setPreset = (targetPitch: number, targetYaw: number) => {
    pauseAutoRotation()
    setPitch(targetPitch)
    setYaw(targetYaw)
  }

  const handleWheel = (e: WheelEvent) => {
    e.preventDefault()
    if (wheelGesture(e) === 'tilt') {
      // Touchpads already coast their swipes, so add no inertia of our own.
      rotateView(-e.deltaX, -e.deltaY, e.timeStamp)
      pauseAutoRotation()
      return
    }
    // Pinch steps are small; mouse wheel notches are about 100.
    const zoomDelta = e.deltaY * (e.ctrlKey ? 0.05 : 0.01)
    setZoom((prev) => clampZoom(prev + zoomDelta, puzzleSize))
  }

  const limit = Math.PI / 2 - 0.05
  const step = 0.2

  const tiltUp = () => {
    pauseAutoRotation()
    setPitch((p) => Math.min(limit, p + step))
  }
  const tiltDown = () => {
    pauseAutoRotation()
    setPitch((p) => Math.max(-limit, p - step))
  }
  const rotateLeft = () => {
    pauseAutoRotation()
    setYaw((y) => y + step)
  }
  const rotateRight = () => {
    pauseAutoRotation()
    setYaw((y) => y - step)
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault()
        tiltUp()
        break
      case 'ArrowDown':
        e.preventDefault()
        tiltDown()
        break
      case 'ArrowLeft':
        e.preventDefault()
        rotateLeft()
        break
      case 'ArrowRight':
        e.preventDefault()
        rotateRight()
        break
      case 'u':
      case 'U':
        setPreset(Math.PI / 2 - 0.05, 0)
        break
      case 'd':
      case 'D':
        setPreset(-Math.PI / 2 + 0.05, 0)
        break
      case 'f':
      case 'F':
        setPreset(0, 0)
        break
      case 'b':
      case 'B':
        setPreset(0, Math.PI)
        break
      case 'l':
      case 'L':
        setPreset(0, Math.PI / 2)
        break
      case 'r':
      case 'R':
        setPreset(0, -Math.PI / 2)
        break
    }
  }

  return { resetView, setPreset, handleWheel, handleKeyDown }
}

import { wheelGesture } from './cubeGesture'
import {
  facePreset,
  getDefaultZoom,
  isometricAngles,
  rotateYaw,
  tiltPitch,
  wheelZoom,
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
    const { pitch, yaw } = isometricAngles(back)
    setPitch(pitch)
    setYaw(yaw)
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
    setZoom((prev) => wheelZoom(prev, e.deltaY, e.ctrlKey, puzzleSize))
  }

  const tiltUp = () => {
    pauseAutoRotation()
    setPitch((p) => tiltPitch(p, true))
  }
  const tiltDown = () => {
    pauseAutoRotation()
    setPitch((p) => tiltPitch(p, false))
  }
  const rotateLeft = () => {
    pauseAutoRotation()
    setYaw((y) => rotateYaw(y, true))
  }
  const rotateRight = () => {
    pauseAutoRotation()
    setYaw((y) => rotateYaw(y, false))
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
      default: {
        const face = e.key.toLowerCase()
        if (
          face === 'u' ||
          face === 'd' ||
          face === 'f' ||
          face === 'b' ||
          face === 'l' ||
          face === 'r'
        ) {
          const { pitch, yaw } = facePreset(face)
          setPreset(pitch, yaw)
        }
      }
    }
  }

  return { resetView, setPreset, handleWheel, handleKeyDown }
}

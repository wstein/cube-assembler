// Controls beside the stage of the main 3D view on the PuzlWerk viewer: the FACES presets, the
// keyboard shortcuts and the button labels of the existing view (`cubeView3DPresentation.tsx`,
// `cubeViewControls.ts`), as pure data and functions. Only type imports of the viewer here.
import type { ViewPreset } from '@puzlwerk/viewer'
import { rotateYaw, tiltPitch } from './cubeView3DState'
import { eulerPitchYaw } from './puzlwerkOrientation'

// The FACES buttons in the order, labels and titles of the existing toolbar.
export const FACE_BUTTONS: readonly {
  preset: ViewPreset
  label: string
  title: string
}[] = [
  { preset: 'up', label: 'Up (U)', title: 'Up face' },
  { preset: 'right', label: 'Right (R)', title: 'Right face' },
  { preset: 'front', label: 'Front (F)', title: 'Front face' },
  { preset: 'down', label: 'Down (D)', title: 'Down face' },
  { preset: 'left', label: 'Left (L)', title: 'Left face' },
  { preset: 'back', label: 'Back (B)', title: 'Back face' },
  { preset: 'isometric', label: 'Isometric', title: 'Reset to Isometric view' },
  {
    preset: 'iso-back',
    label: 'Iso-back',
    title: 'Isometric view from behind',
  },
]

export const stickerlessLabel = (stickerless: boolean) =>
  stickerless ? 'Stickerless' : 'Stickered'

export const autoRotateLabel = (rotating: boolean) =>
  rotating ? 'Pause' : 'Auto-rotate'

const KEY_PRESETS: Record<string, ViewPreset> = {
  u: 'up',
  d: 'down',
  f: 'front',
  b: 'back',
  l: 'left',
  r: 'right',
}

// A letter key shows that face, as in the existing view; Shift and the other keys do not change that.
export const keyPreset = (key: string): ViewPreset | undefined =>
  KEY_PRESETS[key.toLowerCase()]

// Pitch and yaw of a display orientation (x, y, z, w) of the form Rx(pitch) * Ry(yaw), which the stage
// keeps outside free mode.
export const pitchYawOf = (
  q: readonly [number, number, number, number],
): { pitch: number; yaw: number } => {
  const [x, y, z, w] = q
  return {
    pitch: Math.atan2(2 * (y * z + x * w), 1 - 2 * (x * x + z * z)),
    yaw: Math.atan2(2 * (x * z + y * w), 1 - 2 * (y * y + z * z)),
  }
}

// An arrow key tilts by 0.2 rad (not past the poles) or turns by 0.2 rad, like the existing view.
export const arrowOrientation = (
  key: string,
  q: readonly [number, number, number, number],
): [number, number, number, number] | undefined => {
  const { pitch, yaw } = pitchYawOf(q)
  switch (key) {
    case 'ArrowUp':
      return eulerPitchYaw(tiltPitch(pitch, true), yaw)
    case 'ArrowDown':
      return eulerPitchYaw(tiltPitch(pitch, false), yaw)
    case 'ArrowLeft':
      return eulerPitchYaw(pitch, rotateYaw(yaw, true))
    case 'ArrowRight':
      return eulerPitchYaw(pitch, rotateYaw(yaw, false))
    default:
      return undefined
  }
}

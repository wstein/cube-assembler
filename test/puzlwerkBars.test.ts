import { viewPresetAngles } from '@puzlwerk/viewer'
import { describe, expect, it } from 'vitest'
import {
  facePreset,
  isometricAngles,
  rotateYaw,
  tiltPitch,
} from '../src/client/view3d/cubeView3DState'
import {
  arrowOrientation,
  autoRotateLabel,
  FACE_BUTTONS,
  keyPreset,
  pitchYawOf,
  stickerlessLabel,
} from '../src/client/view3d/puzlwerkBars'
import { eulerPitchYaw } from '../src/client/view3d/puzlwerkOrientation'

describe('FACES buttons keep the labels and titles of the existing toolbar', () => {
  it('lists the eight views in order', () => {
    expect(FACE_BUTTONS.map((b) => [b.label, b.title, b.preset])).toEqual([
      ['Up (U)', 'Up face', 'up'],
      ['Right (R)', 'Right face', 'right'],
      ['Front (F)', 'Front face', 'front'],
      ['Down (D)', 'Down face', 'down'],
      ['Left (L)', 'Left face', 'left'],
      ['Back (B)', 'Back face', 'back'],
      ['Isometric', 'Reset to Isometric view', 'isometric'],
      ['Iso-back', 'Isometric view from behind', 'iso-back'],
    ])
  })

  it('shows the views of the existing view: the viewer presets equal its angles', () => {
    const faces = {
      up: 'u',
      right: 'r',
      front: 'f',
      down: 'd',
      left: 'l',
      back: 'b',
    } as const
    for (const [preset, face] of Object.entries(faces)) {
      const old = facePreset(face)
      const now = viewPresetAngles(preset as keyof typeof faces)
      expect(now.pitch).toBeCloseTo(old.pitch, 9)
      expect(now.yaw).toBeCloseTo(old.yaw, 9)
    }
    for (const [preset, back] of [
      ['isometric', false],
      ['iso-back', true],
    ] as const) {
      const old = isometricAngles(back)
      const now = viewPresetAngles(preset)
      expect(now.pitch).toBeCloseTo(old.pitch, 9)
      expect(now.yaw).toBeCloseTo(old.yaw, 9)
    }
  })

  it('labels the toggles like the existing toolbar', () => {
    expect(stickerlessLabel(true)).toBe('Stickerless')
    expect(stickerlessLabel(false)).toBe('Stickered')
    expect(autoRotateLabel(false)).toBe('Auto-rotate')
    expect(autoRotateLabel(true)).toBe('Pause')
  })
})

describe('keyboard shortcuts', () => {
  it('maps the six face letters, either case, and nothing else', () => {
    expect(keyPreset('u')).toBe('up')
    expect(keyPreset('D')).toBe('down')
    expect(keyPreset('f')).toBe('front')
    expect(keyPreset('B')).toBe('back')
    expect(keyPreset('l')).toBe('left')
    expect(keyPreset('R')).toBe('right')
    for (const key of ['x', 'i', 'Enter', ' ', 'ArrowUp', 'uu', '']) {
      expect(keyPreset(key)).toBeUndefined()
    }
  })

  it('reads pitch and yaw back from an orientation', () => {
    for (const [pitch, yaw] of [
      [0.52, -0.74],
      [0, 0],
      [-1.2, 3],
      [1.5, -2.5],
    ]) {
      const read = pitchYawOf(eulerPitchYaw(pitch, yaw))
      expect(read.pitch).toBeCloseTo(pitch, 9)
      expect(read.yaw).toBeCloseTo(yaw, 9)
    }
  })

  it('steps the view by the existing amounts with the arrow keys', () => {
    const start = eulerPitchYaw(0.3, 1)
    const check = (key: string, pitch: number, yaw: number) => {
      const next = arrowOrientation(key, start)
      expect(next).toBeDefined()
      const read = pitchYawOf(next ?? [0, 0, 0, 1])
      expect(read.pitch).toBeCloseTo(pitch, 9)
      expect(read.yaw).toBeCloseTo(yaw, 9)
    }
    check('ArrowUp', tiltPitch(0.3, true), 1)
    check('ArrowDown', tiltPitch(0.3, false), 1)
    check('ArrowLeft', 0.3, rotateYaw(1, true))
    check('ArrowRight', 0.3, rotateYaw(1, false))
    expect(arrowOrientation('a', start)).toBeUndefined()
  })

  it('stops the tilt before the poles', () => {
    const limit = Math.PI / 2 - 0.05
    const top = arrowOrientation('ArrowUp', eulerPitchYaw(limit, 0.4))
    expect(pitchYawOf(top ?? [0, 0, 0, 1]).pitch).toBeCloseTo(limit, 9)
    const bottom = arrowOrientation('ArrowDown', eulerPitchYaw(-limit, 0.4))
    expect(pitchYawOf(bottom ?? [0, 0, 0, 1]).pitch).toBeCloseTo(-limit, 9)
  })
})

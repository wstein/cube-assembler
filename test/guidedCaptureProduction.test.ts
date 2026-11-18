import { expect, it } from 'vitest'
import {
  allOrientations,
  rotateCube,
  solvedCubeFaces,
  turnFace,
} from '../src/cube/cubeGeometry'
import { standardOrientation } from '../src/cube/CubeAssembly.gen'
import {
  captureStep,
  isGuidedCapture,
  sessionView,
} from '../src/client/capture/captureFlow'
import { recordGuide as recordCurrentGuide } from '../src/client/capture/captureRecovery'
import {
  captureProtocol,
  physicalProtocol,
} from '../src/client/capture/guidedCaptureProtocol'
import { generateForProtocol } from '../src/client/capture/spatialOrientationWizard'
import type { FaceCaptureData } from '../src/client/capture/captureTypes'
import { ODD_SIZES } from './cubeSizes'
// Historical v2 observations are explicit; the current camera now records v3.
const recordV2Guide = (slot: string, mirrored: boolean, retake: boolean) => {
  const guide = recordCurrentGuide(slot, mirrored, retake)
  return (
    guide && {
      ...guide,
      protocol: retake ? guide.protocol : physicalProtocol,
      displayedArrow:
        retake || guide.step === 0 ? null : guide.step < 4 ? 270 : 0,
    }
  )
}
const slots = ['U', 'R', 'F', 'D', 'L', 'B']
for (const size of ODD_SIZES)
  for (const mirrored of [false, true]) {
    it(`routes all six physical ${size}×${size} shots through captureStep with mirror=${mirrored}`, () => {
      let initial = solvedCubeFaces(size, {
        U: 'W',
        R: 'R',
        F: 'G',
        D: 'Y',
        L: 'O',
        B: 'B',
      })
      initial = turnFace(turnFace(initial, 'R', 1), 'F', 3)
      let held = initial
      let captured: Record<string, FaceCaptureData> = {}
      let requested: string | null = 'U'
      for (let step = 0; step < 6; step++) {
        if (step > 0 && step < 4) held = rotateCube(held, 'y', 1)
        if (step === 4) held = rotateCube(held, 'x', 1)
        if (step === 5) held = rotateCube(held, 'x', 2)
        expect(requested).toBe(slots[step])
        if (step >= 2)
          expect(
            sessionView(captured, requested!, size, []).predictedCenter,
          ).toBe(held.F[Math.floor(size / 2)][Math.floor(size / 2)])
        const guide = recordV2Guide(requested!, mirrored, false)!
        const result = captureStep(
          captured,
          requested!,
          { colors: held.F, confidence: 1, captureGuide: guide },
          'camera',
          undefined,
          undefined,
          size,
          false,
          step,
        )
        expect(result.ok).toBe(true)
        if (!result.ok) throw new Error(result.message)
        expect(result.assignedFace).toBe(slots[step])
        expect(result.faces[result.assignedFace].captureGuide).toEqual(guide)
        expect(result.faces[result.assignedFace].outOfOrder).toBe(false)
        expect(result.turnCue?.step ?? null).toBe(step < 5 ? step + 1 : null)
        captured = result.faces
        requested = result.nextFace
      }
      expect(requested).toBeNull()
      expect(captureProtocol(captured, null)).toBe(physicalProtocol)
      expect(isGuidedCapture(captured, null)).toBe(true)
      const colors = Object.fromEntries(
        Object.entries(captured).map(([slot, photo]) => [slot, photo.colors]),
      )
      expect(
        generateForProtocol(colors, size, physicalProtocol).baseline!.faces,
      ).toEqual(standardOrientation(initial).faces)
    })
  }

it('keeps legacy top-first imports and explicit retakes in their original slots', () => {
  const solved = solvedCubeFaces(3, {
    U: 'W',
    R: 'R',
    F: 'G',
    D: 'Y',
    L: 'O',
    B: 'B',
  })
  const ordered = [solved.F, solved.R, solved.B, solved.L, solved.U, solved.D]
  let captured: Record<string, FaceCaptureData> = {}
  for (const [step, slot] of slots.entries()) {
    const guide = {
      ...recordV2Guide(slot, false, false)!,
      protocol: 'sides-then-top-bottom/v1',
    }
    if (step >= 2)
      expect(sessionView(captured, slot, 3, []).predictedCenter).toBe(
        ordered[step][1][1],
      )
    const result = captureStep(
      captured,
      slot,
      { colors: ordered[step], confidence: 1, captureGuide: guide },
      'camera',
      undefined,
      undefined,
      3,
      false,
      step,
    )
    if (!result.ok) throw new Error(result.message)
    expect(result.assignedFace).toBe(slot)
    captured = result.faces
  }
  const original = { ...captured }
  const retaken = captureStep(
    captured,
    'L',
    {
      colors: solved.U,
      confidence: 1,
      captureGuide: recordV2Guide('L', false, true)!,
    },
    'camera',
    undefined,
    undefined,
    3,
    false,
    10,
  )
  if (!retaken.ok) throw new Error(retaken.message)
  expect(retaken.assignedFace).toBe('L')
  expect(retaken.faces.L.captureGuide!.protocol).toBe('retake/v1')
  for (const slot of slots.filter((slot) => slot !== 'L'))
    expect(retaken.faces[slot]).toEqual(original[slot])
})

it('routes different initial physical holds without interpreting capture IDs as canonical faces', () => {
  for (const size of ODD_SIZES) {
    const solved = solvedCubeFaces(size, {
      U: 'W',
      R: 'R',
      F: 'G',
      D: 'Y',
      L: 'O',
      B: 'B',
    })
    const original = turnFace(turnFace(solved, 'R', 1), 'F', 3)
    const orientations = allOrientations(original)
    const initialPoses =
      size === 3
        ? orientations
        : [orientations[1], orientations[7], orientations[19]]
    for (const initial of initialPoses)
      for (const mirrored of [false, true]) {
        let held = initial
        let captured: Record<string, FaceCaptureData> = {}
        let requested: string | null = 'U'
        for (let step = 0; step < 6; step++) {
          if (step > 0 && step < 4) held = rotateCube(held, 'y', 1)
          if (step === 4) held = rotateCube(held, 'x', 1)
          if (step === 5) held = rotateCube(held, 'x', 2)
          expect(requested).toBe(slots[step])
          if (step >= 2)
            expect(
              sessionView(captured, requested!, size, []).predictedCenter,
            ).toBe(held.F[Math.floor(size / 2)][Math.floor(size / 2)])
          const result = captureStep(
            captured,
            requested!,
            {
              colors: held.F,
              confidence: 1,
              captureGuide: recordV2Guide(requested!, mirrored, false)!,
            },
            'camera',
            undefined,
            undefined,
            size,
            false,
            step,
          )
          if (!result.ok) throw new Error(result.message)
          expect(result.assignedFace).toBe(slots[step])
          captured = result.faces
          requested = result.nextFace
        }
        expect(captureProtocol(captured, null)).toBe(physicalProtocol)
        const colors = Object.fromEntries(
          Object.entries(captured).map(([slot, photo]) => [slot, photo.colors]),
        )
        expect(
          generateForProtocol(colors, size, physicalProtocol).baseline!.faces,
        ).toEqual(standardOrientation(original).faces)
      }
  }
})

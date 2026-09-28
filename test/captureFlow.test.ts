import { describe, expect, it } from 'vitest'
import { applyCubeMove } from '../src/client/cubeView3D'
import { createSolvedCube } from '../src/cube/cubeAssembly'
import {
  toURFFacelets,
  toWRGFacelets,
} from '../src/cube/notation/NotationOutput.gen'
import { encodeOrbit64State } from '../src/cube/notation/orbit64'
import {
  captureEvidence,
  captureWarning,
  capturedFaceMessage,
  cubeCaptureFaces,
  isGuidedCapture,
  nextTurnCue,
  parityStatus,
  parseCubeInput,
  placeFaceCapture,
  solvedCaptureFaces,
  turnCuePose,
} from '../src/client/captureFlow'
import type { FaceCaptureData } from '../src/client/captureTypes'

const grid = (size: number, color: string) =>
  Array.from({ length: size }, () => Array<string>(size).fill(color))

describe('typed and solved cubes', () => {
  it('fills every face of a solved cube with its color', () => {
    const faces = solvedCaptureFaces(2, 5)
    expect(Object.keys(faces)).toEqual(['U', 'R', 'F', 'D', 'L', 'B'])
    expect(faces.F).toEqual({
      colors: grid(2, 'G'),
      confidence: 1,
      timestamp: 5,
    })
  })

  it('splits a typed cube into face rows', () => {
    const cube = applyCubeMove(createSolvedCube(2), 2, 'R')
    const faces = cubeCaptureFaces(cube, 2, 5)
    expect(faces.U.colors).toEqual([cube.u.slice(0, 2), cube.u.slice(2, 4)])
    expect(faces.B.timestamp).toBe(5)
  })

  it('reads facelets in either notation and Orbit64 tokens', () => {
    const cube = applyCubeMove(createSolvedCube(3), 3, 'U')
    expect(parseCubeInput(toWRGFacelets(cube), 'urf')).toEqual({
      ok: true,
      cube,
      format: 'wrg',
    })
    const urf = toURFFacelets(cube)
    expect(parseCubeInput(urf, 'wrg')).toMatchObject({
      ok: true,
      format: 'urf',
    })
    const token = encodeOrbit64State(urf)
    expect(token).not.toBeNull()
    expect(parseCubeInput(` ${token} `, 'wrg')).toEqual({
      ok: true,
      cube,
      format: 'urf',
    })
  })

  it('explains input it cannot read', () => {
    const wrong = parseCubeInput('WWWW XYZ', 'wrg')
    expect(wrong.ok).toBe(false)
    if (!wrong.ok) expect(wrong.message).toContain('W, O, G, R, B, Y')
  })

  it('reports a parity failure as an invalid result', () => {
    expect(parityStatus(createSolvedCube(3), 3).valid).toBe(true)
    const broken = parityStatus(createSolvedCube(3), 4)
    expect(broken.valid).toBe(false)
  })
})

describe('guided face capture', () => {
  const reading = (color: string, size = 3) => ({
    colors: grid(size, color),
    confidence: 0.84,
    crop: { x: 10, y: 20, width: 100, height: 100, angle: 90 },
  })

  it('stores a face in the requested slot', () => {
    const placed = placeFaceCapture(
      {},
      'U',
      reading('G'),
      'camera',
      undefined,
      undefined,
      7,
    )
    expect(placed.assignedFace).toBe('U')
    expect(placed.unexpectedCenter).toBe(false)
    expect(placed.faces.U).toMatchObject({
      colors: grid(3, 'G'),
      detectedColors: grid(3, 'G'),
      source: 'camera',
      timestamp: 7,
    })
    expect(placed.faces.U.outOfOrder).toBeFalsy()
    expect(capturedFaceMessage('U', 0.84, false)).toBe(
      '✓ Side 1 captured (84% confidence)',
    )
  })

  it('remembers where the face sat for the turn cue', () => {
    expect(turnCuePose(undefined)).toBeNull()
    expect(turnCuePose(reading('G').crop)).toEqual({
      centerX: 60,
      centerY: 70,
      size: 100,
      angle: Math.PI / 2,
    })
  })

  it('cues the next turn, by way of Side 4 for the bottom', () => {
    const faces: Record<string, FaceCaptureData> = {
      D: { colors: grid(3, 'R'), confidence: 1, timestamp: 0 },
    }
    expect(nextTurnCue(faces, 'R', grid(3, 'G'))).toEqual({
      step: 1,
      startColors: grid(3, 'G'),
      viaColors: undefined,
    })
    expect(nextTurnCue(faces, 'B', grid(3, 'W'))?.viaColors).toEqual(
      grid(3, 'R'),
    )
    faces.D.outOfOrder = true
    expect(nextTurnCue(faces, 'R', grid(3, 'G'))).toBeNull()
  })

  it('counts a camera capture in order, or a fixture that recorded it, as guided', () => {
    const camera = Object.fromEntries(
      Object.entries(solvedCaptureFaces(2)).map(([face, data]) => [
        face,
        { ...data, source: 'camera' as const },
      ]),
    )
    expect(isGuidedCapture(camera, null)).toBe(true)
    expect(
      isGuidedCapture(
        { ...camera, U: { ...camera.U, outOfOrder: true } },
        null,
      ),
    ).toBe(false)
    const fixture = Object.fromEntries(
      Object.entries(camera).map(([face, data]) => [
        face,
        { ...data, source: 'fixture' as const },
      ]),
    )
    expect(isGuidedCapture(fixture, null)).toBe(false)
    expect(isGuidedCapture(fixture, 'sides-then-top-bottom/v1')).toBe(true)
  })

  it('warns about a repeated face until the warning is dismissed', () => {
    const warning = captureWarning({}, [[0, 2]], 3, [])
    expect(warning).toEqual({
      text: 'Side 3 and Side 1 have matching patterns. They may be different faces; check both photos if unsure.',
      key: 'repeat:0:2',
      retake: 2,
    })
    expect(captureWarning({}, [[0, 2]], 3, ['repeat:0:2'])).toBeNull()
  })

  it('warns about centers only when they were read confidently', () => {
    const face = (color: string, sure: number): FaceCaptureData => ({
      colors: grid(3, color),
      cellConfidences: grid(3, 'x').map((row) => row.map(() => sure)),
      confidence: 1,
      timestamp: 0,
    })
    const unsure = { U: face('G', 0.3), R: face('G', 0.3) }
    expect(captureWarning(unsure, [], 3, [])).toBeNull()
    const sure = { U: face('G', 0.9), R: face('G', 0.9) }
    expect(captureWarning(sure, [], 3, [])).toMatchObject({
      text: 'Side 1 and Side 2 show the same center - the same face photographed twice?',
      retake: 1,
    })
  })
})

describe('reviewed capture evidence', () => {
  it('measures how much of the capture was corrected by hand', () => {
    const faces = Object.fromEntries(
      Object.entries(solvedCaptureFaces(2)).map(([face, data]) => [
        face,
        { ...data, detectedColors: data.colors, source: 'camera' as const },
      ]),
    )
    faces.U = {
      ...faces.U,
      colors: [
        ['R', 'W'],
        ['W', 'W'],
      ],
    }
    const evidence = captureEvidence(faces, 2, true, {
      recalibrated: true,
      confidentFraction: 0.9,
    })
    expect(evidence).toEqual({
      reviewedValid: true,
      cameraOnly: true,
      recalibrated: true,
      confidentFraction: 0.9,
      correctedFraction: 1 / 24,
    })
    const { detectedColors: _detected, ...typed } = faces.R
    expect(
      captureEvidence({ ...faces, R: typed }, 2, true, {
        recalibrated: true,
        confidentFraction: 0.9,
      }).correctedFraction,
    ).toBe(5 / 24)
  })
})

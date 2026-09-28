import {
  checkGuidedCenters,
  placeCapturedFace,
  toCubeIR,
  type CubeState,
} from '../cube/cubeAssembly'
import {
  detectNotationFormat,
  fromURFFacelets,
  fromWRGFacelets,
} from '../cube/notation/NotationOutput.gen'
import {
  decodeOrbit64State,
  looksLikeOrbit64StateToken,
} from '../cube/notation/orbit64'
import { runFullParity, type ParityResult } from '../cube/parity'
import type { TurnCuePose } from './autoCapture'
import {
  CAPTURE_STEPS,
  FACE_DISPLAY_LABEL,
  FACE_ORDER,
  GUIDED_PROTOCOL,
  describeCenterIssue,
} from './captureSteps'
import type { FaceCaptureData, PreviewColorProfile } from './captureTypes'
import type { PaletteEvidence } from './colorProfileLearning'
import type { FaceCaptureResult, RGB } from './imageProcessing'

export function checkParity(cube: CubeState, size: number): ParityResult {
  return runFullParity(toCubeIR(cube, size))
}

// The parity check's verdict, or its error as an invalid result.
export function parityStatus(cube: CubeState, size: number): ParityResult {
  try {
    return checkParity(cube, size)
  } catch (err) {
    console.error('Parity check error:', err)
    return {
      valid: false,
      result: err instanceof Error ? err.message : 'Parity check failed',
      checks: {},
    }
  }
}

const SOLVED_COLORS: Record<string, string> = {
  U: 'W',
  R: 'R',
  F: 'G',
  D: 'Y',
  L: 'O',
  B: 'B',
}

// Captured faces for a cube that was typed or picked rather than
// photographed, fully confident.
export function cubeCaptureFaces(
  cube: CubeState,
  size: number,
  now = Date.now(),
): Record<string, FaceCaptureData> {
  return Object.fromEntries(
    Object.entries(cube).map(([face, data]: [string, string[]]) => [
      face.toUpperCase(),
      {
        colors: Array.from({ length: size }, (_, r) =>
          data.slice(r * size, r * size + size),
        ),
        confidence: 1.0,
        timestamp: now,
      },
    ]),
  )
}

export function solvedCaptureFaces(
  size: number,
  now = Date.now(),
): Record<string, FaceCaptureData> {
  return Object.fromEntries(
    FACE_ORDER.map((face) => [
      face,
      {
        colors: Array.from({ length: size }, () =>
          Array(size).fill(SOLVED_COLORS[face]),
        ),
        confidence: 1.0,
        timestamp: now,
      },
    ]),
  )
}

type NotationFormat = 'wrg' | 'urf'

// Reads typed facelets or an Orbit64 token. The format is detected from the
// text where it can be, else the selected one is used.
export function parseCubeInput(
  input: string,
  selectedFormat: NotationFormat,
):
  | { ok: true; cube: CubeState; format: NotationFormat }
  | { ok: false; message: string } {
  const trimmed = input.trim()
  const isOrbit64Token = looksLikeOrbit64StateToken(trimmed)
  const decodedToken = isOrbit64Token ? decodeOrbit64State(trimmed) : null
  const format = isOrbit64Token
    ? 'urf'
    : (detectNotationFormat(input) ?? selectedFormat)
  const cube = isOrbit64Token
    ? decodedToken && fromURFFacelets(decodedToken)
    : format === 'wrg'
      ? fromWRGFacelets(input)
      : fromURFFacelets(input)
  if (cube) return { ok: true, cube, format }
  return {
    ok: false,
    message: isOrbit64Token
      ? 'Invalid Orbit64 state token. Only canonical 2×2–7×7 state tokens are supported.'
      : format === 'wrg'
        ? 'Invalid facelets. Must be 6 space-separated blocks of equal, perfect-square length (9 for 3×3, 25 for 5×5, ...) using colors W, O, G, R, B, Y, in U R F D L B order.'
        : 'Invalid facelets. Must be 6 space-separated blocks of equal, perfect-square length (9 for 3×3, 25 for 5×5, ...) using letters U, R, F, D, L, B (the face each sticker matches when solved), in U R F D L B order.',
  }
}

export interface FaceCaptureReading {
  colors: string[][]
  confidence: number
  cellConfidences?: number[][]
  cellColors?: RGB[][]
  croppedImage?: string
  backgroundColor?: RGB | null
  frame?: FaceCaptureResult['frame']
  crop?: FaceCaptureResult['crop']
  sharpness?: number
}

// Stores a reading in the slot its center belongs to, which may not be the
// requested one on odd cubes; a face placed elsewhere is out of order.
export function placeFaceCapture(
  faces: Record<string, FaceCaptureData>,
  face: string,
  reading: FaceCaptureReading,
  source: 'camera' | 'image-file',
  cameraSettings?: Partial<MediaTrackSettings>,
  previewColorProfile?: PreviewColorProfile,
  now = Date.now(),
): {
  faces: Record<string, FaceCaptureData>
  assignedFace: string
  unexpectedCenter: boolean
} {
  const requestedIndex = FACE_ORDER.indexOf(face)
  const { index: assignedIndex, unexpectedCenter } = placeCapturedFace(
    FACE_ORDER.map((f) => faces[f]?.colors),
    requestedIndex,
    reading.colors,
  )
  const assignedFace = FACE_ORDER[assignedIndex]
  return {
    assignedFace,
    unexpectedCenter,
    faces: {
      ...faces,
      [assignedFace]: {
        colors: reading.colors,
        detectedColors: reading.colors,
        cellConfidences: reading.cellConfidences,
        cellColors: reading.cellColors,
        confidence: reading.confidence,
        croppedImage: reading.croppedImage,
        backgroundColor: reading.backgroundColor,
        frame: reading.frame,
        crop: reading.crop,
        sharpness: reading.sharpness,
        cameraSettings,
        source,
        ...(previewColorProfile && { previewColorProfile }),
        outOfOrder:
          unexpectedCenter ||
          assignedIndex !== requestedIndex ||
          faces[assignedFace]?.outOfOrder,
        timestamp: now,
      },
    },
  }
}

export function capturedFaceMessage(
  face: string,
  confidence: number,
  unexpectedCenter: boolean,
): string {
  return (
    `✓ ${FACE_DISPLAY_LABEL[face]} captured (${(confidence * 100).toFixed(0)}% confidence)` +
    (unexpectedCenter
      ? " - its center isn't the suggested one; check it in the review"
      : '')
  )
}

// Where the captured face sat in the camera frame, so the turn cue can
// tell a turned cube from one still showing the same face.
export function turnCuePose(
  crop: FaceCaptureResult['crop'] | undefined,
): TurnCuePose | null {
  return crop
    ? {
        centerX: crop.x + crop.width / 2,
        centerY: crop.y + crop.height / 2,
        size: crop.width,
        angle: ((crop.angle ?? 0) * Math.PI) / 180,
      }
    : null
}

export interface TurnCue {
  step: number
  startColors: string[][]
  viaColors?: string[][]
}

// The turn to show before the next face: none once a face landed out of
// order, since the step hint then says what to do. The bottom face comes
// by way of Side 4.
export function nextTurnCue(
  faces: Record<string, FaceCaptureData>,
  nextFace: string,
  startColors: string[][],
): TurnCue | null {
  if (FACE_ORDER.some((f) => faces[f]?.outOfOrder)) return null
  const step = FACE_ORDER.indexOf(nextFace)
  return {
    step,
    startColors,
    viaColors: step === 5 ? faces[FACE_ORDER[3]]?.colors : undefined,
  }
}

// Whether the faces followed the guided protocol: a camera capture, or an
// uploaded fixture that recorded it. Faces mixed with imported photos may
// not have, so they use the any-order search.
export function isGuidedCapture(
  faces: Record<string, FaceCaptureData>,
  uploadedProtocol: string | null,
): boolean {
  return (
    (FACE_ORDER.every((f) => faces[f]?.source === 'camera') &&
      !FACE_ORDER.some((f) => faces[f]?.outOfOrder) &&
      !checkGuidedCenters(FACE_ORDER.slice(0, 2).map((f) => faces[f]?.colors))
        .length) ||
    (FACE_ORDER.every((f) => faces[f]?.source === 'fixture') &&
      uploadedProtocol === GUIDED_PROTOCOL)
  )
}

export interface CaptureWarning {
  text: string
  key: string
  retake: number
}

// A likely capture mistake visible while capturing - only a hint, never
// blocking. A whole face matching an earlier one (any size) comes first.
// Odd-size centers (see checkGuidedCenters) are live first-pass readings
// that can confuse e.g. red and orange, so they only count when read with
// some confidence.
export function captureWarning(
  faces: Record<string, FaceCaptureData>,
  repeatedFaces: Array<[number, number]>,
  size: number,
  dismissed: string[],
): CaptureWarning | null {
  for (const [j, i] of repeatedFaces) {
    const key = `repeat:${j}:${i}`
    if (!dismissed.includes(key)) {
      return {
        text: `${CAPTURE_STEPS[i].label} and ${CAPTURE_STEPS[j].label} have matching patterns. They may be different faces; check both photos if unsure.`,
        key,
        retake: i,
      }
    }
  }
  const mid = Math.floor(size / 2)
  const sure = (i: number) =>
    (faces[FACE_ORDER[i]]?.cellConfidences?.[mid]?.[mid] ?? 0) >= 0.6
  for (const issue of checkGuidedCenters(
    FACE_ORDER.map((f) => faces[f]?.colors),
  )) {
    const involved =
      issue.kind === 'turned-twice'
        ? [issue.photo - 1, issue.photo]
        : issue.photos
    const key = JSON.stringify(issue)
    if (involved.every(sure) && !dismissed.includes(key)) {
      return {
        text: describeCenterIssue(issue),
        key,
        retake: Math.max(...involved),
      }
    }
  }
  return null
}

// How far a reviewed capture's learned colors can be trusted: a valid cube
// from camera photos, recalibrated, confidently read and barely corrected.
// A face without its detected colors counts as fully corrected.
export function captureEvidence(
  faces: Record<string, FaceCaptureData>,
  size: number,
  reviewedValid: boolean,
  palette: { recalibrated: boolean; confidentFraction: number },
): PaletteEvidence {
  const correctedCells = FACE_ORDER.reduce((count, face) => {
    const captured = faces[face]
    if (!captured?.detectedColors) return count + size * size
    return (
      count +
      captured.colors.reduce(
        (sum, row, r) =>
          sum +
          row.filter((color, c) => color !== captured.detectedColors?.[r]?.[c])
            .length,
        0,
      )
    )
  }, 0)
  return {
    reviewedValid,
    cameraOnly: FACE_ORDER.every((face) => faces[face]?.source === 'camera'),
    recalibrated: palette.recalibrated,
    confidentFraction: palette.confidentFraction,
    correctedFraction: correctedCells / (6 * size * size),
  }
}

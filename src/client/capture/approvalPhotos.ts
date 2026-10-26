import { diagnose } from '../../core/capture/CaptureDiagnosis.gen'
import { findCaptureForOrientedFace } from '../../cube/capturedFaceMatching'
import { rotateGrid } from '../../cube/cubeGeometry'
import type { FaceCaptureData } from './captureTypes'

// What the cube check shows of a captured photo: the picture, how it turns
// to sit in the net, and which stickers the saved colors changed from what
// the camera detected (in the net's orientation).
export interface ApprovalPhoto {
  slot: number
  image?: string
  turns: number
  changed: boolean[][]
}

const NO_TURNS = (n: number) =>
  Array.from({ length: n }, () => Array<boolean>(n).fill(false))

// Cells where the colors differ from the detection, turned `turns` quarter
// turns clockwise like the photo.
function changedCells(
  face: FaceCaptureData | undefined,
  turns: number,
): boolean[][] {
  if (!face?.detectedColors) return NO_TURNS(face?.colors.length ?? 0)
  const marks = face.colors.map((row, r) =>
    row.map((color, c) => (color === face.detectedColors![r][c] ? '' : 'x')),
  )
  return rotateGrid(marks, turns).map((row) => row.map((mark) => mark === 'x'))
}

// The photo behind each face of an approved arrangement, by the stickers
// that match (see findCaptureForOrientedFace).
export function netPhotos(
  captured: Record<string, FaceCaptureData>,
  order: string[],
  net: Record<string, string[][]>,
): Record<string, ApprovalPhoto | null> {
  const colors = order.map((key) => captured[key]?.colors)
  return Object.fromEntries(
    Object.entries(net).map(([face, grid]) => {
      const found = findCaptureForOrientedFace(colors, grid)
      if (!found) return [face, null]
      const data = captured[order[found.slot]]
      return [
        face,
        {
          slot: found.slot,
          image: data?.croppedImage,
          turns: found.turns,
          changed: changedCells(data, found.turns),
        },
      ]
    }),
  )
}

// The photos in the order they were taken.
export function capturePhotos(
  captured: Record<string, FaceCaptureData>,
  order: string[],
): Array<ApprovalPhoto | null> {
  return order.map((key, slot) =>
    captured[key]
      ? {
          slot,
          image: captured[key].croppedImage,
          turns: 0,
          changed: changedCells(captured[key], 0),
        }
      : null,
  )
}

// How sure the camera was of each photo (percent, in capture order) and the
// verdict on a face shot twice or a poor photo.
export function captureStats(
  captured: Record<string, FaceCaptureData>,
  order: string[],
  size: number,
) {
  const sureness = order.map((key) =>
    captured[key] ? captured[key].confidence * 100 : undefined,
  )
  const diagnosis = diagnose(
    size,
    order.map((key) => captured[key]?.cellColors),
    sureness,
  )
  const unsure = order.map((key) => {
    const cells = captured[key]?.cellConfidences?.flat()
    return cells ? cells.filter((c) => c < 0.6).length : undefined
  })
  return { sureness, unsure, diagnosis }
}

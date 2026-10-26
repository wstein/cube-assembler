import { diagnose } from '../../core/capture/CaptureDiagnosis.gen'
import { findCaptureForOrientedFace } from '../../cube/capturedFaceMatching'
import { solveFaceOrientations } from '../../cube/cubeAssembly'
import { rotateGrid } from '../../cube/cubeGeometry'
import { forcedReading } from './forcedStickers'
import { stickerMark } from './captureSteps'
import type { FaceCaptureData } from './captureTypes'

// What the cube check shows of a captured photo: the picture, how it turns
// to sit in the net, and which stickers the saved colors changed from what
// the camera detected (in the net's orientation).
export interface ApprovalPhoto {
  slot: number
  image?: string
  turns: number
  changed: boolean[][]
  // Stickers to check: the ones the equal color share forced when there are
  // enough of them to be a misread (see forcedReading), else the ones the
  // review would mark "to double-check".
  unsure: boolean[][]
}

const NO_TURNS = (n: number) =>
  Array.from({ length: n }, () => Array<boolean>(n).fill(false))

// Cells carrying `wanted` (see stickerMark), turned `turns` quarter turns
// clockwise like the photo.
function markedCells(
  face: FaceCaptureData | undefined,
  turns: number,
  wanted: 'corrected' | 'flagged',
): boolean[][] {
  if (!face) return NO_TURNS(0)
  const marks = face.colors.map((row, r) =>
    row.map((color, c) =>
      stickerMark(
        face.detectedColors?.[r]?.[c],
        color,
        face.cellConfidences?.[r]?.[c] ?? 1,
        face.cellLookalikes?.[r]?.[c],
      ) === wanted
        ? 'x'
        : '',
    ),
  )
  return rotateGrid(marks, turns).map((row) => row.map((mark) => mark === 'x'))
}

// The stickers of a face to check, turned `turns` quarter turns clockwise.
function unsureCells(
  reading: ReturnType<typeof forcedReading>,
  key: string,
  face: FaceCaptureData | undefined,
  turns: number,
): boolean[][] {
  const forced = reading.faces[key]?.forced
  return reading.warn && forced
    ? rotateGrid(
        forced.map((row) => row.map((on) => (on ? 'x' : ''))),
        turns,
      ).map((row) => row.map((mark) => mark === 'x'))
    : markedCells(face, turns, 'flagged')
}

// The photo behind each face of an approved arrangement, by the stickers
// that match (see findCaptureForOrientedFace).
export function netPhotos(
  captured: Record<string, FaceCaptureData>,
  order: string[],
  net: Record<string, string[][]>,
): Record<string, ApprovalPhoto | null> {
  const colors = order.map((key) => captured[key]?.colors)
  const reading = forcedReading(captured, order)
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
          changed: markedCells(data, found.turns, 'corrected'),
          unsure: unsureCells(reading, order[found.slot], data, found.turns),
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
  const reading = forcedReading(captured, order)
  return order.map((key, slot) =>
    captured[key]
      ? {
          slot,
          image: captured[key].croppedImage,
          turns: 0,
          changed: markedCells(captured[key], 0, 'corrected'),
          unsure: unsureCells(reading, key, captured[key], 0),
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
  paletteFar = false,
) {
  const sureness = order.map((key) =>
    captured[key] ? captured[key].confidence * 100 : undefined,
  )
  const diagnosis = diagnose(
    size,
    order.map((key) => captured[key]?.cellColors),
    sureness,
    paletteFar,
  )
  // The same stickers the color review marks "to double-check".
  const unsure = order.map((key) => {
    const face = captured[key]
    if (!face) return undefined
    let count = 0
    face.colors.forEach((row, r) =>
      row.forEach((color, c) => {
        const mark = stickerMark(
          face.detectedColors?.[r]?.[c],
          color,
          face.cellConfidences?.[r]?.[c] ?? 1,
          face.cellLookalikes?.[r]?.[c],
        )
        if (mark === 'flagged') count++
      }),
    )
    return count
  })
  return { sureness, unsure, diagnosis }
}

// The order the color review walks the faces in once they fit together, and
// what it calls them.
export const REVIEW_NET_ORDER = ['L', 'F', 'R', 'B', 'U', 'D']
export const NET_FACE_NAME: Record<string, string> = {
  L: 'Left',
  F: 'Front',
  R: 'Right',
  B: 'Back',
  U: 'Up',
  D: 'Down',
}

// The capture slot the review starts at: Left when the photos fit together,
// else the first photo.
export function reviewStartSlot(
  captured: Record<string, FaceCaptureData>,
  order: string[],
): number {
  return reviewNetLayout(captured, order)?.L.slot ?? 0
}

// Where each photo sits in the cube net (U above, L F R B in a row, D
// below) for the review's face picker: the closest arrangement of the
// photos as they are now - the review happens before the customer approves
// one, and a sticker may still be wrong. Null when the faces do not fit
// together at all, or two net places would show the same photo.
export function reviewNetLayout(
  captured: Record<string, FaceCaptureData>,
  order: string[],
): Record<string, { slot: number; colors: string[][]; turns: number }> | null {
  if (!order.every((key) => captured[key])) return null
  const solution = solveFaceOrientations(
    Object.fromEntries(order.map((key) => [key, captured[key].colors])),
  )
  const candidate = solution?.alternatives[0]
  if (!candidate) return null
  const photos = order.map((key) => captured[key].colors)
  const layout: Record<
    string,
    { slot: number; colors: string[][]; turns: number }
  > = {}
  for (const [face, colors] of Object.entries(candidate.faces)) {
    const found = findCaptureForOrientedFace(photos, colors)
    if (!found) return null
    layout[face] = { slot: found.slot, colors, turns: found.turns }
  }
  return new Set(Object.values(layout).map((place) => place.slot)).size ===
    order.length
    ? layout
    : null
}

// Grid areas (row / column) of the faces in capture order (see CaptureNet):
// Side 1-4 in a row, Top above and Bottom below Side 2.
const CAPTURE_NET_AREAS = ['2 / 1', '2 / 2', '2 / 3', '2 / 4', '1 / 2', '3 / 2']
// The cube net: U above, L F R B in a row, D below.
const CUBE_NET_AREAS: Record<string, string> = {
  U: '1 / 2',
  L: '2 / 1',
  F: '2 / 2',
  R: '2 / 3',
  B: '2 / 4',
  D: '3 / 2',
}

// One face of the mini net.
export interface MiniNetItem {
  // Net face (U, L, ...) while the photos fit together, else the capture
  // key.
  key: string
  // The photo's place in capture order.
  slot: number
  area: string
  colors: string[][]
  captured: boolean
  // Quarter turns that put the photo upright in its place.
  turns: number
  // Left, Front, ... once the photos fit together.
  name?: string
}

// The faces captured so far as a mini net: the cube net once all six fit
// together, else the capture net with empty places for what is missing.
export function miniNet(
  captured: Record<string, FaceCaptureData>,
  order: string[],
  size: number,
): MiniNetItem[] {
  const layout = reviewNetLayout(captured, order)
  if (layout)
    return Object.entries(layout).map(([face, place]) => ({
      key: face,
      slot: place.slot,
      area: CUBE_NET_AREAS[face],
      colors: place.colors,
      captured: true,
      turns: place.turns,
      name: NET_FACE_NAME[face],
    }))
  const empty = Array.from({ length: size }, () => Array<string>(size).fill(''))
  return order.map((key, slot) => ({
    key,
    slot,
    area: CAPTURE_NET_AREAS[slot],
    colors: captured[key]?.colors ?? empty,
    captured: Boolean(captured[key]),
    turns: 0,
  }))
}

// Where a photo sticker sits in the net.
export interface NetCell {
  face: string
  row: number
  col: number
}

// For every photo (by capture slot) the net cell of each of its stickers,
// row by row as photographed; null while the photos do not fit together and
// there is no net.
export function netCells(
  items: MiniNetItem[],
  size: number,
): NetCell[][] | null {
  if (items.some((item) => !item.name)) return null
  const indexes = Array.from({ length: size }, (_, r) =>
    Array.from({ length: size }, (_, c) => String(r * size + c)),
  )
  const cells: NetCell[][] = []
  for (const item of items) {
    const turned = rotateGrid(indexes, item.turns)
    const own: NetCell[] = []
    turned.forEach((row, r) =>
      row.forEach((index, c) => {
        own[Number(index)] = { face: item.key, row: r, col: c }
      }),
    )
    cells[item.slot] = own
  }
  return cells
}

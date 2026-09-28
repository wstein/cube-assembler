import type { OrientationSolution } from './cubeAssembly'

// ─────────────────────────────────────────────────────────────────────────────
// Guided capture: the 4 side faces are photographed in order while the cube
// is turned a quarter turn at a time around its vertical axis (either way,
// top row kept on top), then the top and bottom faces in either order and
// at any rotation. That leaves 2 turning directions x 2 top/bottom orders x
// 4 x 4 top/bottom rotations = 64 arrangements to check, instead of
// solveFaceOrientations' 4,096 (odd) or 122,880 (even) - and no assumption
// about which colors are on the sides or on top.
// ─────────────────────────────────────────────────────────────────────────────

export interface GuidedCapture {
  // The 4 side photos in capture order, each taken upright.
  sides: [string[][], string[][], string[][], string[][]]
  // The two remaining photos in capture order - top and bottom, either way
  // round, each at any rotation.
  caps: [string[][], string[][]]
}

// How the photos were put together for one arrangement.
export interface GuidedArrangement {
  // Which way the cube was turned between side photos: 'left' means the
  // face that was on the right came to the front next.
  turn: 'left' | 'right'
  // True if the second of the two cap photos is the top.
  capsSwapped: boolean
  // Quarter turns clockwise applied to cap photo 1 and 2.
  capRotations: [number, number]
}

export interface GuidedSolution extends OrientationSolution {
  // Parallel to `alternatives`: how each was put together.
  arrangements: GuidedArrangement[]
}

export const OPPOSITE_COLOR: Record<string, string> = {
  W: 'Y',
  Y: 'W',
  R: 'O',
  O: 'R',
  G: 'B',
  B: 'G',
}

type CenterVector = readonly [number, number, number]
const COLOR_NORMAL: Record<string, CenterVector> = {
  W: [0, 1, 0],
  Y: [0, -1, 0],
  R: [1, 0, 0],
  O: [-1, 0, 0],
  G: [0, 0, 1],
  B: [0, 0, -1],
}
const NORMAL_COLOR = Object.fromEntries(
  Object.entries(COLOR_NORMAL).map(([color, normal]) => [
    normal.join(','),
    color,
  ]),
)
const cross = (a: CenterVector, b: CenterVector): CenterVector => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]

// Capture slots 1/3, 2/4 and 5/6 are suggested opposite pairs. One
// measured center predicts its opposite. Two centers on different axes
// determine the remaining colors for the preferred clockwise path; the
// actual captures and final orientation solver may follow another path.
// Even cubes have no fixed center sticker, so their slots stay unfilled.
export function predictGuidedCenters(
  photos: Array<string[][] | undefined>,
): Array<string | null> {
  const predictions: Array<string | null> = Array(6).fill(null)
  const n = photos.find((photo) => photo)?.length
  if (n !== 3 && n !== 5 && n !== 7) return predictions
  const mid = Math.floor(n / 2)
  const centers = Array.from({ length: 6 }, (_, i) =>
    photos[i]?.length === n ? photos[i]?.[mid]?.[mid] : undefined,
  )
  const pairs = [
    [0, 2],
    [1, 3],
    [4, 5],
  ] as const
  for (const [front, back] of pairs) {
    const a = centers[front],
      b = centers[back]
    if (a && OPPOSITE_COLOR[a] && !b) predictions[back] = OPPOSITE_COLOR[a]
    if (b && OPPOSITE_COLOR[b] && !a) predictions[front] = OPPOSITE_COLOR[b]
    if (a && b && OPPOSITE_COLOR[a] !== b) return predictions
  }

  // Positive normals correspond to Side 1 (front), Side 2 (right), Top.
  const axes = pairs.map(([positive, negative]) => {
    const color =
      centers[positive] ??
      (centers[negative] ? OPPOSITE_COLOR[centers[negative]] : null)
    return color ? COLOR_NORMAL[color] : undefined
  })
  if (axes.filter(Boolean).length < 2) return predictions
  const [front, right, top] = axes
  const completed = [
    front ?? (right && top ? cross(right, top) : undefined),
    right ?? (top && front ? cross(top, front) : undefined),
    top ?? (front && right ? cross(front, right) : undefined),
  ]
  const colors = completed.map((normal) =>
    normal ? NORMAL_COLOR[normal.join(',')] : undefined,
  )
  if (colors.some((color) => !color)) return predictions
  for (let axis = 0; axis < pairs.length; axis++) {
    const [positive, negative] = pairs[axis]
    const color = colors[axis]!
    if (
      (centers[positive] && centers[positive] !== color) ||
      (centers[negative] && centers[negative] !== OPPOSITE_COLOR[color])
    )
      return predictions
    if (!centers[positive]) predictions[positive] = color
    if (!centers[negative]) predictions[negative] = OPPOSITE_COLOR[color]
  }
  return predictions
}

// The first and adjacent second photos define capture slots. If the second
// photo is opposite the first, it occupies slot 3 and slot 2 stays open.
// Once the first two adjacent centers are known, reserve a stable slot
// for each remaining center so later photos can arrive in any order.
export function captureCenterSlots(
  photos: Array<string[][] | undefined>,
): Array<string | null> {
  if (!photos[0] || !photos[1]) return predictGuidedCenters(photos)
  const n = photos[0].length
  if (![3, 5, 7].includes(n) || photos[1].length !== n)
    return Array(6).fill(null)
  const mid = Math.floor(n / 2)
  const first = photos[0][mid]?.[mid],
    second = photos[1][mid]?.[mid]
  if (
    !first ||
    !second ||
    !OPPOSITE_COLOR[first] ||
    !OPPOSITE_COLOR[second] ||
    first === second
  )
    return Array(6).fill(null)
  if (OPPOSITE_COLOR[first] === second) {
    const remaining = Object.keys(OPPOSITE_COLOR).filter(
      (color) => color !== first && color !== second,
    )
    return [first, second, ...remaining]
  }
  const suggested = predictGuidedCenters([photos[0], photos[1]])
  return [first, second, ...suggested.slice(2)]
}

// An occupied slot is an explicit retake. Otherwise, an opposite second
// odd-size face goes to slot 3; the next adjacent face fills slot 2.
// Later odd-size faces follow their center color.
// A center already present in another slot is a duplicate, not a new face.
export function captureSlotForCenter(
  photos: Array<string[][] | undefined>,
  requestedIndex: number,
  candidate: string[][],
): number | null {
  if (photos[requestedIndex]) return requestedIndex
  if (!photos[0]) return 0
  const n = candidate.length
  if (!photos[1]) {
    if ([3, 5, 7].includes(n) && photos[0].length === n) {
      const mid = Math.floor(n / 2)
      const first = photos[0][mid]?.[mid],
        center = candidate[mid]?.[mid]
      if (first && center && first === center) return null
      if (first && center && OPPOSITE_COLOR[first] === center)
        return photos[2] ? null : 2
    }
    return 1
  }
  if (![3, 5, 7].includes(n)) return requestedIndex
  const center = candidate[Math.floor(n / 2)]?.[Math.floor(n / 2)]
  const index = captureCenterSlots(photos).indexOf(center)
  return index < 0 || photos[index] ? null : index
}

// The center color only suggests a slot, it never rejects a face: one that
// fits no free slot (a misread center, or a face shown twice) stays in the
// slot being captured, flagged so assembly searches any order.
export function placeCapturedFace(
  photos: Array<string[][] | undefined>,
  requestedIndex: number,
  candidate: string[][],
): { index: number; unexpectedCenter: boolean } {
  const index = captureSlotForCenter(photos, requestedIndex, candidate)
  return index === null
    ? { index: requestedIndex, unexpectedCenter: true }
    : { index, unexpectedCenter: false }
}

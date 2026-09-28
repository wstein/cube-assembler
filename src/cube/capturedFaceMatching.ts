import type { cubeState as CubeState } from './CubeState.gen'
import { rotateGrid } from './cubeGeometry'
import { OPPOSITE_COLOR } from './guidedCaptureSetup'

// Photo positions in a guided capture: 0-3 the sides, 4-5 top/bottom.
export type GuidedCenterIssue =
  | { kind: 'same-center'; photos: [number, number] }
  | { kind: 'turned-twice'; photo: number }
  | { kind: 'not-opposite'; photos: [number, number] }

// Odd sizes only: the centers alone show several capture mistakes before
// any search - two photos of the same face, a side turned 180° instead of
// 90° (it shows the face opposite the one before it), or two photos that
// should face away from each other but don't. Empty when all is well, and
// always empty on even sizes (no fixed centers) or for missing photos.
export function checkGuidedCenters(
  photos: Array<string[][] | undefined>,
): GuidedCenterIssue[] {
  const n = photos.find(Boolean)?.length
  if (!n || n % 2 === 0) return []
  const mid = Math.floor(n / 2)
  const center = photos.map((p) => p?.[mid]?.[mid])
  const issues: GuidedCenterIssue[] = []
  for (let i = 0; i < center.length; i++) {
    for (let j = 0; j < i; j++) {
      if (center[i] && center[i] === center[j])
        issues.push({ kind: 'same-center', photos: [j, i] })
    }
  }
  if (issues.length > 0) return issues
  const opposite = (a?: string, b?: string) =>
    !!a && !!b && OPPOSITE_COLOR[a] === b
  for (let i = 1; i < 4; i++) {
    if (opposite(center[i - 1], center[i]))
      issues.push({ kind: 'turned-twice', photo: i })
  }
  for (const [a, b] of [
    [0, 2],
    [1, 3],
    [4, 5],
  ] as Array<[number, number]>) {
    if (center[a] && center[b] && !opposite(center[a], center[b]))
      issues.push({ kind: 'not-opposite', photos: [a, b] })
  }
  return issues
}

// Pairs of photos that look like the same face taken twice: at some
// rotation nearly every sticker matches. Works on every size, unlike the
// center check above. Up to ~10% of stickers may differ (at least 1 on 3x3
// and up) so a single misread doesn't hide a repeat - two genuinely
// different faces of a well-scrambled cube never come close (the most
// alike seen in simulation: 6/9 on 3x3, 9/16 on 4x4, 18/49 on 7x7). A 2x2
// needs an exact match, and still alarms falsely about once in 1,500 face
// pairs - fine for a warning that can be dismissed.
// The same face, allowing misreads: at least 75% of stickers identical at
// some turn. A 2x2 must match exactly - with 4 stickers, 3 alike happens
// between different scrambled faces too often.
const SAME_FACE_FRACTION = 0.75

function sameFaceAtSomeRotation(a: string[][], b: string[][]): boolean {
  const n = a.length
  if (b.length !== n) return false
  const needed = n === 2 ? 4 : Math.ceil(n * n * SAME_FACE_FRACTION)
  return [0, 1, 2, 3].some((turns) => {
    const rotated = rotateGrid(b, turns)
    let same = 0
    for (let r = 0; r < n; r++)
      for (let c = 0; c < n; c++) if (a[r][c] === rotated[r][c]) same++
    return same >= needed
  })
}

export interface FaceMatchSample {
  colors: string[][]
}

// Identify a face already saved in a different slot by its stickers (see
// sameFaceAtSomeRotation). A matching center alone is not enough: centers
// get misread, and a false match would keep a new face from being taken.
export function findCapturedFaceMatch(
  captures: Array<FaceMatchSample | undefined>,
  candidate: FaceMatchSample,
  excludeIndex = -1,
): number | null {
  const n = candidate.colors.length
  for (let i = 0; i < captures.length; i++) {
    const saved = captures[i]
    if (i === excludeIndex || !saved || saved.colors.length !== n) continue
    if (sameFaceAtSomeRotation(saved.colors, candidate.colors)) return i
  }
  return null
}

// An approval net is in cube orientation, whereas Check colors is in photo
// order. Find the photo behind a net face even when it was rotated in assembly.
export function findCaptureSlotForOrientedFace(
  captures: Array<string[][] | undefined>,
  face: string[][],
): number | null {
  const n = face.length
  let bestIndex: number | null = null
  let bestDistance = Infinity
  for (let i = 0; i < captures.length; i++) {
    const saved = captures[i]
    if (!saved || saved.length !== n) continue
    for (let turn = 0; turn < 4; turn++) {
      const rotated = rotateGrid(saved, turn)
      let distance = 0
      for (let r = 0; r < n; r++)
        for (let c = 0; c < n; c++) {
          if (rotated[r][c] !== face[r][c]) distance++
        }
      if (distance < bestDistance) {
        bestDistance = distance
        bestIndex = i
      }
    }
  }
  return bestIndex
}

export function findRepeatedFaces(
  photos: Array<string[][] | undefined>,
): Array<[number, number]> {
  const repeats: Array<[number, number]> = []
  for (let i = 0; i < photos.length; i++) {
    const a = photos[i]
    if (!a) continue
    for (let j = 0; j < i; j++) {
      const b = photos[j]
      if (b && sameFaceAtSomeRotation(a, b)) repeats.push([j, i])
    }
  }
  return repeats
}

export function validateFaceColors(colors: string[][], size = 3): boolean {
  if (colors.length !== size) return false

  const validColors = new Set(['W', 'Y', 'O', 'R', 'G', 'B'])

  for (const row of colors) {
    if (row.length !== size) return false
    for (const color of row) {
      if (!validColors.has(color)) return false
    }
  }

  return true
}

export function createSolvedCube(size = 3): CubeState {
  return {
    u: Array(size * size).fill('W'),
    r: Array(size * size).fill('R'),
    f: Array(size * size).fill('G'),
    d: Array(size * size).fill('Y'),
    l: Array(size * size).fill('O'),
    b: Array(size * size).fill('B'),
  }
}

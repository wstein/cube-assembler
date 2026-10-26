import { describe, expect, it } from 'vitest'
import {
  canSkipColorReview,
  readyAssemblyAfterCapture,
  type CaptureReviewFace,
} from '../src/client/capture/captureReviewRouting'

const ORDER = ['U', 'R', 'F', 'D', 'L', 'B']

// The tests adjust one face at a time.
type Face = { -readonly [K in keyof CaptureReviewFace]: CaptureReviewFace[K] }

function solvedFaces(confidence = 0.9): Record<string, Face> {
  return Object.fromEntries(
    ['W', 'R', 'G', 'Y', 'O', 'B'].map((color, index) => [
      ORDER[index],
      {
        colors: Array.from({ length: 3 }, () => Array<string>(3).fill(color)),
        detectedColors: Array.from({ length: 3 }, () =>
          Array<string>(3).fill(color),
        ),
        cellConfidences: Array.from({ length: 3 }, () =>
          Array<number>(3).fill(confidence),
        ),
        cellLookalikes: Array.from({ length: 3 }, () => Array(3).fill(null)),
        confidence,
      },
    ]),
  )
}

describe('automatic color review routing', () => {
  it('skips the color review for a valid cube and keeps it for an invalid one', () => {
    expect(canSkipColorReview(true)).toBe(true)
    expect(canSkipColorReview(false)).toBe(false)
  })

  it('continues to assembly only when the actual cube state is valid', () => {
    const solved = solvedFaces()
    expect(readyAssemblyAfterCapture(solved, ORDER)?.fullyValid).toBe(true)
    solved.B.colors[0][0] = 'W'
    solved.B.detectedColors![0][0] = 'W'
    expect(readyAssemblyAfterCapture(solved, ORDER)).toBeNull()
  })

  it('trusts people: shaky readings, corrections and lookalikes do not matter for a valid cube', () => {
    const faces = solvedFaces(0.3)
    faces.B.cellLookalikes = Array.from({ length: 3 }, () => Array(3).fill('W'))
    // A sticker the person corrected in the color review.
    faces.U.detectedColors![1][1] = 'R'
    delete faces.R.cellConfidences
    expect(readyAssemblyAfterCapture(faces, ORDER)?.fullyValid).toBe(true)
  })
})

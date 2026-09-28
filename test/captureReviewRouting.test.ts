import { describe, expect, it } from 'vitest'
import {
  canSkipColorReview,
  readyAssemblyAfterCapture,
  type CaptureReviewFace,
} from '../src/client/captureReviewRouting'

const ORDER = ['U', 'R', 'F', 'D', 'L', 'B']

// The tests adjust one face at a time.
type Face = { -readonly [K in keyof CaptureReviewFace]: CaptureReviewFace[K] }

function cleanFaces(): Record<string, Face> {
  return Object.fromEntries(
    ORDER.map((face) => [
      face,
      {
        colors: [[face]],
        detectedColors: [[face]],
        cellConfidences: [[0.9]],
        cellLookalikes: [[null]],
        confidence: 0.9,
      },
    ]),
  )
}

describe('automatic color review routing', () => {
  it('skips review for a high-confidence valid assembly', () => {
    expect(canSkipColorReview(cleanFaces(), ORDER, true, [], [])).toBe(true)
  })

  it('keeps review for an invalid assembly or any uncertain face', () => {
    expect(canSkipColorReview(cleanFaces(), ORDER, false, [], [])).toBe(false)
    const faces = cleanFaces()
    faces.B.confidence = 0.79
    expect(canSkipColorReview(faces, ORDER, true, [], [])).toBe(false)
    faces.B.confidence = 0.9
    faces.B.cellConfidences = [[0.79]]
    expect(canSkipColorReview(faces, ORDER, true, [], [])).toBe(false)
  })

  it('keeps review for missing evidence, corrected stickers, or lookalikes', () => {
    const faces = cleanFaces()
    delete faces.B.cellConfidences
    expect(canSkipColorReview(faces, ORDER, true, [], [])).toBe(false)
    faces.B.cellConfidences = [[0.9]]
    faces.B.colors = [['W']]
    expect(canSkipColorReview(faces, ORDER, true, [], [])).toBe(false)
    faces.B.colors = [['B']]
    faces.B.cellLookalikes = [['W']]
    expect(canSkipColorReview(faces, ORDER, true, [], [])).toBe(false)
  })

  it('keeps review when glare or color-mix warnings remain', () => {
    expect(canSkipColorReview(cleanFaces(), ORDER, true, ['U'], [])).toBe(false)
    expect(canSkipColorReview(cleanFaces(), ORDER, true, [], ['R/B'])).toBe(
      false,
    )
  })

  it('continues to assembly only when the actual cube state is valid', () => {
    const solved = Object.fromEntries(
      ['W', 'R', 'G', 'Y', 'O', 'B'].map((color, index) => [
        ORDER[index],
        {
          colors: Array.from({ length: 3 }, () => Array(3).fill(color)),
          detectedColors: Array.from({ length: 3 }, () => Array(3).fill(color)),
          cellConfidences: Array.from({ length: 3 }, () => Array(3).fill(0.9)),
          cellLookalikes: Array.from({ length: 3 }, () => Array(3).fill(null)),
          confidence: 0.9,
        },
      ]),
    ) as Record<string, CaptureReviewFace>
    expect(readyAssemblyAfterCapture(solved, ORDER, [], [])?.fullyValid).toBe(
      true,
    )
    solved.B.colors[0][0] = 'W'
    solved.B.detectedColors![0][0] = 'W'
    expect(readyAssemblyAfterCapture(solved, ORDER, [], [])).toBeNull()
  })
})

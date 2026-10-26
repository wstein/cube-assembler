import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  canSkipColorReview,
  planCaptureReview,
  readyAssemblyAfterCapture,
  type CaptureReviewFace,
} from '../src/client/capture/captureReviewRouting'
import { describeCenterIssue } from '../src/client/capture/captureSteps'
import {
  readFixtureAssembled,
  readFixtureColors,
} from '../src/client/fixtures/fixtureFormat'
import { orientationFreeSignature } from '../src/cube/cubeAssembly'

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

describe('uploaded fixtures keep their approved orientation', () => {
  const read = (name: string) =>
    JSON.parse(
      readFileSync(resolve('test/fixtures', name, 'meta.json'), 'utf8'),
    )

  for (const name of [
    'cube-7x7-2026-10-22T19-26-13',
    'cube-5x5-2026-10-25T23-50-58',
  ]) {
    it(`offers the saved cube of ${name} as the one to confirm`, () => {
      const meta = read(name)
      const colors = readFixtureColors(meta)!.colors
      const assembled = readFixtureAssembled(meta)!
      const plan = planCaptureReview(
        colors,
        ORDER,
        false,
        describeCenterIssue,
        undefined,
        assembled,
      )
      if (plan.kind !== 'approval') throw new Error(`got ${plan.kind}`)
      expect(plan.approval.candidates).toHaveLength(1)
      expect(orientationFreeSignature(plan.approval.candidates[0].faces)).toBe(
        orientationFreeSignature(assembled as never),
      )
    })
  }
})

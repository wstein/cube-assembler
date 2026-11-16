import { readFileSync } from 'node:fs'
import { unzipSync, strFromU8 } from 'fflate'
import { expect, it } from 'vitest'
import { readFixtureColors } from '../src/client/fixtures/fixtureFormat'
import { solveGuidedCapture } from '../src/cube/cubeAssembly'

it('never labels a reflected odd-center frame as a valid guided candidate', () => {
  const zip = unzipSync(
    readFileSync('test/fixtures/orientation-recovery-7x7.zip'),
  )
  const key = Object.keys(zip).find((k) => k.endsWith('/meta.json'))!
  const raw = readFixtureColors(JSON.parse(strFromU8(zip[key])))!.colors
  const found = solveGuidedCapture({
    sides: [raw.U, raw.R, raw.F, raw.D],
    caps: [raw.L, raw.B],
  })!
  expect(found.fullyValid).toBe(true)
  for (const candidate of found.alternatives) {
    expect(
      ['U', 'R', 'F', 'D', 'L', 'B'].map(
        (face) => candidate.faces[face as keyof typeof candidate.faces][3][3],
      ),
    ).toEqual(['W', 'R', 'G', 'Y', 'O', 'B'])
  }
})

it('does not attach a guided arrangement description to a saved free-search candidate', async () => {
  const { solveFaceOrientations, orientationFreeSignature } = await import(
    '../src/cube/cubeAssembly'
  )
  const { planCaptureReview } = await import(
    '../src/client/capture/captureReviewRouting'
  )
  const { describeCenterIssue } = await import(
    '../src/client/capture/captureSteps'
  )
  const zip = unzipSync(
    readFileSync('test/fixtures/orientation-recovery-7x7.zip'),
  )
  const meta = JSON.parse(
    strFromU8(zip[Object.keys(zip).find((k) => k.endsWith('/meta.json'))!]),
  )
  const raw = readFixtureColors(meta)!.colors
  const free = solveFaceOrientations(raw)!
  const guided = solveGuidedCapture({
    sides: [raw.U, raw.R, raw.F, raw.D],
    caps: [raw.L, raw.B],
  })!
  const outside = free.alternatives.find(
    (c) =>
      !guided.alternatives.some(
        (g) =>
          orientationFreeSignature(g.faces) ===
          orientationFreeSignature(c.faces),
      ),
  )!
  expect(outside).toBeDefined()
  const plan = planCaptureReview(
    raw,
    ['U', 'R', 'F', 'D', 'L', 'B'],
    true,
    describeCenterIssue,
    free,
    outside.faces,
  )
  if (plan.kind !== 'approval') throw new Error('Expected approval')
  expect(plan.approval.candidates[0].faces).toEqual(outside.faces)
  expect(plan.approval.arrangements).toBeUndefined()
})

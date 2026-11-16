import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { readFixtureColors } from '../src/client/fixtures/fixtureFormat'
import { captureFrame } from '../src/client/capture/captureFaceMapping'
import {
  generate,
  knownAlternatives,
} from '../src/client/capture/spatialOrientationWizard'
const raw = readFixtureColors(
  JSON.parse(
    readFileSync(
      'test/fixtures/cube-3x3-2026-09-27T09-00-11/meta.json',
      'utf8',
    ),
  ),
)!.colors
it('counts source-identity alternatives modulo all 24 global poses, excluding the current mapping', () => {
  const session = generate(raw, 3, false)
  const candidate = session.candidates[0]
  const poses = candidate.mapping.flatMap((front) =>
    candidate.mapping.flatMap((up) => {
      const frame = captureFrame(raw, candidate.mapping, front.slot, up.slot)
      return frame ? [{ ...candidate, mapping: frame.mapping }] : []
    }),
  )
  expect(poses).toHaveLength(24)
  expect(
    knownAlternatives({ ...session, candidates: poses }, candidate.mapping),
  ).toBe(0)
  const changed = candidate.mapping.map((entry, index) =>
    index === 0
      ? { ...entry, quarterTurns: (entry.quarterTurns + 1) % 4 }
      : entry,
  )
  expect(
    knownAlternatives(
      {
        ...session,
        candidates: [
          ...poses,
          { ...candidate, mapping: changed },
          { ...candidate, mapping: changed },
        ],
      },
      candidate.mapping,
    ),
  ).toBe(1)
})

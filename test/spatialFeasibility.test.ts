import { readFileSync } from 'node:fs'
import { strFromU8, unzipSync } from 'fflate'
import { expect, it } from 'vitest'
import { readFixtureColors } from '../src/client/fixtures/fixtureFormat'
import {
  rotateMapping,
  validateMapping,
} from '../src/client/capture/captureFaceMapping'
import {
  generate,
  options,
  remaining,
  type SpatialCandidate,
} from '../src/client/capture/spatialOrientationWizard'

it('excludes a known-invalid 7×7 rotation from constrained default choices while retaining positive alternatives', () => {
  const zip = unzipSync(
    readFileSync('test/fixtures/orientation-recovery-7x7.zip'),
  )
  const metadata = Object.keys(zip).find((key) => key.endsWith('/meta.json'))!
  const raw = readFixtureColors(JSON.parse(strFromU8(zip[metadata])))!.colors
  const pool = generate(raw, 7, true)
  expect(pool.candidates.length).toBeGreaterThanOrEqual(2)
  let invalid:
    | { candidate: SpatialCandidate; slot: string; quarterTurns: number }
    | undefined
  for (const candidate of pool.candidates) {
    for (const entry of candidate.mapping) {
      for (const delta of [1, 2, 3]) {
        const changed = rotateMapping(candidate.mapping, entry.slot, delta)
        if (!validateMapping(raw, changed, 7).valid) {
          invalid = {
            candidate,
            slot: entry.slot,
            quarterTurns: (entry.quarterTurns + delta) % 4,
          }
          break
        }
      }
      if (invalid) break
    }
    if (invalid) break
  }
  expect(
    invalid,
    'fixture must exercise a rotation rejected by existing checks',
  ).toBeDefined()
  const { candidate, slot, quarterTurns } = invalid!
  const selected = candidate.mapping.find((entry) => entry.slot === slot)!
  const rejected = validateMapping(
    raw,
    rotateMapping(
      candidate.mapping,
      slot,
      (quarterTurns - selected.quarterTurns + 4) % 4,
    ),
    7,
  )
  expect(rejected.valid).toBe(false)
  expect(rejected.parity).not.toBeNull()
  expect(rejected.issues.length).toBeGreaterThan(0)
  const prefix = candidate.mapping.filter((entry) => entry.slot !== slot)
  const offered = options(pool, prefix, slot)
  expect(
    offered.some(
      (choice) =>
        choice.target === selected.target &&
        choice.quarterTurns === quarterTurns,
    ),
  ).toBe(false)
  expect(
    offered.some(
      (choice) =>
        choice.target === selected.target &&
        choice.quarterTurns === selected.quarterTurns,
    ),
  ).toBe(true)
  for (const positive of pool.candidates.slice(0, 2)) {
    expect(validateMapping(raw, positive.mapping, 7).valid).toBe(true)
    expect(
      remaining(pool, positive.mapping).map((value) => value.id),
    ).toContain(positive.id)
  }
  expect(pool.issues.join(' ')).toContain('complete large-cube reachability')
})

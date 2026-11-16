import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { validateMapping } from '../src/client/capture/captureFaceMapping'
import {
  generateForProtocol,
  nextTarget,
  targetOptions,
  proposeTarget,
  presentTargetChoices,
  type SpatialSession,
} from '../src/client/capture/spatialOrientationWizard'
import type { FaceKey } from '../src/cube/cubeAssembly'
const keys = ['U', 'R', 'F', 'D', 'L', 'B'] as const
const colors = ['W', 'R', 'G', 'Y', 'O', 'B']
const captured = Object.fromEntries(
  keys.map((slot, i) => [
    slot,
    Array.from({ length: 2 }, () => [colors[i], colors[i]]),
  ]),
)
const initial = keys.map((slot) => ({ slot, target: slot, quarterTurns: 0 }))
function session(
  mappings: (typeof initial)[],
  source = captured,
): SpatialSession {
  return {
    candidates: mappings.map((mapping, index) => ({
      id: String(index),
      mapping,
      faces: validateMapping(source, mapping, 2).faces!,
      valid: validateMapping(source, mapping, 2).valid,
      issues: [],
      fullCubeValidityKnown: true,
    })),
    guided: false,
    truncated: false,
    equivalenceReduced: true,
    issues: [],
  }
}
it('asks canonical targets Front Right Back Left Up Down rather than capture source slots', () => {
  const sourceToTarget: FaceKey[] = ['F', 'U', 'R', 'D', 'L', 'B']
  const base = keys.map((slot, i) => ({
    slot,
    target: sourceToTarget[i],
    quarterTurns: 0,
  }))
  const candidates = [
    base,
    ...(['F', 'R', 'B', 'L', 'U', 'D'] as FaceKey[]).map((target) =>
      base.map((entry) =>
        entry.target === target ? { ...entry, quarterTurns: 1 } : entry,
      ),
    ),
  ]
  const source = Object.fromEntries(
    base.map((entry) => [entry.slot, captured[entry.target]]),
  )
  const pool = session(candidates, source)
  expect(pool.candidates.every((candidate) => candidate.valid)).toBe(true)
  const decisions: typeof initial = []
  for (const target of ['F', 'R', 'B', 'L', 'U', 'D'] as FaceKey[]) {
    // Each independent group remains ambiguous after earlier zero answers.
    expect(nextTarget(pool, decisions)).toBe(target)
    const chosen = base.find((entry) => entry.target === target)!
    decisions.push(chosen)
  }
  expect(base.find((entry) => entry.slot === 'R')!.target).toBe('U')
  expect(nextTarget(pool, decisions)).toBeNull()
})
it('replaces a target answer with a different source and preserves compatible history from real feasible 4×4 candidates', () => {
  const fixtures = JSON.parse(
    readFileSync('test/fixtures/guided-4x4-acceptance.json', 'utf8'),
  ) as { cases: { captured: Record<string, string[][]> }[] }
  const source = fixtures.cases[0].captured
  const pool = generateForProtocol(
    source,
    4,
    'sides-then-top-bottom/v1',
  ).session
  const current = pool.candidates[0].mapping
  const changed = pool.candidates[1].mapping
  expect(validateMapping(source, current, 4).valid).toBe(true)
  expect(validateMapping(source, changed, 4).valid).toBe(true)
  const oldUp = current.find((entry) => entry.target === 'U')!
  const oldDown = current.find((entry) => entry.target === 'D')!
  const right = current.find((entry) => entry.target === 'R')!
  const selected = changed.find((entry) => entry.target === 'U')!
  const decisions = [oldUp, right, oldDown]
  const proposed = proposeTarget(source, pool, decisions, selected, current)!
  expect(proposed).not.toBeNull()
  expect(selected.slot).not.toBe(oldUp.slot)
  expect(proposed.decisions).toEqual([selected, right])
  expect(proposed.conflicts).toEqual([oldDown])
  expect(proposed.mapping).toEqual(changed)
  expect(decisions).toEqual([oldUp, right, oldDown])
  expect(
    new Set(targetOptions(pool, [], 'U').map((choice) => choice.slot)),
  ).toEqual(new Set(['L', 'B']))
  const back = proposeTarget(
    source,
    pool,
    proposed.decisions,
    oldUp,
    proposed.mapping,
  )!
  expect(back.mapping).toEqual(current)
  expect(back.decisions).toEqual([oldUp, right])
  for (const option of presentTargetChoices(
    source,
    pool,
    decisions,
    'U',
    current,
  )) {
    const committed = proposeTarget(
      source,
      pool,
      decisions,
      option.choice,
      current,
    )!
    expect(option.view.target).toBe('U')
    expect(option.view.grid).toEqual(
      validateMapping(source, committed.mapping, 4).faces!.U,
    )
  }
})
it('presents and commits the same canonical target and skips resolved targets', () => {
  const changed = initial.map((entry) =>
    entry.target === 'R' ? { ...entry, quarterTurns: 1 } : entry,
  )
  const pool = session([initial, changed])
  expect(nextTarget(pool, [])).toBe('R')
  const presented = presentTargetChoices(captured, pool, [], 'R', changed)
  expect(presented.length).toBeGreaterThan(0)
  expect(presented[0].isCurrent).toBe(true)
  expect(presented[0].relativeTurns).toBe(0)
  for (const option of presented) {
    const proposed = proposeTarget(captured, pool, [], option.choice, changed)!
    const checked = validateMapping(captured, proposed.mapping, 2)
    expect(option.view.target).toBe('R')
    expect(option.view.grid).toEqual(checked.faces!.R)
    expect(option.view.mapping).toEqual(proposed.mapping)
  }
})

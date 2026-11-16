import { readFileSync } from 'node:fs'
import { unzipSync, strFromU8 } from 'fflate'
import { readFixtureColors } from '../src/client/fixtures/fixtureFormat'
import { describe, expect, it } from 'vitest'
import {
  generate,
  preserveMapping,
  previewFaces,
  reconcile,
  nextSlot,
  options,
  previous,
  remaining,
  select,
} from '../src/client/capture/spatialOrientationWizard'

const grid = [
  ['W', 'R'],
  ['G', 'B'],
]
const placement = (quarterTurns: number) => ({
  slot: 'U',
  target: 'F' as const,
  quarterTurns,
})
const candidate = (id: string, quarterTurns: number) => ({
  id,
  mapping: [placement(quarterTurns)],
  faces: { U: grid, R: grid, F: grid, D: grid, L: grid, B: grid },
  issues: [],
  valid: true,
  fullCubeValidityKnown: true,
})
const session = {
  candidates: [candidate('a', 0), candidate('b', 1)],
  truncated: true,
  guided: true,
  equivalenceReduced: true,
  issues: [],
}

describe('capture-order spatial candidate decisions', () => {
  it('asks about the initial captured front before other capture slots', () => {
    expect(nextSlot(session, [])).toBe('U')
    expect(
      options(session, [], 'U').map((option) => option.quarterTurns),
    ).toEqual([0, 1])
  })
  it('filters explicit source identities and keeps previous values immutable', () => {
    const decisions = select([], placement(1))
    expect(remaining(session, decisions).map((value) => value.id)).toEqual([
      'b',
    ])
    expect(nextSlot(session, decisions)).toBeNull()
    expect(previous(decisions)).toEqual([])
    expect(decisions).toEqual([placement(1)])
    expect(session.candidates).toHaveLength(2)
  })
  it('keeps zero candidates available to manual recovery rather than inventing choices', () => {
    expect(nextSlot({ ...session, candidates: [] }, [])).toBeNull()
    expect(options({ ...session, candidates: [] }, [], 'U')).toEqual([])
  })
})

it('preserves later choices when replacing an earlier decision and exposes conflicts', () => {
  const later = { slot: 'R', target: 'R' as const, quarterTurns: 2 }
  const updated = select([placement(0), later], placement(1))
  expect(updated).toEqual([later, placement(1)])
  expect(remaining(session, updated)).toEqual([])
})

it('distinguishes whole-face assignments even when their colored grids are identical', () => {
  const alternate = {
    ...candidate('c', 0),
    mapping: [{ ...placement(0), target: 'B' as const }],
  }
  const choices = options(
    { ...session, candidates: [candidate('a', 0), alternate] },
    [],
    'U',
  )
  expect(choices.map((choice) => choice.target)).toEqual(['F', 'B'])
  expect(choices.map((choice) => choice.candidateIds)).toEqual([['a'], ['c']])
})

const keys = ['U', 'R', 'F', 'D', 'L', 'B']
const colors = ['W', 'R', 'G', 'Y', 'O', 'B']
for (const size of [2, 3, 4, 5, 6, 7, 8]) {
  it(`uses existing validation for guided ${size}×${size} candidates without changing sources`, () => {
    const raw = Object.fromEntries(
      keys.map((key, i) => [
        key,
        Array.from({ length: size }, () => Array<string>(size).fill(colors[i])),
      ]),
    )
    // Guided sequence: front, right, back, left, top, bottom.
    const guided = {
      U: raw.F,
      R: raw.R,
      F: raw.B,
      D: raw.L,
      L: raw.U,
      B: raw.D,
    }
    const snapshot = JSON.stringify(guided)
    const found = generate(guided, size, true)
    expect(found.candidates.length).toBeGreaterThan(0)
    expect(found.candidates.every((value) => value.valid)).toBe(true)
    expect(
      found.candidates.every(
        (value) => value.fullCubeValidityKnown === size <= 3,
      ),
    ).toBe(true)
    expect(found.equivalenceReduced).toBe(true)
    expect(JSON.stringify(guided)).toBe(snapshot)
    expect(
      found.candidates.every(
        (value) =>
          new Set(value.mapping.map((entry) => entry.target)).size === 6,
      ),
    ).toBe(true)
  })
}

it('retains provenance and partial-validation caveats for the actual mirrored 7×7 archive', () => {
  const zip = unzipSync(
    readFileSync('test/fixtures/orientation-recovery-7x7.zip'),
  )
  const key = Object.keys(zip).find((value) => value.endsWith('/meta.json'))!
  const meta = JSON.parse(strFromU8(zip[key]))
  const raw = readFixtureColors(meta)!.colors
  const snapshot = JSON.stringify(raw)
  const found = generate(raw, 7, true)
  expect(found.candidates.length).toBeGreaterThan(0)
  expect(
    found.candidates.every((value) => value.fullCubeValidityKnown === false),
  ).toBe(true)
  expect(found.issues.join(' ')).toContain('complete large-cube reachability')
  expect(JSON.stringify(raw)).toBe(snapshot)
})

it('returns an explicit manual-recovery explanation for invalid or missing sources', () => {
  const found = generate({}, 3, true)
  expect(found.candidates).toEqual([])
  expect(found.issues.join(' ')).toContain(
    'Advanced manual recovery remains available',
  )
})

it('uses capture sequence order rather than the most ambiguous logical face', () => {
  const make = (id: string, front: number, right: number) => ({
    ...candidate(id, front),
    mapping: [
      placement(front),
      { slot: 'R', target: 'R' as const, quarterTurns: right },
    ],
  })
  const pool = {
    ...session,
    candidates: [make('a', 0, 0), make('b', 0, 1), make('c', 1, 2)],
  }
  expect(nextSlot(pool, [])).toBe('U')
  expect(nextSlot(pool, [placement(0)])).toBe('R')
  expect(
    options(pool, [placement(0)], 'R').map((choice) => choice.quarterTurns),
  ).toEqual([0, 1])
})

it('skips resolved slots while retaining every matching identity in a shared option', () => {
  const pool = {
    ...session,
    candidates: [candidate('a', 0), candidate('b', 0)],
  }
  expect(nextSlot(pool, [])).toBeNull()
  expect(options(pool, [], 'U')[0].candidateIds).toEqual(['a', 'b'])
  expect(options(pool, [], 'U')[0].grid).toEqual(grid)
  expect(previous([])).toEqual([])
})

it('preserves explicit symmetric photo identities instead of content-rematching', () => {
  const raw = Object.fromEntries(keys.map((key) => [key, grid]))
  const mapping = keys.map((slot, index) => ({
    slot,
    target: keys[(index + 1) % 6] as 'U' | 'R' | 'F' | 'D' | 'L' | 'B',
    quarterTurns: 0,
  }))
  expect(preserveMapping(raw, mapping, candidate('same', 0))).toEqual(mapping)
  const rotated = candidate('different', 0)
  rotated.faces.F = [
    ['B', 'G'],
    ['R', 'W'],
  ]
  expect(preserveMapping(raw, mapping, rotated)).toEqual(rotated.mapping)
})

it('reconciles earlier answers by retaining compatible later choices and reporting conflicts', () => {
  const right = { slot: 'R', target: 'R' as const, quarterTurns: 0 }
  const pool = {
    ...session,
    candidates: session.candidates.map((value) => ({
      ...value,
      mapping: [...value.mapping, right],
    })),
  }
  expect(reconcile(pool, [placement(0), right], placement(1))).toEqual({
    decisions: [placement(1), right],
    conflicts: [],
  })
  const wrong = { ...right, quarterTurns: 2 }
  expect(reconcile(pool, [placement(0), wrong], placement(1))).toEqual({
    decisions: [placement(1)],
    conflicts: [wrong],
  })
})

it('keeps all six source grids previewable when center colors fail validation', () => {
  const raw = Object.fromEntries(
    keys.map((key) => [
      key,
      [
        ['W', 'R', 'G'],
        ['Y', '?', 'B'],
        ['R', 'G', 'W'],
      ],
    ]),
  )
  const mapping = keys.map((slot) => ({
    slot,
    target: slot as 'U' | 'R' | 'F' | 'D' | 'L' | 'B',
    quarterTurns: 0,
  }))
  const shown = previewFaces(raw, mapping, 3)
  expect(Object.keys(shown)).toEqual(keys)
  for (const key of keys)
    expect(shown[key as keyof typeof shown]).toEqual(raw[key])
})

it('shows the first duplicate assignment and an empty missing face without modifying sources', () => {
  const raw = Object.fromEntries(keys.map((key) => [key, grid]))
  const mapping = keys.map((slot) => ({
    slot,
    target: slot as 'U' | 'R' | 'F' | 'D' | 'L' | 'B',
    quarterTurns: 0,
  }))
  mapping[1] = { slot: 'R', target: 'U', quarterTurns: 1 }
  const before = JSON.stringify({ raw, mapping })
  const shown = previewFaces(raw, mapping, 2)
  expect(shown.U).toEqual(grid)
  expect(shown.R).toEqual([
    ['', ''],
    ['', ''],
  ])
  expect(JSON.stringify({ raw, mapping })).toBe(before)
})

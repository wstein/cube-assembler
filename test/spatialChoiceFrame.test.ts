import { readFileSync } from 'node:fs'
import { strFromU8, unzipSync } from 'fflate'
import { expect, it } from 'vitest'
import { readFixtureColors } from '../src/client/fixtures/fixtureFormat'
import { captureFrame } from '../src/client/capture/captureFaceMapping'
import {
  generate,
  previewChoice,
  propose,
} from '../src/client/capture/spatialOrientationWizard'

const zip = unzipSync(
  readFileSync('test/fixtures/orientation-recovery-7x7.zip'),
)
const metaKey = Object.keys(zip).find((key) => key.endsWith('/meta.json'))!
const raw = readFixtureColors(JSON.parse(strFromU8(zip[metaKey])))!.colors

it('shows every source choice in the exact frame that its proposed mapping commits', () => {
  const session = generate(raw, 7, true)
  const candidate = session.candidates[0]
  const before = JSON.stringify(raw)
  const transforms = new Set<number>()
  let differentFromLogical = false
  for (const front of candidate.mapping) {
    for (const up of candidate.mapping) {
      const existing = captureFrame(raw, candidate.mapping, front.slot, up.slot)
      if (!existing) continue
      transforms.add(existing.displayTransform)
      for (const choice of candidate.mapping) {
        const proposal = propose(raw, session, [], choice, candidate.mapping)!
        expect(proposal).not.toBeNull()
        const expected = captureFrame(
          raw,
          proposal.mapping,
          front.slot,
          up.slot,
        )!
        const placed = expected.mapping.find(
          (entry) => entry.slot === choice.slot,
        )!
        const preview = previewChoice(
          raw,
          session,
          [],
          choice,
          candidate.mapping,
          front.slot,
          up.slot,
          true,
        )!
        expect(preview).not.toBeNull()
        expect(preview.target).toBe(placed.target)
        expect(preview.grid).toEqual(expected.faces[placed.target])
        expect(preview.mapping).toEqual(expected.mapping)
        expect(preview.displayTransform).toBe(expected.displayTransform)
        if (
          JSON.stringify(preview.grid) !==
          JSON.stringify(candidate.faces[choice.target])
        )
          differentFromLogical = true
      }
    }
  }
  expect(transforms.size).toBe(24)
  expect(differentFromLogical).toBe(true)
  expect(JSON.stringify(raw)).toBe(before)
})

it('returns no falsely labeled capture preview when the chosen front and top cannot define a frame', () => {
  const session = generate(raw, 7, true)
  const candidate = session.candidates[0]
  expect(
    propose(
      raw,
      { ...session, candidates: [] },
      [],
      candidate.mapping[0],
      candidate.mapping,
    ),
  ).toBeNull()
  expect(
    previewChoice(
      raw,
      session,
      [],
      candidate.mapping[0],
      candidate.mapping,
      'U',
      'U',
      true,
    ),
  ).toBeNull()
  const choice = candidate.mapping.find((entry) => entry.slot === 'R')!
  const shown = previewChoice(
    raw,
    session,
    [],
    choice,
    candidate.mapping,
    'U',
    'U',
    false,
  )!
  expect(shown.grid).toEqual(candidate.faces[choice.target])
  expect(shown.target).toBe(choice.target)
})

it('uses the same reversible source-to-frame transform on a second asymmetric 3×3 fixture', () => {
  const other = readFixtureColors(
    JSON.parse(
      readFileSync(
        'test/fixtures/cube-3x3-2026-09-27T09-00-11/meta.json',
        'utf8',
      ),
    ),
  )!.colors
  const session = generate(other, 3, false)
  const candidate = session.candidates[0]
  expect(candidate).toBeDefined()
  const before = JSON.stringify(other)
  const turns = new Set<number>()
  const transforms = new Set<number>()
  for (const front of candidate.mapping) {
    for (const up of candidate.mapping) {
      const frame = captureFrame(other, candidate.mapping, front.slot, up.slot)
      if (!frame) continue
      transforms.add(frame.displayTransform)
      for (const choice of candidate.mapping) {
        const proposal = propose(other, session, [], choice, candidate.mapping)!
        const committedFrame = captureFrame(
          other,
          proposal.mapping,
          front.slot,
          up.slot,
        )!
        const placed = committedFrame.mapping.find(
          (entry) => entry.slot === choice.slot,
        )!
        turns.add(placed.quarterTurns)
        const preview = previewChoice(
          other,
          session,
          [],
          choice,
          candidate.mapping,
          front.slot,
          up.slot,
          true,
        )!
        expect(preview.grid).toEqual(committedFrame.faces[placed.target])
        expect(preview.target).toBe(placed.target)
      }
    }
  }
  expect(transforms.size).toBe(24)
  expect(turns.has(1)).toBe(true)
  expect(turns.has(3)).toBe(true)
  expect(JSON.stringify(other)).toBe(before)
})

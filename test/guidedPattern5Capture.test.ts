import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import {
  readFixtureColors,
  readFixtureAssembled,
} from '../src/client/fixtures/fixtureFormat'
import {
  solveGuidedCapture,
  orientationFreeSignature,
} from '../src/cube/cubeAssembly'
import { preferredGuidedArrangementIndex } from '../src/cube/orientationWizard'
import {
  readRecovery,
  restoredCandidate,
} from '../src/client/capture/captureRecovery'
import {
  generate,
  nextSlot,
  presentChoices,
} from '../src/client/capture/spatialOrientationWizard'

// Byte-exact metadata from the owner's extracted capture directory:
// cube-assembler/test/fixtures/cube-5x5-2026-11-16T14-42-31/meta.json.
// Photos remain at their original location; this is an assembly regression,
// not a claim that this metadata-only file exercises image recognition.
it('keeps both guided 5x5 arrangements available and restores the explicitly saved one', () => {
  const bytes = readFileSync(
    'test/fixtures/cube-5x5-2026-11-16T14-42-31.assembly.json',
  )
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(
    '5fdc7b7123c396ae0ea315846b70ec07f42606139334566238d1584a776e5c70',
  )
  const meta = JSON.parse(bytes.toString())
  expect(meta.capture.app.commit).toBe('0e2b62f')
  expect(meta.colorsURFDLB).toBe(meta.detectedURFDLB)
  const raw = readFixtureColors(meta)!.colors
  const keys = ['U', 'R', 'F', 'D', 'L', 'B'] as const
  for (const color of ['W', 'R', 'G', 'Y', 'O', 'B'])
    expect(
      meta.colorsURFDLB.split('').filter((value: string) => value === color),
    ).toHaveLength(25)
  const guided = solveGuidedCapture({
    sides: [raw.U, raw.R, raw.F, raw.D],
    caps: [raw.L, raw.B],
  })!
  expect(guided.alternatives).toHaveLength(2)
  expect(preferredGuidedArrangementIndex(guided.arrangements)).toBe(1)
  expect(guided.arrangements[0].turn).toBe('left')
  expect(guided.arrangements[1].turn).toBe('right')
  const saved = readFixtureAssembled(meta)!
  const signature = (faces: Record<string, string[][]>) =>
    keys.map((key) => faces[key].flat().join('')).join(' ')
  expect(signature(guided.alternatives[0].faces)).toBe(signature(saved))
  expect(orientationFreeSignature(guided.alternatives[1].faces)).not.toBe(
    orientationFreeSignature(saved),
  )
  const differences = keys.map(
    (key) =>
      guided.alternatives[1].faces[key]
        .flat()
        .filter((color, index) => color !== saved[key].flat()[index]).length,
  )
  expect(differences).toEqual([0, 16, 16, 0, 16, 16])
  const record = readRecovery(meta.capture.faceRecovery)!
  expect(signature(restoredCandidate(record, raw, 5, saved)!.faces)).toBe(
    signature(saved),
  )
  const session = generate(raw, 5, true)
  expect(session.candidates).toHaveLength(2)
  const slot = nextSlot(session, [])!
  const shown = presentChoices(
    raw,
    session,
    [],
    slot,
    record.mapping,
    record.captureFrame.frontSlot,
    record.captureFrame.upSlot,
    false,
  )
  expect(shown).toHaveLength(2)
  expect(shown[0].isCurrent).toBe(true)
  expect(shown[0].relativeTurns).toBe(0)
  expect(shown[1].relativeTurns).toBe(2)
  expect(
    session.candidates.every((candidate) => !candidate.fullCubeValidityKnown),
  ).toBe(true)
})

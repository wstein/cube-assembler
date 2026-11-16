import { expect, it } from 'vitest'
import { validateMapping } from '../src/client/capture/captureFaceMapping'
import {
  propose,
  type SpatialSession,
} from '../src/client/capture/spatialOrientationWizard'

it('commits an explicitly selected source rotation even when all source photos have symmetric solid grids', () => {
  const keys = ['U', 'R', 'F', 'D', 'L', 'B'] as const
  const colors = ['W', 'R', 'G', 'Y', 'O', 'B']
  const raw = Object.fromEntries(
    keys.map((slot, i) => [
      slot,
      Array.from({ length: 2 }, () => [colors[i], colors[i]]),
    ]),
  )
  const current = keys.map((slot) => ({ slot, target: slot, quarterTurns: 0 }))
  const selected = { slot: 'U', target: 'U' as const, quarterTurns: 1 }
  const mapping = current.map((entry) =>
    entry.slot === selected.slot ? selected : entry,
  )
  const checked = validateMapping(raw, mapping, 2)
  expect(checked.valid).toBe(true)
  expect(checked.faces).toEqual(validateMapping(raw, current, 2).faces)
  const session: SpatialSession = {
    candidates: [
      {
        id: 'explicit-source-turn',
        mapping,
        faces: checked.faces!,
        valid: true,
        issues: [],
        fullCubeValidityKnown: true,
      },
    ],
    truncated: false,
    guided: false,
    equivalenceReduced: true,
    issues: [],
  }
  const proposed = propose(raw, session, [], selected, current)!
  expect(proposed).not.toBeNull()
  expect(proposed.decisions).toEqual([selected])
  expect(proposed.mapping.find((entry) => entry.slot === 'U')).toEqual(selected)
  expect(current.find((entry) => entry.slot === 'U')!.quarterTurns).toBe(0)
})

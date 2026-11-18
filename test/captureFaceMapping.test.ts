import realCapture from './captureFaceMapping7x7.json'
import { describe, expect, it } from 'vitest'
import {
  assignMapping,
  captureFrame,
  initializeMapping,
  inverseTransform,
  rotateMapping,
  transformFaces,
  validateMapping,
} from '../src/client/capture/captureFaceMapping'
import { rotateGrid, turnFace, type Faces } from '../src/cube/cubeGeometry'

const ORDER = ['U', 'R', 'F', 'D', 'L', 'B'] as const
const COLORS = ['W', 'R', 'G', 'Y', 'O', 'B']
const solved = (n: number): Faces =>
  Object.fromEntries(
    ORDER.map((key, i) => [
      key,
      Array.from({ length: n }, () => Array<string>(n).fill(COLORS[i])),
    ]),
  ) as Faces
const asymmetric = (n: number) => turnFace(turnFace(solved(n), 'R', 1), 'U', 1)

// Source photos are capture slots, not the cube sides named by these keys.
describe('manual captured-face mapping', () => {
  for (const n of [3, 5, 7]) {
    it(`uses fixed centers and preserves every quarter turn on an odd ${n}x${n}`, () => {
      const faces = asymmetric(n)
      const raw = Object.fromEntries(
        ORDER.map((slot, i) => [slot, faces[ORDER[(i + 2) % 6]]]),
      )
      const before = JSON.stringify(raw)
      const mapping = initializeMapping(raw, null)
      expect(mapping.map((entry) => entry.target)).toEqual([
        'F',
        'D',
        'L',
        'B',
        'U',
        'R',
      ])
      for (const slot of ORDER) {
        for (let q = 0; q < 4; q++) {
          const changed = rotateMapping(mapping, slot, q)
          expect(
            changed.find((entry) => entry.slot === slot)?.quarterTurns,
          ).toBe(q)
          const validation = validateMapping(raw, changed, n)
          expect(
            validation.faces?.[
              mapping.find((entry) => entry.slot === slot)!.target
            ],
          ).toEqual(rotateGrid(raw[slot], q))
        }
      }
      expect(JSON.stringify(raw)).toBe(before)
      expect(mapping.every((entry) => entry.quarterTurns === 0)).toBe(true)
      const conflict = assignMapping(mapping, 'U', 'U')
      expect(validateMapping(raw, conflict, n).valid).toBe(false)
      expect(validateMapping(raw, conflict, n).issues.join(' ')).toMatch(
        /center|assigned/i,
      )
      const exchanged = assignMapping(
        assignMapping(mapping, 'U', mapping[1].target),
        'R',
        mapping[0].target,
      )
      expect(validateMapping(raw, exchanged, n).issues.join(' ')).toMatch(
        /fixed center/i,
      )
    })
  }
  for (const n of [2, 4, 6, 8]) {
    it(`permits explicit whole-photo assignment drafts on an even ${n}x${n}`, () => {
      const raw = asymmetric(n)
      const mapping = initializeMapping(raw, null)
      const draft = assignMapping(mapping, 'U', 'R')
      expect(mapping[0].target).toBe('U')
      expect(validateMapping(raw, draft, n).issues.join(' ')).toMatch(
        /assigned/i,
      )
      const swap = assignMapping(draft, 'R', 'U')
      expect(validateMapping(raw, swap, n).faces?.R).toEqual(raw.U)
      expect(validateMapping(raw, swap, n).faces?.U).toEqual(raw.R)
      expect(validateMapping(raw, swap, n).issues.join(' ')).not.toMatch(
        /assigned/i,
      )
      expect(rotateMapping(swap, 'U', -1)[0].quarterTurns).toBe(3)
      expect(rotateMapping(swap, 'U', 4)[0].quarterTurns).toBe(0)
    })
  }
  it('recovers a bijection from a suggested candidate without reusing a symmetric photo', () => {
    const raw = solved(4)
    const candidate = {
      faces: { ...raw },
      rotations: Object.fromEntries(ORDER.map((face) => [face, 0])) as Record<
        (typeof ORDER)[number],
        number
      >,
    }
    const mapping = initializeMapping(raw, candidate)
    expect(new Set(mapping.map((entry) => entry.slot)).size).toBe(6)
    expect(new Set(mapping.map((entry) => entry.target)).size).toBe(6)
    expect(validateMapping(raw, mapping, 4).valid).toBe(true)
  })
  it('keeps a bijection even when every capture has identical symmetric content', () => {
    const raw = Object.fromEntries(
      ORDER.map((slot) => [
        slot,
        [
          ['W', 'W'],
          ['W', 'W'],
        ],
      ]),
    ) as Faces
    const candidate = {
      faces: raw,
      rotations: Object.fromEntries(ORDER.map((face) => [face, 0])) as Record<
        (typeof ORDER)[number],
        number
      >,
    }
    const mapping = initializeMapping(raw, candidate)
    expect(new Set(mapping.map((entry) => entry.slot)).size).toBe(6)
    expect(new Set(mapping.map((entry) => entry.target)).size).toBe(6)
  })
  it('copies projected grids even when no rotation is requested', () => {
    const raw = solved(3)
    const snapshot = JSON.stringify(raw)
    const projection = validateMapping(raw, initializeMapping(raw, null), 3)
    projection.faces!.U[0][0] = 'B'
    expect(JSON.stringify(raw)).toBe(snapshot)
  })
  it('validates the entered mapping directly instead of replacing it by a solver candidate', () => {
    const raw = asymmetric(3)
    const mapping = initializeMapping(raw, null)
    const bad = rotateMapping(mapping, 'U', 1)
    const result = validateMapping(raw, bad, 3)
    expect(result.faces?.U).toEqual(rotateGrid(raw.U, 1))
    expect(result.valid).toBe(false)
    expect(result.parity?.valid).toBe(false)
  })
  it('rejects missing photos, repeated slots, malformed grids and unsupported colors', () => {
    const raw = solved(3)
    const mapping = initializeMapping(raw, null)
    expect(validateMapping(raw, mapping.slice(1), 3).valid).toBe(false)
    expect(
      validateMapping(raw, [...mapping.slice(0, 5), mapping[0]], 3).valid,
    ).toBe(false)
    expect(validateMapping({ ...raw, U: [['W']] }, mapping, 3).valid).toBe(
      false,
    )
    expect(
      validateMapping(
        { ...raw, U: raw.U.map((row) => row.map(() => 'X')) },
        mapping,
        3,
      ).valid,
    ).toBe(false)
    expect(
      validateMapping(
        raw,
        mapping.map((x, i) => (i === 0 ? { ...x, quarterTurns: 0.5 } : x)),
        3,
      ).valid,
    ).toBe(false)
  })
  it('rejects an unknown imported target instead of treating it as the back face', () => {
    const raw = solved(4)
    const mapping = initializeMapping(raw, null)
    const malformed = mapping.map((entry, i) =>
      i === 5 ? { ...entry, target: 'invalid' as typeof entry.target } : entry,
    )
    const result = validateMapping(raw, malformed, 4)
    expect(result.valid).toBe(false)
    expect(result.faces).toBeNull()
    expect(result.issues.join(' ')).toMatch(/assigned side/i)
  })
  it('reports duplicate odd centers instead of silently replacing their assignment', () => {
    const raw = solved(7)
    raw.R[3][3] = 'W'
    const mapping = initializeMapping(raw, null)
    expect(validateMapping(raw, mapping, 7).valid).toBe(false)
    expect(validateMapping(raw, mapping, 7).issues.join(' ')).toMatch(/center/i)
  })
})

describe('manual mapping size range', () => {
  it.each(Array.from({ length: 14 }, (_, i) => i + 2))(
    'accepts a %ix%i cube',
    (n) => {
      const raw = solved(n)
      const result = validateMapping(raw, initializeMapping(raw, null), n)
      expect(result.issues.join(' ')).not.toMatch(/supports sizes/)
    },
  )
  it.each([1, 16, 17])('refuses size %i with the supported range', (n) => {
    const raw = solved(Math.max(n, 2))
    const result = validateMapping(raw, initializeMapping(raw, null), n)
    expect(result.valid).toBe(false)
    expect(result.issues).toContain(
      'Manual face mapping supports sizes 2 through 15.',
    )
  })
})

describe('capture-relative display frame', () => {
  it('keeps canonical faces intact and records exact invertible transforms', () => {
    const raw = asymmetric(3)
    const snapshot = JSON.stringify(raw)
    const mapping = initializeMapping(raw, null)
    const frame = captureFrame(raw, mapping, 'R', 'U')
    expect(frame).not.toBeNull()
    expect(frame?.faces.F).toEqual(raw.R)
    expect(frame?.mapping.find((x) => x.slot === 'R')?.target).toBe('F')
    expect(frame?.mapping.find((x) => x.slot === 'U')?.target).toBe('U')
    for (const entry of frame!.mapping) {
      expect(frame!.faces[entry.target]).toEqual(
        rotateGrid(
          raw[entry.slot as (typeof ORDER)[number]],
          entry.quarterTurns,
        ),
      )
    }
    expect(frame?.displayTransform).toBeGreaterThanOrEqual(0)
    expect(frame?.canonicalTransform).toBeGreaterThanOrEqual(0)
    expect(JSON.stringify(raw)).toBe(snapshot)
    expect(captureFrame(raw, mapping, 'U', 'D')).toBeNull()
    expect(captureFrame(raw, mapping, 'U', 'U')).toBeNull()
  })
})

describe('recorded 7x7 capture and persisted display transforms', () => {
  it('retains the reported raw mirrored capture and direct manual rotations', () => {
    const n = 7
    const raw = Object.fromEntries(
      realCapture.colorsURFDLB
        .split(' ')
        .map((block, index) => [
          ORDER[index],
          Array.from({ length: n }, (_, row) =>
            block.slice(row * n, (row + 1) * n).split(''),
          ),
        ]),
    )
    expect(realCapture.colorsURFDLB).toBe(realCapture.detectedURFDLB)
    expect(realCapture.provenance.mirrored).toBe(true)
    const snapshot = JSON.stringify(raw)
    const mapping = initializeMapping(raw, null)
    expect(mapping.map((x) => x.target)).toEqual(['B', 'R', 'F', 'L', 'D', 'U'])
    const edited = rotateMapping(mapping, 'U', -1)
    expect(validateMapping(raw, edited, 7).faces?.B).toEqual(
      rotateGrid(raw.U, 3),
    )
    expect(JSON.parse(JSON.stringify(edited))).toEqual(edited)
    expect(JSON.stringify(raw)).toBe(snapshot)
  })
  it('uses exactly the same invertible 24 rotations for display and canonical state', () => {
    const original = asymmetric(4)
    for (let index = 0; index < 24; index++) {
      const displayed = transformFaces(original, index)!
      const inverse = inverseTransform(index)!
      expect(transformFaces(displayed, inverse)).toEqual(original)
      // A physical turn in the displayed frame stays a legal cube when
      // transformed back; this never changes the authoritative input.
      const turned = turnFace(displayed, 'R', 1)
      const canonical = transformFaces(turned, inverse)!
      const validation = validateMapping(
        canonical,
        initializeMapping(canonical, null),
        4,
      )
      expect(validation.valid).toBe(true)
      expect(transformFaces(canonical, index)).toEqual(turned)
    }
    for (const invalid of [-1, 24, 0.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(transformFaces(original, invalid)).toBeNull()
      expect(inverseTransform(invalid)).toBeNull()
    }
  })
})

it('conjugates every face direction and representative layer depth exactly through all display frames', () => {
  const key = (faces: Faces) =>
    ORDER.map((face) => faces[face].flat().join('')).join('|')
  for (const n of [2, 3, 4, 5, 6, 7, 8]) {
    let original = asymmetric(n)
    original = turnFace(turnFace(original, 'F', -1), 'L', 2)
    const widths = [...new Set([1, Math.ceil(n / 2), n])]
    for (const width of widths) {
      for (const quarters of [1, -1, 2]) {
        const legal = new Set(
          ORDER.map((face) => key(turnFace(original, face, quarters, width))),
        )
        for (let index = 0; index < 24; index++) {
          const displayed = transformFaces(original, index)!
          const inverse = inverseTransform(index)!
          for (const face of ORDER) {
            const displayedMove = turnFace(displayed, face, quarters, width)
            const canonical = transformFaces(displayedMove, inverse)!
            expect(
              legal.has(key(canonical)),
              `N=${n}, frame=${index}, ${face}/${quarters}/${width}`,
            ).toBe(true)
            expect(transformFaces(canonical, index)).toEqual(displayedMove)
          }
        }
      }
    }
  }
}, 30_000)

it('prefills the current nonidentity even candidate instead of falling back to zero rotations', () => {
  const candidateFaces = asymmetric(4)
  const permutation = ['F', 'U', 'R', 'B', 'D', 'L'] as const
  const raw = Object.fromEntries(
    ORDER.map((slot, i) => [
      slot,
      rotateGrid(candidateFaces[permutation[i]], -(i % 4)),
    ]),
  )
  const before = JSON.stringify(raw)
  const candidate = {
    faces: candidateFaces,
    rotations: { U: 0, R: 0, F: 0, D: 0, L: 0, B: 0 },
  }
  const mapping = initializeMapping(raw, candidate)
  expect(validateMapping(raw, mapping, 4).faces).toEqual(candidateFaces)
  expect(mapping.map((p) => p.target)).toEqual(permutation)
  expect(mapping.some((p) => p.quarterTurns !== 0)).toBe(true)
  expect(JSON.stringify(raw)).toBe(before)
})

it('keeps every persisted v1 display index fixed to its labeled baseline basis', async () => {
  const golden = await import('./captureFrameConventionV1.json')
  const basis = Object.fromEntries(
    ORDER.map((f) => [
      f,
      [
        [`${f}0`, `${f}1`],
        [`${f}2`, `${f}3`],
      ],
    ]),
  ) as Faces
  expect(ORDER.map((f) => basis[f].flat()).flat()).toHaveLength(24)
  expect(
    Array.from({ length: 24 }, (_, i) => transformFaces(basis, i)).map(
      (faces) => ORDER.map((f) => faces![f].flat().join('.')).join('/'),
    ),
  ).toEqual(golden.signatures)
})

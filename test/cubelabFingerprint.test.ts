import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import Ajv2020 from 'ajv/dist/2020.js'
import { describe, expect, it } from 'vitest'
import {
  cubeLabMovesJson,
  cubeLabMovesPayload,
  escapeScriptJson,
} from '../src/client/cubeLabFingerprint'
import {
  type CubeTurn,
  formatCubeTurn,
  generateScrambleMoves,
} from '../src/cube/cubeMoves'

const schema = JSON.parse(
  readFileSync(
    join(__dirname, '../public/schemas/cubelab-fingerprint-v1.schema.json'),
    'utf8',
  ),
)
const validate = new Ajv2020({ allErrors: true }).compile(schema)
const schemaV2 = JSON.parse(
  readFileSync(
    join(__dirname, '../public/schemas/cubelab-fingerprint-v2.schema.json'),
    'utf8',
  ),
)
const validateV2 = new Ajv2020({ allErrors: true }).compile(schemaV2)
const FACES = ['U', 'R', 'F', 'D', 'L', 'B'] as const

describe('CubeLab moves block', () => {
  it('has the published schema id', () => {
    expect(schema.$id).toBe(
      'https://wstein.github.io/cube-assembler/schemas/cubelab-fingerprint-v1.schema.json',
    )
  })

  it('writes size, moves and format and nothing else', () => {
    expect(
      cubeLabMovesPayload(
        [
          { face: 'L', depth: 2, turns: -1 },
          { face: 'R', depth: 2, turns: 1 },
          { face: 'U', depth: 1, turns: 2 },
        ],
        5,
      ),
    ).toEqual({ size: 5, moves: "2L' 2R U2", format: 'layer-prefix/v1' })
  })

  it('keeps an empty move list as an empty string', () => {
    const payload = cubeLabMovesPayload([], 3)
    expect(payload.moves).toBe('')
    expect(validate(payload)).toBe(true)
  })

  it('validates scrambles of every size, wide turns included', () => {
    for (let size = 2; size <= 7; size++) {
      let n = 0
      const random = () => ((n = (n * 7919 + 13) % 1009) + 0.5) / 1009
      const moves = generateScrambleMoves(
        size,
        { length: 'long', innerLayers: true },
        random,
      )
      const payload = JSON.parse(cubeLabMovesJson(moves, size))
      expect(validate(payload), JSON.stringify(validate.errors)).toBe(true)
      expect(payload.size).toBe(size)
    }
  })

  it('accepts wide, ranged and whole-cube notation', () => {
    for (const moves of [
      "3Rw 2-3Uw' x y'",
      "Fw2 2B2 B'",
      // Half turns of the whole cube, as formatCubeTurn writes them.
      "x2 y2 z2 x' y z'",
    ]) {
      expect(validate({ size: 7, moves, format: 'layer-prefix/v1' })).toBe(true)
    }
  })

  it('escapes characters that could end the script element', () => {
    const hostile = escapeScriptJson(JSON.stringify({ moves: '</script><!--' }))
    expect(hostile).not.toContain('<')
    expect(JSON.parse(hostile)).toEqual({ moves: '</script><!--' })
  })

  it('rejects broken variants', () => {
    const good = { size: 3, moves: "R U R'", format: 'layer-prefix/v1' }
    expect(validate(good)).toBe(true)
    expect(validate({ ...good, size: 1 })).toBe(false)
    expect(validate({ ...good, size: 8 })).toBe(false)
    expect(validate({ ...good, size: 3.5 })).toBe(false)
    expect(validate({ ...good, moves: 'Moves: R' })).toBe(false)
    expect(validate({ ...good, moves: 'R  U' })).toBe(false)
    expect(validate({ ...good, moves: "R U'x" })).toBe(false)
    expect(validate({ ...good, format: 'other' })).toBe(false)
    expect(validate({ size: 3, moves: 'R' })).toBe(false)
    expect(validate({ ...good, moves: 7 })).toBe(false)
  })
})

// Reads a turn written by layer-prefix/v1 or v2 back into the layers it moves
// (counted from the named face) so a test can compare it with the turn.
function readTurn(text: string) {
  const m = /^(?:(\d+)-(\d+)|(\d+))?([URFDLB])(w?)(['2]?)$/.exec(text)
  if (!m) return undefined
  const [, outer, inner, single, face, wide] = m
  if (outer !== undefined) {
    return { face, outer: Number(outer), inner: Number(inner) }
  }
  const depth = single === undefined ? 1 : Number(single)
  return wide
    ? { face, outer: 1, inner: depth === 1 ? 2 : depth }
    : {
        face,
        outer: depth,
        inner: depth,
      }
}

describe('CubeLab moves block v2 (layer-prefix/v2)', () => {
  it('has the published schema id', () => {
    expect(schemaV2.$id).toBe(
      'https://wstein.github.io/cube-assembler/schemas/cubelab-fingerprint-v2.schema.json',
    )
  })

  it('writes v1 up to 7x7 and v2 above, with the same turn text', () => {
    const turns: CubeTurn[] = [{ face: 'R', depth: 2, turns: 1 }]
    expect(cubeLabMovesPayload(turns, 7).format).toBe('layer-prefix/v1')
    expect(cubeLabMovesPayload(turns, 8).format).toBe('layer-prefix/v2')
    expect(cubeLabMovesPayload(turns, 15)).toEqual({
      size: 15,
      moves: '2R',
      format: 'layer-prefix/v2',
    })
  })

  it('writes two-digit layers and ranges', () => {
    const turns: CubeTurn[] = [
      { face: 'R', depth: 10, turns: 1 },
      { face: 'L', depth: 12, width: 3, turns: -1 },
      { face: 'U', depth: 12, width: 12, turns: 2 },
      { face: 'F', depth: 11, width: 11, turns: 1 },
    ]
    expect(cubeLabMovesPayload(turns, 15).moves).toBe("10R 10-12Lw' 12Uw2 11Fw")
  })

  it('validates every size, depth and width as written and reads them back', () => {
    for (let size = 2; size <= 15; size++) {
      const v2 = size > 7
      for (const face of FACES) {
        for (let depth = 1; depth < size; depth++) {
          for (let width = 1; width <= depth; width++) {
            for (const turns of [1, -1, 2]) {
              const turn: CubeTurn = { face, depth, width, turns }
              const text = formatCubeTurn(turn, size)
              const payload = cubeLabMovesPayload([turn], size)
              expect(payload.moves).toBe(text)
              const check = v2 ? validateV2 : validate
              expect(check(payload), text + ' ' + size).toBe(true)
              expect((v2 ? validate : validateV2)(payload), text).toBe(false)
              const back = readTurn(text.replace(/['2]$/, ''))
              expect(back, text).toEqual({
                face,
                outer: depth - width + 1,
                inner: depth,
              })
            }
          }
        }
      }
    }
  })

  it('accepts two-digit notation and whole-cube turns', () => {
    for (const moves of [
      "10-12Rw 12Uw' 15R2 x y2 z'",
      "2R 3-4Fw2 10B'",
      '11-14Dw',
    ]) {
      expect(validateV2({ size: 15, moves, format: 'layer-prefix/v2' })).toBe(
        true,
      )
    }
  })

  it('validates scrambles of the sizes above 7', () => {
    for (let size = 8; size <= 15; size++) {
      const moves = generateScrambleMoves(
        size,
        { length: 'long', innerLayers: true },
        (() => {
          let n = 0
          return () => ((n = (n * 7919 + 13) % 1009) + 0.5) / 1009
        })(),
      )
      const payload = JSON.parse(cubeLabMovesJson(moves, size))
      expect(validateV2(payload), JSON.stringify(validateV2.errors)).toBe(true)
    }
  })

  it('rejects what v2 does not allow', () => {
    const good = { size: 12, moves: "10-12Rw 11U'", format: 'layer-prefix/v2' }
    expect(validateV2(good)).toBe(true)
    expect(validateV2({ ...good, size: 16 })).toBe(false)
    expect(validateV2({ ...good, size: 1 })).toBe(false)
    expect(validateV2({ ...good, moves: '16R' })).toBe(false)
    expect(validateV2({ ...good, moves: '1R' })).toBe(false)
    expect(validateV2({ ...good, moves: '0R' })).toBe(false)
    expect(validateV2({ ...good, moves: '10' })).toBe(false)
    expect(validateV2({ ...good, moves: '10-Rw' })).toBe(false)
    expect(validateV2({ ...good, moves: '1-2-3Rw' })).toBe(false)
    expect(validateV2({ ...good, moves: 'R  U' })).toBe(false)
    expect(validateV2({ ...good, format: 'layer-prefix/v1' })).toBe(false)
    expect(validate({ ...good, format: 'layer-prefix/v1' })).toBe(false)
  })

  it('keeps v1 closed to two-digit layers and sizes above 7', () => {
    const good = { size: 7, moves: "3Rw 2-3Uw'", format: 'layer-prefix/v1' }
    expect(validate(good)).toBe(true)
    expect(validate({ ...good, size: 8 })).toBe(false)
    expect(validate({ ...good, moves: '8R' })).toBe(false)
    expect(validate({ ...good, moves: '10R' })).toBe(false)
    expect(validate({ ...good, moves: '2-10Rw' })).toBe(false)
  })
})

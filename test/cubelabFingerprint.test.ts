import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import Ajv2020 from 'ajv/dist/2020.js'
import { describe, expect, it } from 'vitest'
import {
  cubeLabMovesJson,
  cubeLabMovesPayload,
  escapeScriptJson,
} from '../src/client/cubeLabFingerprint'
import { generateScrambleMoves } from '../src/cube/cubeMoves'

const schema = JSON.parse(
  readFileSync(
    join(__dirname, '../public/schemas/cubelab-fingerprint-v1.schema.json'),
    'utf8',
  ),
)
const validate = new Ajv2020({ allErrors: true }).compile(schema)

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

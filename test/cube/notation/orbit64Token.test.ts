import { describe, expect, it } from 'vitest'
import { parseCubeInput } from '../src/client/capture/captureFlow'
import { orbit64TokenOf } from '../src/client/notationCard'
import { createSolvedCube } from '../src/cube/cubeAssembly'
import type { CubeState, FaceKey } from '../src/cube/cubeAssembly'
import { applyCubeLayerMove } from '../src/cube/cubeMoves'
import { toURFFacelets } from '../src/cube/notation/NotationOutput.gen'
import {
  decodeOrbit64Token,
  encodeOrbit64Token,
  looksLikeOrbit64Token,
} from '../src/cube/notation/orbit64Token'
import { decodeOrbit64V2State } from '../src/cube/notation/orbit64V2'
import examples from './cube/notation/orbit64Vectors.json'
import largeExamples from './cube/notation/orbit64LargeVectors.json'

const sizes = Array.from({ length: 14 }, (_, i) => i + 2)
const faces: FaceKey[] = ['U', 'R', 'F', 'D', 'L', 'B']

// A deterministic scramble that turns every layer depth of every face.
function scrambled(n: number): CubeState {
  let cube = createSolvedCube(n)
  let k = 1
  for (let depth = 1; depth <= n; depth++) {
    for (const face of faces) {
      k = (k * 7 + depth) % 11
      cube = applyCubeLayerMove(cube, n, face, depth, (k % 3) + 1)
    }
  }
  return cube
}

describe('Orbit64 token in the UI layer, sizes 2 to 15', () => {
  it.each(sizes)('shows a token of a solved cube of size %s', (n) => {
    const token = orbit64TokenOf(createSolvedCube(n))
    expect(token).not.toBeNull()
    expect(looksLikeOrbit64Token(token as string)).toBe(true)
  })

  it.each(sizes)('round-trips token and facelets at size %s', (n) => {
    for (const cube of [createSolvedCube(n), scrambled(n)]) {
      const urf = toURFFacelets(cube)
      const token = orbit64TokenOf(cube)
      expect(token).toBe(encodeOrbit64Token(urf))
      expect(decodeOrbit64Token(token as string)).toBe(urf)
      expect(parseCubeInput(` ${token} `, 'wrg')).toEqual({
        ok: true,
        cube,
        format: 'urf',
      })
    }
  })

  it.each(sizes)('writes a framed color token at size %s', (n) => {
    const token = orbit64TokenOf(scrambled(n)) as string
    const decoded = decodeOrbit64V2State(token)
    if (decoded.TAG === 'Error') throw new Error(decoded._0)
    expect(decoded._0.entry).toMatchObject({
      n,
      model: 'Color',
      pose: 'Framed',
    })
  })

  it('keeps the whole-cube orientation of an odd cube', () => {
    const cube = applyCubeLayerMove(createSolvedCube(9), 9, 'U', 9)
    const token = orbit64TokenOf(cube) as string
    expect(parseCubeInput(token, 'urf')).toMatchObject({ ok: true, cube })
  })

  it.each(
    [...examples, ...largeExamples].filter(([token]) => token.length !== 43),
  )('writes the published V1 token %s unchanged', (token, facelets) => {
    expect(encodeOrbit64Token(facelets)).toBe(token)
    expect(decodeOrbit64Token(token)).toBe(facelets)
  })

  it('refuses a token that is no color cube of the range', () => {
    const v1Five = ([...examples, ...largeExamples].find(
      ([t]) => t.length === 43,
    ) ?? [''])[0]
    expect(v1Five).toHaveLength(43)
    expect(decodeOrbit64Token(v1Five)).toBeNull()
    const refused = parseCubeInput(v1Five, 'urf')
    expect(refused.ok).toBe(false)
    if (!refused.ok) expect(refused.message).toContain('2×2–15×15')
    expect(decodeOrbit64Token('A'.repeat(7))).toBeNull()
    expect(encodeOrbit64Token('UUUU RRRR FFFF DDDD LLLL')).toBeNull()
    const sixteen = ['U', 'R', 'F', 'D', 'L', 'B']
      .map((f) => f.repeat(256))
      .join(' ')
    expect(encodeOrbit64Token(sixteen)).toBeNull()
  })

  it('tells tokens from facelets', () => {
    expect(looksLikeOrbit64Token(' AAAAA ')).toBe(true)
    expect(looksLikeOrbit64Token('UUUU RRRR FFFF DDDD LLLL BBBB')).toBe(false)
    expect(looksLikeOrbit64Token('U'.repeat(24))).toBe(false)
  })

  it('refuses facelets that are no reachable cube', () => {
    const urf = toURFFacelets(createSolvedCube(8)).replace('U', 'R')
    expect(encodeOrbit64Token(urf)).toBeNull()
  })
})

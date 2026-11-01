import { describe, expect, it } from 'vitest'
import {
  decodeOrbit64V2State,
  encodeOrbit64V2State,
  type Orbit64V2Cube,
  type Orbit64V2Pose,
  orbit64V2Entries,
  orbit64V2Entry,
  orbit64V2Solved,
} from '../../../src/cube/notation/orbit64V2'
import {
  decodeOrbit64V2Facelets,
  encodeOrbit64V2Facelets,
  orbit64V2FrameFaces,
  orbit64V2FromFacelets,
  orbit64V2Slots,
  orbit64V2ToFacelets,
} from '../../../src/cube/notation/orbit64V2Facelets'
import pictures from './orbit64V2FaceletPictures.json'

type Result<T> = { TAG: 'Ok'; _0: T } | { TAG: 'Error'; _0: string }

function ok<T>(result: Result<T>): T {
  if (result.TAG === 'Error') throw new Error(result._0)
  return result._0
}

const error = (result: Result<unknown>): string =>
  result.TAG === 'Error' ? result._0 : 'accepted'

const alphabet =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
const pictureEntries = orbit64V2Entries.filter((e) => e.model === 'Picture')
const rows = pictures.rows

// The solved picture of a size, from the reference rows (no moves).
function solvedPicture(n: number): string {
  const entry = pictureEntries.find((e) => e.n === n && e.pose === 'Framed')
  const row = rows.find((r) => r.id === entry?.id && r.moves === '')
  if (row === undefined) throw new Error(`no solved row for ${n}`)
  return row.facelets
}

// The same string with the symbols at the given facelet indices (spaces not
// counted) replaced.
function put(text: string, edits: Record<number, string>): string {
  const compact = text.replaceAll(' ', '').split('')
  for (const [index, symbol] of Object.entries(edits)) {
    compact[Number(index)] = symbol
  }
  const n = Math.sqrt(compact.length / 6)
  return [0, 1, 2, 3, 4, 5]
    .map((face) => compact.slice(face * n * n, (face + 1) * n * n).join(''))
    .join(' ')
}

const at = (text: string, index: number): string =>
  text.replaceAll(' ', '')[index]

// The string with the symbols at two facelets exchanged.
const swap = (text: string, i: number, j: number): string =>
  put(text, { [i]: at(text, j), [j]: at(text, i) })

const read = (
  n: number,
  text: string,
  pose: Orbit64V2Pose = 'Framed',
): string => error(orbit64V2FromFacelets(n, 'Picture', pose, text))

const slotsOf = (n: number) => {
  const slots = orbit64V2Slots(n)
  if (slots === undefined) throw new Error(`${n}`)
  return slots
}

describe('Orbit64 V2 picture facelet reference rows', () => {
  it('has the rows of the reference repository', () => {
    expect(rows).toHaveLength(pictures.rowCount)
    expect(rows).toHaveLength(174)
    // Every picture entry has rows, and no other entry has.
    expect(new Set(rows.map((row) => row.id))).toEqual(
      new Set(pictureEntries.map((e) => e.id)),
    )
    expect(pictureEntries).toHaveLength(26)
  })

  // The generator checks this too. Pinned, because dropping both rows of a
  // move sequence keeps the structure below intact. Change the numbers
  // together with the reference input.
  it('has the pinned number of move sequences per size', () => {
    const sequences: Record<number, number> = {
      3: 41,
      4: 4,
      5: 5,
      6: 4,
      7: 5,
      8: 3,
      9: 4,
      10: 3,
      11: 4,
      12: 3,
      13: 4,
      14: 3,
      15: 4,
    }
    const seen = new Map<number, Set<string>>()
    for (const { id, moves } of rows) {
      const n = orbit64V2Entry(id)?.n ?? 0
      seen.set(n, (seen.get(n) ?? new Set<string>()).add(moves))
    }
    expect(
      Object.fromEntries([...seen].map(([n, set]) => [n, set.size])),
    ).toEqual(sequences)
    expect(Object.values(sequences).reduce((a, b) => a + b, 0) * 2).toBe(174)
  })

  it('has every move sequence once for each picture entry of its size', () => {
    const bySequence = new Map<string, number[]>()
    for (const { id, moves } of rows) {
      const n = orbit64V2Entry(id)?.n ?? 0
      const key = `${n} ${moves}`
      bySequence.set(key, [...(bySequence.get(key) ?? []), id])
    }
    for (const [key, ids] of bySequence) {
      const n = Number(key.split(' ')[0])
      expect(
        ids.sort((a, b) => a - b),
        key,
      ).toEqual(pictureEntries.filter((e) => e.n === n).map((e) => e.id))
    }
    expect(bySequence.size).toBe(87)
  })

  it('writes every row at the length of its entry, in base64url', () => {
    for (const { id, token, facelets } of rows) {
      const entry = orbit64V2Entry(id)
      expect(token).toHaveLength(entry?.length ?? -1)
      const n = entry?.n ?? 0
      expect(facelets.split(' ')).toHaveLength(6)
      expect(facelets.replaceAll(' ', '')).toHaveLength(6 * n * n)
      expect(facelets).toMatch(/^[A-Za-z0-9_ -]+$/)
    }
  })

  it('exercises whole-cube turns, slices and fixed center rotations', () => {
    const three = rows.filter((row) => row.id === 4)
    for (const moves of ['x', 'y', 'z', 'x2', "y'", '2R', "2U'", '2F2']) {
      expect(
        three.some((row) => row.moves === moves),
        moves,
      ).toBe(true)
    }
    // Some row of an odd cube has a quarter turned fixed center.
    expect(
      rows.some((row) => {
        const entry = orbit64V2Entry(row.id)
        if (entry === undefined || entry.n % 2 === 0) return false
        const n = entry.n
        const center = (n * n - 1) / 2
        const compact = row.facelets.replaceAll(' ', '')
        return [0, 1, 2, 3, 4, 5].some(
          (f) => alphabet.indexOf(compact[f * n * n + center]) % 4 !== 0,
        )
      }),
    ).toBe(true)
  })

  it('encodes every row facelet string to its token', () => {
    for (const { id, moves, facelets, token } of rows) {
      expect(encodeOrbit64V2Facelets(id, facelets), `${id} ${moves}`).toEqual({
        TAG: 'Ok',
        _0: token,
      })
    }
  })

  it('decodes every row token to its facelet string', () => {
    for (const { id, moves, facelets, token, canonical } of rows) {
      const decoded = ok(decodeOrbit64V2Facelets(token))
      expect(decoded.entry.id, `${id} ${moves}`).toBe(id)
      expect(decoded.facelets, `${id} ${moves}`).toBe(
        canonical === '' ? facelets : canonical,
      )
    }
  })

  it('reads a canonical row in any orientation as the same cube', () => {
    const turned = rows.filter((row) => row.canonical !== '')
    expect(turned.length).toBeGreaterThan(0)
    for (const { id, moves, facelets, canonical } of turned) {
      const entry = orbit64V2Entry(id)
      if (entry === undefined) throw new Error(`${id}`)
      expect(entry.pose, `${id} ${moves}`).toBe('Canonical')
      expect(facelets, `${id} ${moves}`).not.toBe(canonical)
      const cube = ok(
        orbit64V2FromFacelets(entry.n, 'Picture', 'Canonical', canonical),
      )
      expect(
        orbit64V2FromFacelets(entry.n, 'Picture', 'Canonical', facelets),
        `${id} ${moves}`,
      ).toEqual({ TAG: 'Ok', _0: cube })
    }
  })

  it('reads and writes the cube of every row in both directions', () => {
    for (const { id, moves, facelets, token } of rows) {
      const entry = orbit64V2Entry(id)
      if (entry === undefined) throw new Error(`${id}`)
      const cube = ok(
        orbit64V2FromFacelets(entry.n, 'Picture', entry.pose, facelets),
      )
      expect(decodeOrbit64V2State(token), `${id} ${moves}`).toEqual({
        TAG: 'Ok',
        _0: { entry, cube },
      })
      if (entry.pose === 'Framed') {
        expect(
          orbit64V2ToFacelets(entry.n, 'Picture', 'Framed', cube),
          `${id} ${moves}`,
        ).toEqual({ TAG: 'Ok', _0: facelets })
      }
    }
  })

  it('ignores spaces when reading', () => {
    for (const { id, facelets, token } of rows) {
      expect(encodeOrbit64V2Facelets(id, facelets.replaceAll(' ', ''))).toEqual(
        { TAG: 'Ok', _0: token },
      )
      expect(
        encodeOrbit64V2Facelets(id, ` ${facelets.replaceAll(' ', '  ')}  `),
      ).toEqual({ TAG: 'Ok', _0: token })
    }
  })

  it('writes the solved cube of every picture entry as the solved token', () => {
    for (const e of pictureEntries) {
      const text = solvedPicture(e.n)
      expect(
        ok(
          orbit64V2ToFacelets(
            e.n,
            'Picture',
            e.pose,
            orbit64V2Solved(e.n, 'Picture'),
          ),
        ),
      ).toBe(text)
      const token = ok(encodeOrbit64V2Facelets(e.id, text))
      expect(token).toBe(tokenOfOffset(e))
      expect(ok(decodeOrbit64V2Facelets(token))).toEqual({
        entry: e,
        facelets: text,
      })
    }
  })

  it('writes the documented solved 3x3x3', () => {
    // FORMAT-V2.md, "Picture facelets": the example string.
    expect(solvedPicture(3)).toBe(
      'GGJEAADCA BBLREXOJW EDCSIQRLN PKMMMISOV HFFVQTUNQ KHIWUUXPT',
    )
    // The U field: the center is A (fixed center U, rotation 0), the corners G
    // (6), J (9), D (3) and A (0), the midges G, E, A and C.
    expect(solvedPicture(3).split(' ')[0]).toBe('GGJEAADCA')
  })

  it('round-trips a state in the middle of every picture entry', () => {
    for (const e of pictureEntries) {
      const rank = (e.count * 7919n) / 10007n
      const digits = tokenOfValue(e.offset + rank, e.length)
      const { cube } = ok(decodeOrbit64V2State(digits))
      const text = ok(orbit64V2ToFacelets(e.n, 'Picture', e.pose, cube))
      expect(
        ok(orbit64V2FromFacelets(e.n, 'Picture', e.pose, text)),
        `${e.id}`,
      ).toEqual(cube)
      expect(encodeOrbit64V2Facelets(e.id, text), `${e.id}`).toEqual({
        TAG: 'Ok',
        _0: digits,
      })
      expect(ok(decodeOrbit64V2Facelets(digits)).facelets, `${e.id}`).toBe(text)
    }
  })
})

function tokenOfValue(value: bigint, length: number): string {
  let token = ''
  for (let v = value, i = 0; i < length; i++, v /= 64n) {
    token = alphabet[Number(v % 64n)] + token
  }
  return token
}

const tokenOfOffset = (e: { offset: bigint; length: number }): string =>
  tokenOfValue(e.offset, e.length)

describe('Orbit64 V2 picture frames and fixed centers', () => {
  const oddSizes = [3, 5, 7, 9, 11, 13, 15]

  it('shows the faces of each frame as the pieces of the fixed centers', () => {
    for (const n of oddSizes) {
      const center = (n * n - 1) / 2
      for (const [rank, faces] of orbit64V2FrameFaces.entries()) {
        const cube = { ...orbit64V2Solved(n, 'Picture'), frame: rank }
        const text = ok(orbit64V2ToFacelets(n, 'Picture', 'Framed', cube))
        const compact = text.replaceAll(' ', '')
        // The piece of a fixed center is its home face: the symbol div 4.
        const shown = [0, 1, 2, 3, 4, 5]
          .map(
            (f) => 'URFDLB'[alphabet.indexOf(compact[f * n * n + center]) >> 2],
          )
          .join('')
        expect(shown, `${n} frame ${rank}`).toBe(faces)
        const back = ok(orbit64V2FromFacelets(n, 'Picture', 'Framed', text))
        expect(back, `${n} frame ${rank}`).toEqual(cube)
        // A canonical read of the same string turns the frame away.
        expect(
          ok(orbit64V2FromFacelets(n, 'Picture', 'Canonical', text)).frame,
          `${n} frame ${rank}`,
        ).toBe(0)
      }
    }
  })

  it('writes a canonical fixed center with its rotation in the symbol', () => {
    for (const n of oddSizes) {
      const center = (n * n - 1) / 2
      for (let r = 0; r < 4; r++) {
        // Rotation r on every face but two: the sum of the rotations is even.
        const rotations = [r, r, 0, 0, 0, 0]
        const cube = { ...orbit64V2Solved(n, 'Picture'), rotations }
        const text = ok(orbit64V2ToFacelets(n, 'Picture', 'Canonical', cube))
        const compact = text.replaceAll(' ', '')
        expect(
          [0, 1, 2, 3, 4, 5].map((f) => compact[f * n * n + center]),
          `${n} ${r}`,
        ).toEqual([0, 1, 2, 3, 4, 5].map((f) => alphabet[4 * f + rotations[f]]))
        expect(
          ok(orbit64V2FromFacelets(n, 'Picture', 'Canonical', text)).rotations,
          `${n} ${r}`,
        ).toEqual(rotations)
      }
    }
  })

  it('shows the quarter turn of the documented example', () => {
    // FORMAT-V2.md: turning the U center a quarter turn writes B there; with
    // the R center turned too the symbols are B (4 * 0 + 1) and F (4 * 1 + 1).
    const solved = solvedPicture(3)
    const cube = {
      ...orbit64V2Solved(3, 'Picture'),
      rotations: [1, 1, 0, 0, 0, 0],
    }
    expect(ok(orbit64V2ToFacelets(3, 'Picture', 'Canonical', cube))).toBe(
      put(solved, { 4: 'B', 13: 'F' }),
    )
    expect(read(3, put(solved, { 4: 'B' }))).toBe(
      'fixed-center rotation parity must equal corner parity',
    )
  })

  it('turns the rotation of a fixed center with the whole cube', () => {
    // After `x` the cube shows F R D B L U in its slots; the fixed centers
    // keep their pieces and the U and D slots' symbols are measured again.
    const row = rows.find((r) => r.id === 5 && r.moves === 'x')
    const canonical = rows.find((r) => r.id === 4 && r.moves === 'x')
    if (row === undefined || canonical === undefined) throw new Error('x')
    const cube = ok(orbit64V2FromFacelets(3, 'Picture', 'Framed', row.facelets))
    expect(orbit64V2FrameFaces[cube.frame]).toBe('FRDBLU')
    expect(canonical.canonical).toBe(solvedPicture(3))
  })
})

describe('Orbit64 V2 picture facelet bridge rejects invalid input', () => {
  const solved3 = solvedPicture(3)

  it('accepts the solved cubes', () => {
    expect(read(3, solved3)).toBe('accepted')
    expect(read(3, solved3, 'Canonical')).toBe('accepted')
    for (let n = 3; n <= 15; n++) {
      expect(read(n, solvedPicture(n)), `${n}`).toBe('accepted')
      expect(read(n, solvedPicture(n), 'Canonical'), `${n}`).toBe('accepted')
    }
  })

  it('says the 2x2x2 has no picture entry', () => {
    const why =
      'the 2x2x2 has no picture entry: its picture model is the color model'
    expect(read(2, 'AAAA')).toBe(why)
    expect(read(2, 'UUUU RRRR FFFF DDDD LLLL BBBB', 'Canonical')).toBe(why)
    expect(
      error(
        orbit64V2ToFacelets(
          2,
          'Picture',
          'Framed',
          orbit64V2Solved(2, 'Color'),
        ),
      ),
    ).toBe(why)
    // The size comes first.
    expect(read(16, solved3)).toBe('no V2 type for the 16x16x16')
    expect(read(1, solved3)).toBe('no V2 type for the 1x1x1')
  })

  it('rejects a wrong number of symbols', () => {
    expect(read(3, 'GGJ')).toBe('expected 54 facelets for the 3x3x3, got 3')
    expect(read(3, '')).toBe('expected 54 facelets for the 3x3x3, got 0')
    expect(read(3, `${solved3}A`)).toBe(
      'expected 54 facelets for the 3x3x3, got 55',
    )
    expect(read(3, solved3.slice(0, -1))).toBe(
      'expected 54 facelets for the 3x3x3, got 53',
    )
    expect(read(4, solved3)).toBe('expected 96 facelets for the 4x4x4, got 54')
    expect(read(15, solved3)).toBe(
      'expected 1350 facelets for the 15x15x15, got 54',
    )
  })

  it('rejects a character outside the base64url alphabet', () => {
    const bad = (text: string, shown: string) =>
      expect(read(3, text), JSON.stringify(shown)).toBe(
        `facelet '${shown}' is not a base64url symbol`,
      )
    for (const c of ['#', '=', '+', '/', '.', '%', '*', 'é', ' ']) {
      bad(put(solved3, { 0: c }), c)
    }
    bad(solved3.replace(' ', '\t'), '\t')
    bad(solved3.replace(' ', '\n'), '\n')
    bad(solved3.replace(' ', '\r\n'), '\r')
    bad(solved3.replace(' ', ' '), ' ')
    bad(put(solved3, { 3: '\u{1f9ca}' }), '\u{1f9ca}')
    bad(put(solved3, { 3: '\ud800' }), '\ud800')
    bad(put(solved3, { 3: '\u0000' }), '\u0000')
    // Every symbol of the alphabet is read.
    for (const c of alphabet) {
      expect(read(3, put(solved3, { 0: c })), c).not.toMatch(/base64url/)
    }
  })

  it('names a bad character before a wrong length and the first of several', () => {
    expect(read(3, '#')).toBe("facelet '#' is not a base64url symbol")
    expect(read(3, `${solved3}A=`)).toBe(
      "facelet '=' is not a base64url symbol",
    )
    expect(read(3, put(solved3, { 7: '+', 2: '/' }))).toBe(
      "facelet '/' is not a base64url symbol",
    )
    expect(read(3, `${'A'.repeat(54)}#`)).toBe(
      "facelet '#' is not a base64url symbol",
    )
  })

  it('rejects a sticker of the wrong piece type', () => {
    // Symbol Y is 24: no corner, midge, center or fixed center has that many
    // stickers. Facelets 0, 1 and 4 of the 3x3x3 are a corner, a midge and the
    // U center.
    expect(read(3, put(solved3, { 0: 'Y' }))).toBe(
      "facelet 0 shows 'Y', which is no corner sticker",
    )
    expect(read(3, put(solved3, { 1: 'Y' }))).toBe(
      "facelet 1 shows 'Y', which is no midge sticker",
    )
    expect(read(3, put(solved3, { 4: 'Y' }))).toBe(
      "facelet 4 shows 'Y', which is no fixed center sticker",
    )
    expect(read(3, put(solved3, { 0: '_' }))).toBe(
      "facelet 0 shows '_', which is no corner sticker",
    )
    const solved5 = solvedPicture(5)
    // Wings have 48 stickers, so `v` (47) is in range and `w` (48) is not.
    const wing = slotsOf(5).wings[0][0][0]
    expect(read(5, put(solved5, { [wing]: 'w' }))).toBe(
      `facelet ${wing} shows 'w', which is no wing sticker`,
    )
    expect(read(5, put(solved5, { [wing]: 'v' }))).not.toMatch(
      /no wing sticker/,
    )
    const center = slotsOf(5).centers[0][0]
    expect(read(5, put(solved5, { [center]: 'Y' }))).toBe(
      `facelet ${center} shows 'Y', which is no center sticker`,
    )
    expect(read(5, put(solved5, { [center]: 'X' }))).not.toMatch(
      /no center sticker/,
    )
    // The boundary of the corner class: X (23) is in range, Y (24) is not.
    expect(read(3, put(solved3, { 0: 'X' }))).not.toMatch(/no corner sticker/)
  })

  it('rejects a sticker that is shown twice', () => {
    // Facelet 0 gets the symbol of the corner sticker A at facelet 8.
    expect(read(3, put(solved3, { 0: 'A' }))).toBe(
      "corner sticker 'A' occurs more than once",
    )
    expect(read(3, put(solved3, { 1: 'A' }))).toBe(
      "midge sticker 'A' occurs more than once",
    )
    // Two fixed centers that differ only in rotation are still one piece.
    expect(read(3, put(solved3, { 4: 'B', 13: 'B' }))).toBe(
      "fixed center sticker 'B' occurs more than once",
    )
    expect(read(3, put(solved3, { 4: 'A', 13: 'B' }))).toBe(
      "fixed center sticker 'A' occurs more than once",
    )
    const solved4 = solvedPicture(4)
    const slots4 = slotsOf(4)
    const copy = (to: number, from: number) =>
      put(solved4, { [to]: at(solved4, from) })
    expect(read(4, copy(slots4.centers[0][0], slots4.centers[0][1]))).toBe(
      `center sticker '${at(solved4, slots4.centers[0][1])}' occurs more than once`,
    )
    expect(read(4, copy(slots4.wings[0][0][0], slots4.wings[0][1][0]))).toBe(
      `wing sticker '${at(solved4, slots4.wings[0][1][0])}' occurs more than once`,
    )
  })

  it('names the first failure of a step in the order of the format', () => {
    const solved5 = solvedPicture(5)
    const slots5 = slotsOf(5)
    // Classes: corner before midge.
    expect(read(3, put(solved3, { 0: 'A', 1: 'Y' }))).toBe(
      "corner sticker 'A' occurs more than once",
    )
    // Midge before fixed center.
    expect(read(3, put(solved3, { 1: 'Y', 4: 'Y' }))).toBe(
      "facelet 1 shows 'Y', which is no midge sticker",
    )
    // Within a class a range error comes before a repeat, wherever they sit.
    expect(read(3, put(solved3, { 0: 'A', 2: 'Y' }))).toBe(
      "facelet 2 shows 'Y', which is no corner sticker",
    )
    expect(read(3, put(solved3, { 2: 'Y', 0: 'A' }))).toBe(
      "facelet 2 shows 'Y', which is no corner sticker",
    )
    // The first out-of-range facelet in slot order, not in facelet order: the
    // URF corner's facelets 8, 9 and 20 come before facelet 17 of slot 1.
    const corner = slotsOf(3).corners
    expect(
      read(3, put(solved3, { [corner[1][0]]: 'Z', [corner[0][2]]: 'Y' })),
    ).toBe(`facelet ${corner[0][2]} shows 'Y', which is no corner sticker`)
    // Wings: the outermost orbit before the next one, then center orbits in
    // order, then the fixed centers.
    const solved6 = solvedPicture(6)
    const slots6 = slotsOf(6)
    expect(
      read(
        6,
        put(solved6, {
          [slots6.wings[1][0][0]]: 'w',
          [slots6.wings[0][0][0]]: 'x',
        }),
      ),
    ).toBe(
      `facelet ${slots6.wings[0][0][0]} shows 'x', which is no wing sticker`,
    )
    expect(
      read(
        6,
        put(solved6, {
          [slots6.centers[1][0]]: 'Y',
          [slots6.centers[0][0]]: 'Z',
        }),
      ),
    ).toBe(
      `facelet ${slots6.centers[0][0]} shows 'Z', which is no center sticker`,
    )
    // Wings before centers: a repeated wing sticker beats a bad center.
    expect(
      read(
        6,
        put(solved6, {
          [slots6.wings[1][0][0]]: 'C',
          [slots6.centers[0][0]]: 'Y',
        }),
      ),
    ).toBe("wing sticker 'C' occurs more than once")
    expect(
      read(
        5,
        put(solved5, { [slots5.centers[0][0]]: 'Y', [slots5.fixed[0]]: 'Y' }),
      ),
    ).toBe(
      `facelet ${slots5.centers[0][0]} shows 'Y', which is no center sticker`,
    )
    // Step 1 before step 2: a bad character before a repeated sticker.
    expect(read(3, put(solved3, { 0: 'A', 5: '#' }))).toBe(
      "facelet '#' is not a base64url symbol",
    )
    // Step 2 before step 3: a repeated sticker before a broken slot.
    expect(read(3, put(solved3, { 8: 'B', 9: 'A', 1: 'Y' }))).toBe(
      "facelet 1 shows 'Y', which is no midge sticker",
    )
  })

  it('rejects a slot whose symbols do not spell one piece', () => {
    // The U and R stickers of the URF corner exchanged: a mirrored corner.
    expect(read(3, swap(solved3, 8, 9))).toBe(
      'corner slot 0 shows BAC, which is no corner of this cube',
    )
    // The U sticker of UR and the R sticker of UF: two midges mixed.
    expect(read(3, swap(solved3, 5, 19))).toBe(
      'midge slot 0 shows ' +
        at(solved3, 19) +
        at(solved3, 10) +
        ', which is no midge of this cube',
    )
    // A wing with its two stickers exchanged is a twisted wing, and wings have
    // no twist.
    const solved4 = solvedPicture(4)
    const wing = slotsOf(4).wings[0][0]
    expect(read(4, swap(solved4, wing[0], wing[1]))).toBe(
      `wing slot 0 shows ${at(solved4, wing[1])}${at(solved4, wing[0])}, which is no wing of this cube`,
    )
    // Corners are checked before midges, midges before wings.
    expect(read(3, swap(swap(solved3, 8, 9), 5, 19))).toBe(
      'corner slot 0 shows BAC, which is no corner of this cube',
    )
  })

  it('rejects fixed centers that are no whole-cube frame', () => {
    const why = 'the six fixed centers are not a right-handed whole-cube frame'
    // The U and R centers exchanged: left-handed.
    expect(read(3, swap(solved3, 4, 13))).toBe(why)
    expect(read(3, swap(solved3, 4, 13), 'Canonical')).toBe(why)
    const center5 = slotsOf(5).fixed
    expect(read(5, swap(solvedPicture(5), center5[1], center5[4]))).toBe(why)
    // A frame is found by the pieces, not by the rotations.
    expect(read(3, put(solved3, { 4: 'B', 13: 'F' }))).toBe('accepted')
    // The frame check comes before the laws: R = C is broken too here.
    expect(read(3, put(swap(solved3, 4, 13), { 22: 'J' }))).toBe(why)
  })

  it('rejects a broken orientation law', () => {
    const solved = solved3
    // The URF corner turned in place: stickers A B C become B C A.
    expect(read(3, put(solved, { 8: 'B', 9: 'C', 20: 'A' }))).toBe(
      'corner twists must sum to 0 mod 3',
    )
    expect(read(3, put(solved, { 8: 'B', 9: 'C', 20: 'A' }), 'Canonical')).toBe(
      'corner twists must sum to 0 mod 3',
    )
    // The UR midge flipped: its two stickers exchanged.
    expect(read(3, swap(solved, 5, 10))).toBe('midge flips must sum to 0 mod 2')
    // The twist sum is checked before the flip sum.
    expect(read(3, put(swap(solved, 5, 10), { 8: 'B', 9: 'C', 20: 'A' }))).toBe(
      'corner twists must sum to 0 mod 3',
    )
  })

  it('rejects a broken parity relation', () => {
    // Two midges exchanged with everything on them: M odd, C even.
    expect(read(3, swap(swap(solved3, 5, 7), 10, 19))).toBe(
      'midge parity must equal corner parity',
    )
    // One fixed center turned a quarter: R odd, C even.
    expect(read(3, put(solved3, { 4: 'B' }))).toBe(
      'fixed-center rotation parity must equal corner parity',
    )
    expect(read(3, put(solved3, { 4: 'B' }), 'Canonical')).toBe(
      'fixed-center rotation parity must equal corner parity',
    )
    // Two center stickers of the 4x4x4 exchanged: Z odd, C even.
    const solved4 = solvedPicture(4)
    const center = slotsOf(4).centers[0]
    expect(read(4, swap(solved4, center[0], center[1]))).toBe(
      'a center orbit parity breaks the picture relation',
    )
    // M = C comes before R = C, and both before the center orbits.
    expect(read(3, put(swap(swap(solved3, 5, 7), 10, 19), { 4: 'B' }))).toBe(
      'midge parity must equal corner parity',
    )
    // The 5x5x5: M = C is broken by exchanging two midges.
    const solved5 = solvedPicture(5)
    expect(
      read(5, swap(solved5, slotsOf(5).midges[0][0], slotsOf(5).midges[1][0])),
    ).not.toBe('accepted')
  })
})

describe('Orbit64 V2 picture facelet bridge writes only states', () => {
  it('writes no facelets for a cube that is no state of its type', () => {
    const cube = orbit64V2Solved(3, 'Picture')
    expect(
      error(
        orbit64V2ToFacelets(3, 'Picture', 'Canonical', {
          ...cube,
          rotations: [1, 0, 0, 0, 0, 0],
        }),
      ),
    ).toBe('fixed-center rotation parity must equal corner parity')
    expect(
      error(
        orbit64V2ToFacelets(3, 'Picture', 'Canonical', {
          ...cube,
          rotations: [4, 0, 0, 0, 0, 0],
        }),
      ),
    ).toBe(
      'rotations must be 6 values in 0..3 on odd picture cubes and empty otherwise',
    )
    expect(
      error(
        orbit64V2ToFacelets(3, 'Picture', 'Canonical', { ...cube, frame: 1 }),
      ),
    ).toBe('frame must be 0..23 on odd framed cubes and 0 otherwise')
    // A color cube is no picture cube: its centers are multisets, its
    // rotations empty.
    expect(
      error(
        orbit64V2ToFacelets(
          5,
          'Picture',
          'Framed',
          orbit64V2Solved(5, 'Color'),
        ),
      ),
    ).toBe('a center orbit is not a valid color multiset or permutation of 24')
    expect(
      error(
        orbit64V2ToFacelets(4, 'Picture', 'Framed', {
          ...orbit64V2Solved(4, 'Picture'),
          centers: [[1, 0, ...Array.from({ length: 22 }, (_, i) => i + 2)]],
        }),
      ),
    ).toBe('a center orbit parity breaks the picture relation')
  })

  it('does not write a color cube as a picture or the other way round', () => {
    const color = orbit64V2Solved(3, 'Color')
    const picture = orbit64V2Solved(3, 'Picture')
    const rotations =
      'rotations must be 6 values in 0..3 on odd picture cubes and empty otherwise'
    expect(error(orbit64V2ToFacelets(3, 'Picture', 'Framed', color))).toBe(
      rotations,
    )
    expect(error(orbit64V2ToFacelets(3, 'Color', 'Framed', picture))).toBe(
      rotations,
    )
  })

  it('names an unknown entry and a color string for a picture entry', () => {
    expect(error(encodeOrbit64V2Facelets(-1, solvedPicture(3)))).toBe(
      'unknown registry entry -1',
    )
    expect(error(encodeOrbit64V2Facelets(54, solvedPicture(3)))).toBe(
      'unknown registry entry 54',
    )
    // The solved color string of the 3x3x3 is, as symbols, a repeated sticker.
    expect(
      error(
        encodeOrbit64V2Facelets(
          4,
          'UUUUUUUUU RRRRRRRRR FFFFFFFFF DDDDDDDDD LLLLLLLLL BBBBBBBBB',
        ),
      ),
    ).toBe("corner sticker 'U' occurs more than once")
    // A picture string is no color string: G is no face letter.
    expect(error(encodeOrbit64V2Facelets(2, solvedPicture(3)))).toBe(
      "facelet 'G' is not one of U R F D L B",
    )
  })
})

// A cube whose arrays answer differently on every read after the first.
describe('Orbit64 V2 picture facelet bridge reads a hostile cube once', () => {
  const solved = orbit64V2Solved(5, 'Picture')
  const expected = ok(orbit64V2ToFacelets(5, 'Picture', 'Framed', solved))

  // An array whose entries answer `later` from the second read on.
  function flip(values: number[], later: (i: number) => unknown): number[] {
    const reads = new Map<number, number>()
    return new Proxy(values, {
      get(target, key, receiver) {
        const value = Reflect.get(target, key, receiver) as unknown
        if (typeof key !== 'string' || !/^\d+$/.test(key)) return value
        const index = Number(key)
        const count = (reads.get(index) ?? 0) + 1
        reads.set(index, count)
        return count === 1 ? value : later(index)
      },
    })
  }

  it('paints the one-read view when entries change after the first read', () => {
    const fields = [
      'cornerPieces',
      'cornerTwists',
      'midgePieces',
      'midgeFlips',
    ] as const
    for (const field of fields) {
      const hostile = { ...solved, [field]: flip(solved[field], () => 7) }
      expect(
        orbit64V2ToFacelets(5, 'Picture', 'Framed', hostile as Orbit64V2Cube),
        field,
      ).toEqual({ TAG: 'Ok', _0: expected })
    }
    const arrays = {
      ...solved,
      wings: solved.wings.map((w) => flip(w, () => 3)),
      centers: solved.centers.map((c) => flip(c, () => 5)),
      rotations: flip(solved.rotations, () => 1),
    }
    expect(
      orbit64V2ToFacelets(5, 'Picture', 'Framed', arrays as Orbit64V2Cube),
    ).toEqual({ TAG: 'Ok', _0: expected })
  })

  it('does not accept a cube that is valid only on a later read', () => {
    const broken = { ...solved, rotations: [1, 0, 0, 0, 0, 0] }
    const fields = ['cornerPieces', 'centers', 'wings', 'rotations'] as const
    for (const field of fields) {
      let reads = 0
      const hostile = {
        ...broken,
        get [field]() {
          reads++
          return reads === 1 ? broken[field] : solved[field]
        },
      }
      expect(
        error(
          orbit64V2ToFacelets(5, 'Picture', 'Framed', hostile as Orbit64V2Cube),
        ),
        field,
      ).toBe('fixed-center rotation parity must equal corner parity')
    }
    // Entries valid from the second read on: still the first read decides.
    const later = {
      ...solved,
      rotations: flip([1, 0, 0, 0, 0, 0], () => 0),
    }
    expect(
      error(
        orbit64V2ToFacelets(5, 'Picture', 'Framed', later as Orbit64V2Cube),
      ),
    ).toBe('fixed-center rotation parity must equal corner parity')
  })

  it('reads the frame and every array length once', () => {
    let reads = 0
    const hostile = {
      ...solved,
      get frame() {
        reads++
        return reads === 1 ? 0 : 7
      },
    }
    expect(
      orbit64V2ToFacelets(5, 'Picture', 'Framed', hostile as Orbit64V2Cube),
    ).toEqual({ TAG: 'Ok', _0: expected })
    expect(reads).toBe(1)
    // A length that shrinks after the first read: the copy has the first length.
    let lengthReads = 0
    const shrinking = new Proxy(solved.cornerPieces, {
      get(target, key, receiver) {
        if (key === 'length') {
          lengthReads++
          return lengthReads === 1 ? 8 : 3
        }
        return Reflect.get(target, key, receiver) as unknown
      },
    })
    expect(
      orbit64V2ToFacelets(5, 'Picture', 'Framed', {
        ...solved,
        cornerPieces: shrinking,
      }),
    ).toEqual({ TAG: 'Ok', _0: expected })
    expect(lengthReads).toBe(1)
  })

  it('does not run caller code on an entry and does not accept a number object', () => {
    const ran: string[] = []
    const trick = {
      valueOf() {
        ran.push('valueOf')
        return 0
      },
      toString() {
        ran.push('toString')
        return '0'
      },
    }
    const variants: unknown[] = [
      trick,
      new Number(0),
      0n,
      '0',
      Symbol('0'),
      null,
      undefined,
      Number.NaN,
      -0.5,
      [0],
    ]
    for (const bad of variants) {
      const twists = [...solved.cornerTwists]
      twists[0] = bad as number
      expect(
        error(
          orbit64V2ToFacelets(5, 'Picture', 'Framed', {
            ...solved,
            cornerTwists: twists,
          }),
        ),
        String(typeof bad),
      ).toBe('corner twists must be 8 values in 0..2')
      const rotations = [...solved.rotations]
      rotations[3] = bad as number
      expect(
        error(
          orbit64V2ToFacelets(5, 'Picture', 'Framed', { ...solved, rotations }),
        ),
        String(typeof bad),
      ).toBe(
        'rotations must be 6 values in 0..3 on odd picture cubes and empty otherwise',
      )
      expect(
        error(
          orbit64V2ToFacelets(5, 'Picture', 'Framed', {
            ...solved,
            frame: bad as number,
          }),
        ),
        String(typeof bad),
      ).toBe('frame must be 0..23 on odd framed cubes and 0 otherwise')
    }
    expect(ran).toEqual([])
  })

  it('does not run caller code on a length', () => {
    const ran: string[] = []
    const lengths: unknown[] = [
      {
        valueOf() {
          ran.push('valueOf')
          return 8
        },
      },
      '8',
      8n,
      Number.NaN,
      -1,
      2.5,
      Number.POSITIVE_INFINITY,
      Symbol('8'),
    ]
    for (const length of lengths) {
      const hostile = new Proxy(solved.cornerPieces, {
        get(target, key, receiver) {
          return key === 'length'
            ? length
            : (Reflect.get(target, key, receiver) as unknown)
        },
      })
      expect(
        error(
          orbit64V2ToFacelets(5, 'Picture', 'Framed', {
            ...solved,
            cornerPieces: hostile,
          }),
        ),
        String(typeof length),
      ).toBe('corner pieces are not a permutation of 8')
    }
    expect(ran).toEqual([])
  })

  it('does bounded work for a huge length', () => {
    const started = Date.now()
    for (const length of [1e6, 2 ** 31, 2 ** 53, Number.MAX_VALUE]) {
      const huge = new Proxy(solved.cornerPieces, {
        get(target, key, receiver) {
          return key === 'length'
            ? length
            : (Reflect.get(target, key, receiver) as unknown)
        },
      })
      for (const field of ['cornerPieces', 'wings', 'centers', 'rotations']) {
        const cube = { ...solved, [field]: huge }
        expect(
          error(
            orbit64V2ToFacelets(5, 'Picture', 'Framed', cube as Orbit64V2Cube),
          ),
          `${field} ${length}`,
        ).not.toBe('accepted')
      }
      expect(
        error(
          orbit64V2ToFacelets(5, 'Picture', 'Framed', {
            ...solved,
            wings: { length } as unknown as number[][],
          }),
        ),
      ).toBe('malformed state')
      expect(
        encodeOrbit64V2State(20, {
          ...orbit64V2Solved(7, 'Picture'),
          centers: { length } as unknown as number[][],
        }).TAG,
      ).toBe('Error')
    }
    expect(Date.now() - started).toBeLessThan(2000)
  })
})

describe('Orbit64 V2 picture facelet bridge never throws', () => {
  it('reads a hostile string without throwing or echoing it', () => {
    const solved3 = solvedPicture(3)
    for (const bad of [
      undefined,
      null,
      5,
      {},
      ['A'],
      new String(solved3),
      Symbol('x'),
      3n,
      () => solved3,
    ]) {
      expect(
        error(
          orbit64V2FromFacelets(
            3,
            'Picture',
            'Framed',
            bad as unknown as string,
          ),
        ),
      ).toBe('facelets must be a string')
      expect(error(encodeOrbit64V2Facelets(4, bad as unknown as string))).toBe(
        'facelets must be a string',
      )
    }
  })

  it('names the length of a huge string without keeping it', () => {
    const solved3 = solvedPicture(3)
    const huge = 'A'.repeat(3_000_000)
    const started = Date.now()
    expect(read(3, huge)).toBe(
      'expected 54 facelets for the 3x3x3, got 3000000',
    )
    expect(read(3, ' '.repeat(3_000_000))).toBe(
      'expected 54 facelets for the 3x3x3, got 0',
    )
    // The first bad character wins over the length, wherever it is.
    expect(read(3, `${huge}#`)).toBe("facelet '#' is not a base64url symbol")
    expect(read(3, `${solved3}${' '.repeat(2_000_000)}`)).toBe('accepted')
    expect(read(15, 'A'.repeat(1350 + 1_000_000))).toBe(
      'expected 1350 facelets for the 15x15x15, got 1001350',
    )
    expect(Date.now() - started).toBeLessThan(5000)
  })

  it('returns an error for every mutated row, a bad pose or a bad size', () => {
    // A deterministic walk over the rows with single and double mutations.
    let seed = 12345
    const next = (bound: number): number => {
      seed = (Math.imul(seed, 1103515245) + 12345) >>> 0
      return (seed >>> 8) % bound
    }
    const extra = ['#', '\t', '\n', '\u{1f9ca}', '\ud800', ' ', '=', 'é']
    let accepted = 0
    for (const { id, facelets } of rows) {
      const entry = orbit64V2Entry(id)
      if (entry === undefined) throw new Error(`${id}`)
      const compact = facelets.replaceAll(' ', '').split('')
      for (let k = 0; k < 12; k++) {
        const mutated = compact.slice()
        const edits = 1 + next(3)
        for (let e = 0; e < edits; e++) {
          const i = next(mutated.length)
          const kind = next(4)
          if (kind === 0) mutated[i] = alphabet[next(64)]
          else if (kind === 1) mutated.splice(i, 1)
          else if (kind === 2) mutated.splice(i, 0, extra[next(extra.length)])
          else {
            const j = next(mutated.length)
            ;[mutated[i], mutated[j]] = [mutated[j], mutated[i]]
          }
        }
        const text = mutated.join('')
        const results = [
          orbit64V2FromFacelets(entry.n, 'Picture', entry.pose, text),
          orbit64V2FromFacelets(
            entry.n,
            'Picture',
            'Bogus' as Orbit64V2Pose,
            text,
          ),
          encodeOrbit64V2Facelets(id, text),
        ]
        for (const r of results) {
          expect(['Ok', 'Error']).toContain(r.TAG)
          if (r.TAG === 'Error') expect(typeof r._0).toBe('string')
        }
        if (results[0].TAG === 'Ok') accepted++
      }
    }
    // Some mutations (an exchange of equal symbols) are no change at all.
    expect(accepted).toBeLessThan(rows.length)
  })
})

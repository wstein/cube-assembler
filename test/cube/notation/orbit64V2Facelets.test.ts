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
import fixture from './orbit64V2Facelets.json'

type Result<T> = { TAG: 'Ok'; _0: T } | { TAG: 'Error'; _0: string }

function ok<T>(result: Result<T>): T {
  if (result.TAG === 'Error') throw new Error(result._0)
  return result._0
}

const error = (result: Result<unknown>): string =>
  result.TAG === 'Error' ? result._0 : 'accepted'

const colorEntries = orbit64V2Entries.filter((e) => e.model === 'Color')
const letters = ['U', 'R', 'F', 'D', 'L', 'B']

function solvedFacelets(n: number): string {
  return letters.map((c) => c.repeat(n * n)).join(' ')
}

// The same string with the facelet at `index` (spaces not counted) replaced.
function withFacelet(text: string, index: number, letter: string): string {
  const compact = text.replaceAll(' ', '').split('')
  compact[index] = letter
  const n = Math.sqrt(compact.length / 6)
  return letters
    .map((_, face) => compact.slice(face * n * n, (face + 1) * n * n).join(''))
    .join(' ')
}

describe('Orbit64 V2 slot tables', () => {
  const slotText = (text: string): number[][] =>
    text === '' ? [] : text.split(' | ').map((s) => s.split(' ').map(Number))

  it('has the 14 sizes of FORMAT-V2-SLOTS.md', () => {
    expect(Object.keys(fixture.slots)).toEqual(
      Array.from({ length: 14 }, (_, i) => String(i + 2)),
    )
  })

  it('equals the specification for n = 2..15', () => {
    for (let n = 2; n <= 15; n++) {
      const expected = fixture.slots[String(n) as keyof typeof fixture.slots]
      const actual = orbit64V2Slots(n)
      expect(actual, `${n}`).toBeDefined()
      expect(actual?.corners, `${n} corners`).toEqual(
        slotText(expected.corners),
      )
      expect(actual?.midges, `${n} midges`).toEqual(slotText(expected.midges))
      const wings = Object.entries(expected.wings as Record<string, string>)
      expect(actual?.wings, `${n} wings`).toEqual(
        wings.map(([, text]) => slotText(text)),
      )
      expect(
        wings.map(([depth]) => depth),
        `${n} depths`,
      ).toEqual(wings.map((_, i) => String(i + 1)))
      // The document lists one center orbit per line, a facelet per slot.
      expect(actual?.centers, `${n} centers`).toEqual(
        slotText(expected.centers),
      )
    }
  })

  it('assigns every facelet except the fixed centers to exactly one slot', () => {
    for (let n = 2; n <= 15; n++) {
      const slots = orbit64V2Slots(n)
      if (slots === undefined) throw new Error(`${n}`)
      const all = [
        ...slots.corners.flat(),
        ...slots.midges.flat(),
        ...slots.wings.flat(2),
        ...slots.centers.flat(),
        ...slots.fixed,
      ].sort((a, b) => a - b)
      expect(all, `${n}`).toEqual(
        Array.from({ length: 6 * n * n }, (_, i) => i),
      )
      expect(slots.fixed, `${n}`).toEqual(
        n % 2 === 1
          ? letters.map((_, face) => face * n * n + (n * n - 1) / 2)
          : [],
      )
    }
  })

  it('has no tables for sizes outside 2..15', () => {
    for (const n of [-1, 0, 1, 16, 2.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(orbit64V2Slots(n), String(n)).toBeUndefined()
    }
  })

  it('hands out copies', () => {
    const first = orbit64V2Slots(5)
    first?.corners[0].push(999)
    first?.fixed.push(999)
    expect(orbit64V2Slots(5)?.corners[0]).toEqual([24, 25, 54])
    expect(orbit64V2Slots(5)?.fixed).toHaveLength(6)
  })
})

describe('Orbit64 V2 frames', () => {
  // FORMAT.md: x turns, then z turns, then y turns. A turn moves the contents
  // of the slots: x (like R) carries F to U, z (like F) carries U to R and y
  // (like U) carries R to F.
  const turnX = (s: string[]) => [s[2], s[1], s[3], s[5], s[4], s[0]]
  const turnZ = (s: string[]) => [s[4], s[0], s[2], s[1], s[3], s[5]]
  const turnY = (s: string[]) => [s[0], s[5], s[1], s[3], s[2], s[4]]
  const again = (f: (s: string[]) => string[], k: number, s: string[]) => {
    let out = s
    for (let i = 0; i < k; i++) out = f(out)
    return out
  }
  const pose = (x: number, z: number, y: number) =>
    again(turnY, y, again(turnZ, z, again(turnX, x, letters))).join('')

  it('lists the 24 frames of the wire order', () => {
    const expected: string[] = []
    for (let x = 0; x < 4; x++) {
      for (let y = 0; y < 4; y++) expected.push(pose(x, 0, y))
    }
    for (const z of [1, 3]) {
      for (let y = 0; y < 4; y++) expected.push(pose(0, z, y))
    }
    expect([...orbit64V2FrameFaces]).toEqual(expected)
    expect(new Set(expected).size).toBe(24)
  })

  it('is frozen', () => {
    expect(Object.isFrozen(orbit64V2FrameFaces)).toBe(true)
  })

  // Every frame writes its fixed centers in the slots of its faces.
  it('shows the faces of each frame as the fixed centers of an odd cube', () => {
    for (const [rank, faces] of orbit64V2FrameFaces.entries()) {
      const cube = { ...orbit64V2Solved(3, 'Color'), frame: rank }
      const text = ok(orbit64V2ToFacelets(3, 'Color', 'Framed', cube))
      expect(
        text
          .split(' ')
          .map((field) => field[4])
          .join(''),
        faces,
      ).toBe(faces)
      expect(ok(orbit64V2FromFacelets(3, 'Color', 'Framed', text)).frame).toBe(
        rank,
      )
      expect(
        ok(orbit64V2FromFacelets(3, 'Color', 'Canonical', text)).frame,
      ).toBe(0)
    }
  })
})

describe('Orbit64 V2 facelet reference rows', () => {
  const rows = fixture.rows

  it('has the rows of the reference repository', () => {
    expect(rows).toHaveLength(fixture.rowCount)
    expect(rows.length).toBeGreaterThan(0)
    // Every color entry has rows, and picture entries have none.
    expect(new Set(rows.map((row) => row.id))).toEqual(
      new Set(colorEntries.map((e) => e.id)),
    )
  })

  // The generator checks this too: every move sequence of a size has one row
  // for each of the two color entries of that size, so a dropped row shows.
  // Pinned, because dropping both rows of a move sequence keeps the structure
  // below intact. Change them together with the reference input.
  it('has the pinned number of rows and move sequences per size', () => {
    const sequences: Record<number, number> = {
      2: 32,
      3: 41,
      4: 50,
      5: 59,
      6: 5,
      7: 5,
      8: 4,
      9: 4,
      10: 4,
      11: 4,
      12: 4,
      13: 4,
      14: 4,
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
    expect(rows).toHaveLength(448)
  })

  it('has every move sequence once for each color entry of its size', () => {
    const entriesOf = new Map<number, Set<number>>()
    const bySequence = new Map<string, number[]>()
    for (const { id, moves, facelets } of rows) {
      const n = orbit64V2Entry(id)?.n ?? 0
      expect(facelets.replaceAll(' ', '')).toHaveLength(6 * n * n)
      entriesOf.set(n, (entriesOf.get(n) ?? new Set<number>()).add(id))
      const key = `${n} ${moves}`
      bySequence.set(key, [...(bySequence.get(key) ?? []), id])
    }
    expect([...entriesOf.keys()]).toEqual(
      Array.from({ length: 14 }, (_, i) => i + 2),
    )
    for (const [n, ids] of entriesOf) {
      expect(
        [...ids].sort((a, b) => a - b),
        `${n}`,
      ).toEqual(colorEntries.filter((e) => e.n === n).map((e) => e.id))
    }
    for (const [key, ids] of bySequence) {
      const n = Number(key.split(' ')[0])
      expect(
        ids.sort((a, b) => a - b),
        key,
      ).toEqual(colorEntries.filter((e) => e.n === n).map((e) => e.id))
    }
  })

  it('writes every row at the length of its entry', () => {
    for (const { id, token, facelets } of rows) {
      const entry = orbit64V2Entry(id)
      expect(token).toHaveLength(entry?.length ?? -1)
      const n = entry?.n ?? 0
      expect(facelets.replaceAll(' ', '')).toHaveLength(6 * n * n)
    }
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
      const cube = ok(
        orbit64V2FromFacelets(entry.n, 'Color', 'Canonical', canonical),
      )
      expect(
        orbit64V2FromFacelets(entry.n, 'Color', 'Canonical', facelets),
        `${id} ${moves}`,
      ).toEqual({ TAG: 'Ok', _0: cube })
    }
  })

  it('reads and writes the cube of every row in both directions', () => {
    for (const { id, moves, facelets, token } of rows) {
      const entry = orbit64V2Entry(id)
      if (entry === undefined) throw new Error(`${id}`)
      const cube = ok(
        orbit64V2FromFacelets(entry.n, 'Color', entry.pose, facelets),
      )
      expect(decodeOrbit64V2State(token), `${id} ${moves}`).toEqual({
        TAG: 'Ok',
        _0: { entry, cube },
      })
      if (entry.pose === 'Framed') {
        expect(
          orbit64V2ToFacelets(entry.n, 'Color', 'Framed', cube),
          `${id} ${moves}`,
        ).toEqual({ TAG: 'Ok', _0: facelets })
      }
    }
  })

  it('ignores spaces when reading', () => {
    for (const { id, facelets, token } of rows.slice(0, 80)) {
      expect(encodeOrbit64V2Facelets(id, facelets.replaceAll(' ', ''))).toEqual(
        {
          TAG: 'Ok',
          _0: token,
        },
      )
      expect(
        encodeOrbit64V2Facelets(id, ` ${facelets.replaceAll(' ', '  ')}  `),
      ).toEqual({ TAG: 'Ok', _0: token })
    }
  })

  it('writes the solved cube of every color entry as the solved token', () => {
    for (const e of colorEntries) {
      const text = solvedFacelets(e.n)
      expect(
        ok(
          orbit64V2ToFacelets(
            e.n,
            'Color',
            e.pose,
            orbit64V2Solved(e.n, 'Color'),
          ),
        ),
      ).toBe(text)
      const token = ok(encodeOrbit64V2Facelets(e.id, text))
      expect(ok(decodeOrbit64V2Facelets(token))).toEqual({
        entry: e,
        facelets: text,
      })
      expect(token).toHaveLength(e.length)
    }
  })

  it('round-trips a state in the middle of every color entry', () => {
    for (const e of colorEntries) {
      const rank = (e.count * 7919n) / 10007n
      let digits = ''
      for (let v = e.offset + rank, i = 0; i < e.length; i++, v /= 64n) {
        digits =
          'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'[
            Number(v % 64n)
          ] + digits
      }
      const { cube } = ok(decodeOrbit64V2State(digits))
      const text = ok(orbit64V2ToFacelets(e.n, 'Color', e.pose, cube))
      expect(
        ok(orbit64V2FromFacelets(e.n, 'Color', e.pose, text)),
        `${e.id}`,
      ).toEqual(cube)
      expect(encodeOrbit64V2Facelets(e.id, text), `${e.id}`).toEqual({
        TAG: 'Ok',
        _0: digits,
      })
    }
  })
})

const sizeFault = 'the cube size is not an integer in 2..15'

describe('Orbit64 V2 facelet bridge rejects an invalid pose', () => {
  const solved3 = solvedFacelets(3)
  const poses = [
    'Bogus',
    'framed',
    'canonical',
    '',
    undefined,
    null,
    0,
    1,
    {},
    [],
  ]

  it('reads no pose but Canonical and Framed', () => {
    for (const pose of poses) {
      for (const [n, text] of [
        [3, solved3],
        [2, solvedFacelets(2)],
        [4, solvedFacelets(4)],
      ] as const) {
        expect(
          error(orbit64V2FromFacelets(n, 'Color', pose as Orbit64V2Pose, text)),
          `${n} ${JSON.stringify(pose)}`,
        ).toBe('unknown pose')
      }
    }
  })

  it('does not read the 2x2x2 string of an unknown pose as a cube', () => {
    // As a Bogus pose this used to read as corners [3, 0, 1, 2, 7, 4, 5, 6].
    expect(
      error(
        orbit64V2FromFacelets(
          2,
          'Color',
          'Bogus' as Orbit64V2Pose,
          'UUUU BBBB RRRR DDDD FFFF LLLL',
        ),
      ),
    ).toBe('unknown pose')
  })

  it('writes no facelets for an unknown pose', () => {
    for (const pose of poses) {
      expect(
        error(
          orbit64V2ToFacelets(
            3,
            'Color',
            pose as Orbit64V2Pose,
            orbit64V2Solved(3, 'Color'),
          ),
        ),
        JSON.stringify(pose),
      ).toBe('unknown pose')
    }
  })

  it('names the size before the model before the pose', () => {
    const bogus = 'Bogus' as Orbit64V2Pose
    expect(error(orbit64V2FromFacelets(16, 'Color', bogus, solved3))).toBe(
      'no V2 type for the 16x16x16',
    )
    expect(error(orbit64V2FromFacelets(3, 'Picture', bogus, solved3))).toBe(
      'the picture model has no letters',
    )
  })
})

describe('Orbit64 V2 facelet bridge rejects a hostile cube size', () => {
  const solved3 = solvedFacelets(3)
  const throwing = {
    toString() {
      throw new Error('toString')
    },
    valueOf() {
      throw new Error('valueOf')
    },
  }
  const sizes: unknown[] = [
    Object.create(null),
    throwing,
    3n,
    Symbol('3'),
    '3',
    [3],
    { valueOf: () => 3 },
    undefined,
    null,
    true,
  ]

  it('has no slot tables, and does not throw', () => {
    for (const n of sizes) {
      expect(orbit64V2Slots(n as number), String(typeof n)).toBeUndefined()
    }
  })

  it('says the size is not an integer in 2..15, echoing nothing', () => {
    for (const n of sizes) {
      const label = typeof n
      expect(
        error(orbit64V2FromFacelets(n as number, 'Color', 'Framed', solved3)),
        label,
      ).toBe(sizeFault)
      expect(
        error(
          orbit64V2ToFacelets(
            n as number,
            'Color',
            'Framed',
            orbit64V2Solved(3, 'Color'),
          ),
        ),
        label,
      ).toBe(sizeFault)
    }
  })
})

describe('Orbit64 V2 facelet bridge rejects invalid input', () => {
  const solved3 = solvedFacelets(3)
  const read = (text: string, pose: Orbit64V2Pose = 'Framed', n = 3) =>
    error(orbit64V2FromFacelets(n, 'Color', pose, text))

  it('accepts the solved 3x3x3', () => {
    expect(read(solved3)).toBe('accepted')
    expect(orbit64V2FromFacelets(3, 'Color', 'Framed', solved3).TAG).toBe('Ok')
  })

  it('rejects a wrong number of facelets', () => {
    expect(read('UUU')).toBe('expected 54 facelets for the 3x3x3, got 3')
    expect(read('')).toBe('expected 54 facelets for the 3x3x3, got 0')
    expect(read(`${solved3}U`)).toBe(
      'expected 54 facelets for the 3x3x3, got 55',
    )
    expect(read(solved3, 'Framed', 4)).toBe(
      'expected 96 facelets for the 4x4x4, got 54',
    )
  })

  it('rejects a letter outside U R F D L B, a tab and a newline included', () => {
    expect(read(withFacelet(solved3, 0, 'X'))).toBe(
      "facelet 'X' is not one of U R F D L B",
    )
    expect(read(withFacelet(solved3, 0, 'u'))).toBe(
      "facelet 'u' is not one of U R F D L B",
    )
    expect(read(solved3.replace(' ', '\t'))).toBe(
      "facelet '\t' is not one of U R F D L B",
    )
    expect(read(solved3.replace(' ', '\n'))).toBe(
      "facelet '\n' is not one of U R F D L B",
    )
    expect(read(solved3.replace(' ', '\r\n'))).toBe(
      "facelet '\r' is not one of U R F D L B",
    )
    expect(read(solved3.replace(' ', ' '))).toBe(
      "facelet ' ' is not one of U R F D L B",
    )
    expect(read(withFacelet(solved3, 3, '\u{1f9ca}'))).toBe(
      "facelet '\u{1f9ca}' is not one of U R F D L B",
    )
  })

  it('names a bad letter before a wrong length', () => {
    expect(read('X')).toBe("facelet 'X' is not one of U R F D L B")
  })

  it('rejects unbalanced color counts', () => {
    expect(read(withFacelet(solved3, 8, 'R'))).toBe(
      'color U occurs 8 times, expected 9',
    )
    expect(read(withFacelet(solvedFacelets(4), 0, 'B'), 'Canonical', 4)).toBe(
      'color U occurs 15 times, expected 16',
    )
    // All U: the first color to be wrong is named.
    expect(read('U'.repeat(54))).toBe('color U occurs 54 times, expected 9')
  })

  it('rejects fixed centers of the wrong handedness', () => {
    const handedness =
      'the six fixed centers are not a right-handed whole-cube frame'
    // The R and F centers exchanged.
    const swapped = withFacelet(withFacelet(solved3, 13, 'F'), 22, 'R')
    expect(read(swapped)).toBe(handedness)
    expect(read(swapped, 'Canonical')).toBe(handedness)
    // The L and R centers exchanged on a 5x5x5.
    let five = solvedFacelets(5)
    five = withFacelet(withFacelet(five, 25 + 12, 'L'), 100 + 12, 'R')
    expect(read(five, 'Framed', 5)).toBe(handedness)
    // The mirror image of the solved cube: R and L letters exchanged.
    const mirrored = solved3
      .replaceAll('R', 'x')
      .replaceAll('L', 'R')
      .replaceAll('x', 'L')
    expect(read(mirrored, 'Canonical')).toBe(handedness)
  })

  it('rejects a twisted corner', () => {
    const twist = 'corner twists must sum to 0 mod 3'
    // The URF corner turned in place.
    expect(
      read('UUUUUUUUF URRRRRRRR FFRFFFFFF DDDDDDDDD LLLLLLLLL BBBBBBBBB'),
    ).toBe(twist)
    expect(
      read(
        'UUUUUUUUF URRRRRRRR FFRFFFFFF DDDDDDDDD LLLLLLLLL BBBBBBBBB',
        'Canonical',
      ),
    ).toBe(twist)
    // The same on a 4x4x4, whose URF corner has facelets 15, 16 and 35.
    let four = solvedFacelets(4)
    four = withFacelet(
      withFacelet(withFacelet(four, 15, 'R'), 16, 'F'),
      35,
      'U',
    )
    expect(read(four, 'Framed', 4)).toBe(twist)
    expect(read(four, 'Canonical', 4)).toBe(twist)
  })

  it('rejects a flipped midge', () => {
    // The U and R stickers of the UR edge exchanged.
    expect(
      read('UUUUURUUU RURRRRRRR FFFFFFFFF DDDDDDDDD LLLLLLLLL BBBBBBBBB'),
    ).toBe('midge flips must sum to 0 mod 2')
    expect(
      read(
        'UUUUURUUU RURRRRRRR FFFFFFFFF DDDDDDDDD LLLLLLLLL BBBBBBBBB',
        'Canonical',
      ),
    ).toBe('midge flips must sum to 0 mod 2')
  })

  it('rejects a slot that shows no piece of the cube', () => {
    // The U and R stickers of the URF corner exchanged: a mirrored corner.
    expect(
      read('UUUUUUUUR URRRRRRRR FFFFFFFFF DDDDDDDDD LLLLLLLLL BBBBBBBBB'),
    ).toBe('corner slot 0 shows RUF, which is no corner of this cube')
    // The B sticker of the UB wing and a D sticker exchanged: slot 0 shows UD.
    let four = solvedFacelets(4)
    four = withFacelet(withFacelet(four, 82, 'D'), 49, 'B')
    expect(read(four, 'Framed', 4)).toBe(
      'wing slot 0 shows UD, which is no wing of this cube',
    )
    // A midge with two stickers of one color.
    let three = withFacelet(solved3, 10, 'U')
    three = withFacelet(three, 1, 'R')
    expect(read(three)).toBe(
      'midge slot 0 shows UU, which is no midge of this cube',
    )
  })

  it('rejects a piece that is shown twice', () => {
    // The UFL corner shows the URF corner and the UR midge the UL midge:
    // every color count and every slot is fine, two pieces are doubled.
    let text = withFacelet(solved3, 18, 'R')
    text = withFacelet(text, 38, 'F')
    text = withFacelet(text, 10, 'L')
    expect(read(text)).toBe('corner pieces are not a permutation of 8')
    expect(read(text, 'Canonical')).toBe(
      'corner pieces are not a permutation of 8',
    )
    // A 4x4x4 wing doubled: slot 0 shows the wing of slot 20. The text is the
    // reference's for any wing orbit that is no permutation, kept for parity.
    const doubled = withFacelet(withFacelet(solvedFacelets(4), 1, 'B'), 82, 'U')
    expect(read(doubled, 'Framed', 4)).toBe(
      'expected 1 wing permutations of 24',
    )
  })

  it('rejects a mirrored cube', () => {
    // Mirror image without the mirrored color scheme: the left and right
    // letters exchanged on the 4x4x4, whose corners then run counterclockwise.
    const mirrored = solvedFacelets(4)
      .replaceAll('R', 'x')
      .replaceAll('L', 'R')
      .replaceAll('x', 'L')
    // On a 3x3x3 the fixed centers show the mirror first, in either pose.
    const mirrored3 = solved3
      .replaceAll('R', 'x')
      .replaceAll('L', 'R')
      .replaceAll('x', 'L')
    expect(read(mirrored3, 'Framed')).toBe(
      'the six fixed centers are not a right-handed whole-cube frame',
    )
    expect(read(mirrored, 'Canonical', 4)).toBe(
      'no whole-cube rotation puts the DBL corner home',
    )
    expect(read(mirrored, 'Framed', 4)).toBe(
      'corner slot 0 shows ULF, which is no corner of this cube',
    )
  })

  it('rejects types without letters', () => {
    expect(error(orbit64V2FromFacelets(3, 'Picture', 'Framed', solved3))).toBe(
      'the picture model has no letters',
    )
    for (const n of [16, 1, 0, -3]) {
      expect(
        error(orbit64V2FromFacelets(n, 'Color', 'Framed', solved3)),
        String(n),
      ).toBe(`no V2 type for the ${n}x${n}x${n}`)
    }
    for (const n of [2.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(
        error(orbit64V2FromFacelets(n, 'Color', 'Framed', solved3)),
        String(n),
      ).toBe(sizeFault)
    }
    expect(error(orbit64V2FromFacelets(16, 'Color', 'Framed', solved3))).toBe(
      'no V2 type for the 16x16x16',
    )
    const cube = orbit64V2Solved(3, 'Picture')
    expect(error(orbit64V2ToFacelets(3, 'Picture', 'Framed', cube))).toBe(
      'the picture model has no letters',
    )
    expect(error(orbit64V2ToFacelets(16, 'Color', 'Framed', cube))).toBe(
      'no V2 type for the 16x16x16',
    )
  })

  it('says why an entry or token has no facelets', () => {
    const picture = orbit64V2Entries.filter((e) => e.model === 'Picture')
    expect(picture.length).toBeGreaterThan(0)
    for (const e of picture) {
      expect(
        error(encodeOrbit64V2Facelets(e.id, solvedFacelets(e.n))),
        `${e.id}`,
      ).toBe('the picture model has no letters')
      expect(
        error(decodeOrbit64V2Facelets(tokenOfSolved(e))),
        `token of ${e.id}`,
      ).toBe('the picture model has no letters')
    }
    expect(error(encodeOrbit64V2Facelets(54, solved3))).toBe(
      'unknown registry entry 54',
    )
    expect(error(encodeOrbit64V2Facelets(-1, solved3))).toBe(
      'unknown registry entry -1',
    )
    expect(error(decodeOrbit64V2Facelets('AAA'))).toBe(
      'not a known V2 state token',
    )
  })

  it('writes no facelets for a cube that is no state of its type', () => {
    const cube = orbit64V2Solved(3, 'Color')
    const bad = { ...cube, cornerTwists: [1, 0, 0, 0, 0, 0, 0, 0] }
    expect(error(orbit64V2ToFacelets(3, 'Color', 'Framed', bad))).toBe(
      'corner twists must sum to 0 mod 3',
    )
    // A frame on a canonical cube.
    expect(
      error(
        orbit64V2ToFacelets(3, 'Color', 'Canonical', { ...cube, frame: 1 }),
      ),
    ).toBe('frame must be 0..23 on odd framed cubes and 0 otherwise')
  })

  it('returns an error instead of throwing on hostile values', () => {
    const cube = orbit64V2Solved(4, 'Color')
    const write = (bad: unknown) =>
      error(
        orbit64V2ToFacelets(
          4,
          'Color',
          'Framed',
          bad as unknown as Orbit64V2Cube,
        ),
      )
    for (const bad of [
      undefined,
      null,
      5,
      'cube',
      {},
      { ...cube, wings: undefined },
      { ...cube, centers: [[0]] },
      { ...cube, cornerPieces: 'abcdefgh' },
    ]) {
      expect(write(bad), JSON.stringify(bad)).not.toBe('accepted')
    }
    expect(write(undefined)).toBe('malformed state')
    expect(write(null)).toBe('malformed state')
    // Reads that throw: a getter, a Proxy, a thrown primitive, a thrown
    // Proxy and an error whose message throws too.
    const thrown = [
      'a string',
      42,
      undefined,
      new Proxy({}, { get: () => 1 }),
      {
        get message(): string {
          throw new Error('message')
        },
      },
    ]
    for (const value of thrown) {
      const getter = {
        ...cube,
        get cornerPieces(): number[] {
          // Throwing a non-error is the point of the case.
          // eslint-disable-next-line @typescript-eslint/only-throw-error
          throw value
        },
      }
      expect(write(getter), String(typeof value)).toBe('malformed state')
    }
    expect(
      write(
        new Proxy(cube, {
          get() {
            throw new Error('trap')
          },
        }),
      ),
    ).toBe('malformed state')
    expect(write(new Proxy({}, { get: () => undefined }))).toBe(
      'malformed state',
    )

    for (const bad of [undefined, null, 5, {}, ['U'], new String(solved3)]) {
      expect(
        error(
          orbit64V2FromFacelets(3, 'Color', 'Framed', bad as unknown as string),
        ),
      ).toBe('facelets must be a string')
      expect(error(encodeOrbit64V2Facelets(3, bad as unknown as string))).toBe(
        'facelets must be a string',
      )
    }
    for (const bad of [undefined, null, 5, {}, ['AAAA']]) {
      expect(error(decodeOrbit64V2Facelets(bad as unknown as string))).toBe(
        'not a known V2 state token',
      )
    }
    const huge = 'U'.repeat(100_000)
    expect(read(huge)).toBe('expected 54 facelets for the 3x3x3, got 100000')
  })

  it('names an unknown entry without echoing caller text or running caller code', () => {
    const notInteger = 'the registry entry is not an integer'
    const ran: string[] = []
    const ids: unknown[] = [
      Number.NaN,
      1.5,
      Number.POSITIVE_INFINITY,
      undefined,
      null,
      '<script>alert(1)</script>',
      'x'.repeat(2_000_000),
      () => 3,
      '3',
      3n,
      [3],
      new Number(3),
      Symbol('3'),
      Object.create(null),
      {
        toString() {
          ran.push('toString')
          return '3'
        },
        valueOf() {
          ran.push('valueOf')
          return 3
        },
      },
    ]
    for (const id of ids) {
      const reason = error(encodeOrbit64V2Facelets(id as number, solved3))
      expect(reason, typeof id).toBe(notInteger)
      expect(
        error(encodeOrbit64V2State(id as number, orbit64V2Solved(3, 'Color'))),
        typeof id,
      ).toBe(notInteger)
    }
    expect(ran).toEqual([])
    expect(error(encodeOrbit64V2Facelets(54, solved3))).toBe(
      'unknown registry entry 54',
    )
    expect(error(encodeOrbit64V2Facelets(-1, solved3))).toBe(
      'unknown registry entry -1',
    )
  })
})

// The token of the solved state of an entry: its offset written at its length.
function tokenOfSolved(e: { offset: bigint; length: number }): string {
  const alphabet =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
  let token = ''
  for (let v = e.offset, i = 0; i < e.length; i++, v /= 64n) {
    token = alphabet[Number(v % 64n)] + token
  }
  return token
}

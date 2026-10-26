import { describe, expect, it } from 'vitest'
import {
  embedFingerprint,
  readExif,
  readFingerprint,
} from '../src/client/fixtures/photoMetadata'

const enc = new TextEncoder()
const bytes = (...parts: Array<number[] | Uint8Array>) =>
  Uint8Array.from(parts.flatMap((part) => Array.from(part)))
const be16 = (n: number) => [(n >> 8) & 255, n & 255]

// A JPEG with no pixels worth decoding: SOI, optional segments, a tiny scan
// header and EOI. The readers only walk its segments.
const SCAN = [0xff, 0xda, 0x00, 0x04, 0x00, 0x00, 1, 2, 3, 0xff, 0xd9]
const jpeg = (...segments: number[][]) => bytes([0xff, 0xd8], ...segments, SCAN)
const segment = (marker: number, body: number[]) => [
  0xff,
  marker,
  ...be16(body.length + 2),
  ...body,
]
const comment = (text: string) => segment(0xfe, Array.from(enc.encode(text)))

type Entry = { tag: number; type: number; count: number; value: number[] }

// One TIFF IFD at `offset`; values larger than 4 bytes go after the entries.
function ifd(
  entries: Entry[],
  offset: number,
  little: boolean,
): { bytes: number[]; end: number } {
  const w16 = (n: number) => (little ? [n & 255, (n >> 8) & 255] : be16(n))
  const w32 = (n: number) =>
    little
      ? [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >> 24) & 255]
      : [(n >> 24) & 255, (n >> 16) & 255, (n >> 8) & 255, n & 255]
  const head = 2 + entries.length * 12 + 4
  let tail: number[] = []
  const body: number[] = [...w16(entries.length)]
  for (const e of entries) {
    body.push(...w16(e.tag), ...w16(e.type), ...w32(e.count))
    if (e.value.length <= 4) {
      body.push(...e.value, ...Array(4 - e.value.length).fill(0))
    } else {
      body.push(...w32(offset + head + tail.length))
      tail = tail.concat(e.value)
    }
  }
  body.push(0, 0, 0, 0)
  return { bytes: [...body, ...tail], end: offset + body.length + tail.length }
}

function exifJpeg(little: boolean) {
  const w16 = (n: number) => (little ? [n & 255, (n >> 8) & 255] : be16(n))
  const w32 = (n: number) =>
    little
      ? [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >> 24) & 255]
      : [(n >> 24) & 255, (n >> 16) & 255, (n >> 8) & 255, n & 255]
  const ascii = (s: string) => [...Array.from(enc.encode(s)), 0]
  const make = ascii('ACME')
  const model = ascii('PhoneCam 9')
  // IFD0 has 4 entries: Make, Model, Orientation, ExifIFD pointer.
  const ifd0Size = 2 + 4 * 12 + 4 + make.length + model.length
  const exifOffset = 8 + ifd0Size
  const ifd0 = ifd(
    [
      { tag: 0x010f, type: 2, count: make.length, value: make },
      { tag: 0x0110, type: 2, count: model.length, value: model },
      { tag: 0x0112, type: 3, count: 1, value: w16(6) },
      { tag: 0x8769, type: 4, count: 1, value: w32(exifOffset) },
    ],
    8,
    little,
  )
  expect(ifd0.end).toBe(exifOffset)
  const exif = ifd(
    [
      {
        tag: 0x829a,
        type: 5,
        count: 1,
        value: [...w32(1), ...w32(120)],
      },
      { tag: 0x829d, type: 5, count: 1, value: [...w32(18), ...w32(10)] },
      { tag: 0x8827, type: 3, count: 1, value: w16(400) },
      { tag: 0x920a, type: 5, count: 1, value: [...w32(43), ...w32(10)] },
      { tag: 0xa403, type: 3, count: 1, value: w16(1) },
      { tag: 0x9003, type: 2, count: 20, value: ascii('2026:10:26 21:36:37') },
    ],
    exifOffset,
    little,
  )
  const tiff = [
    ...(little ? [0x49, 0x49] : [0x4d, 0x4d]),
    ...w16(42),
    ...w32(8),
    ...ifd0.bytes,
    ...exif.bytes,
  ]
  return jpeg(segment(0xe1, [...Array.from(enc.encode('Exif\0\0')), ...tiff]))
}

describe('photo fingerprint', () => {
  const json = '{"v":1,"renderer":"parametric/v1","preset":"dim-warm"}'

  it('reads back what was embedded', () => {
    const marked = embedFingerprint(jpeg(), json)
    expect(readFingerprint(marked)).toBe(json)
  })

  it('keeps the image data and the start of image marker', () => {
    const plain = jpeg(segment(0xe0, [1, 2, 3]))
    const marked = embedFingerprint(plain, json)
    expect(Array.from(marked.slice(0, 2))).toEqual([0xff, 0xd8])
    expect(marked.length).toBeGreaterThan(plain.length)
    expect(Array.from(marked.slice(-SCAN.length))).toEqual(SCAN)
  })

  it('finds it among other segments and other comments', () => {
    const marked = embedFingerprint(
      jpeg(segment(0xe0, [9, 9]), comment('made by a tool')),
      json,
    )
    expect(readFingerprint(marked)).toBe(json)
  })

  it('does not take a foreign comment for a fingerprint', () => {
    expect(readFingerprint(jpeg(comment('hello')))).toBeUndefined()
    expect(readFingerprint(jpeg())).toBeUndefined()
  })

  it('replaces an earlier fingerprint instead of stacking them', () => {
    const once = embedFingerprint(jpeg(), '{"a":1}')
    const twice = embedFingerprint(once, json)
    expect(readFingerprint(twice)).toBe(json)
    expect(twice.length).toBe(embedFingerprint(jpeg(), json).length)
  })

  it('refuses what is not a JPEG or is too long to fit a segment', () => {
    expect(() => embedFingerprint(bytes([1, 2, 3]), json)).toThrow()
    expect(() => embedFingerprint(jpeg(), 'x'.repeat(70000))).toThrow()
  })

  it('keeps non-ASCII text intact', () => {
    const text = '{"name":"Würfel ✓"}'
    expect(readFingerprint(embedFingerprint(jpeg(), text))).toBe(text)
  })

  it('ignores a fingerprint whose segment runs past the end of the file', () => {
    const whole = embedFingerprint(jpeg(), json)
    expect(readFingerprint(whole.slice(0, 30))).toBeUndefined()
  })

  it('reads nothing from garbage', () => {
    expect(readFingerprint(bytes([1, 2, 3]))).toBeUndefined()
    expect(readFingerprint(bytes())).toBeUndefined()
    expect(readFingerprint(bytes([0xff, 0xd8, 0xff, 0xfe, 0xff, 0xff]))).toBe(
      undefined,
    )
  })
})

describe('photo EXIF', () => {
  for (const little of [true, false]) {
    it(`reads the camera from a ${little ? 'little' : 'big'}-endian block`, () => {
      expect(readExif(exifJpeg(little))).toEqual({
        make: 'ACME',
        model: 'PhoneCam 9',
        orientation: 6,
        exposureTime: 1 / 120,
        fNumber: 1.8,
        iso: 400,
        focalLength: 4.3,
        whiteBalance: 'manual',
        dateTime: '2026:10:26 21:36:37',
      })
    })
  }

  it('leaves out a rational with a zero denominator', () => {
    const block = exifJpeg(true)
    // The exposure time's denominator (120) is the last 4 bytes of that entry:
    // find 120,0,0,0 and zero it.
    const at = block.findIndex(
      (v, i) => v === 120 && block[i + 1] === 0 && block[i - 4] === 1,
    )
    expect(at).toBeGreaterThan(0)
    block[at] = 0
    const exif = readExif(block)
    expect(exif?.exposureTime).toBeUndefined()
    expect(exif?.fNumber).toBe(1.8)
  })

  it('reads nothing from a photo without EXIF', () => {
    expect(readExif(jpeg())).toBeUndefined()
    expect(readExif(jpeg(segment(0xe0, [1, 2])))).toBeUndefined()
  })

  it('survives a truncated block', () => {
    const full = exifJpeg(true)
    expect(() => readExif(full.slice(0, 60))).not.toThrow()
  })

  it('reads both the fingerprint and the camera from one file', () => {
    const marked = embedFingerprint(exifJpeg(true), '{"v":1}')
    expect(readFingerprint(marked)).toBe('{"v":1}')
    expect(readExif(marked)?.make).toBe('ACME')
  })
})

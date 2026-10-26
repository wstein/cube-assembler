import { describe, expect, it } from 'vitest'
import { suspectLabels } from '../src/core/color/PaletteDisagreement.gen'

type Rgb = { r: number; g: number; b: number }

const palette: Record<string, Rgb> = {
  W: { r: 230, g: 230, b: 230 },
  Y: { r: 235, g: 210, b: 40 },
  O: { r: 240, g: 120, b: 30 },
  R: { r: 190, g: 30, b: 40 },
  G: { r: 30, g: 150, b: 60 },
  B: { r: 30, g: 70, b: 190 },
}
const names = Object.keys(palette)

// A 3x3 face whose readings are the palette colors, labelled `labels`.
function face(readingOf: string[], labels: string[]) {
  const grid = (items: string[]) =>
    [0, 1, 2].map((r) => items.slice(r * 3, r * 3 + 3))
  return {
    cellColors: grid(readingOf).map((row) => row.map((n) => palette[n])),
    colors: grid(labels),
    palette,
  }
}

describe('stickers the reference palette reads differently', () => {
  const six = (wrongPerFace: number) =>
    names.map((name, i) => {
      const reading = Array<string>(9).fill(name)
      const labels = reading.map((n, j) =>
        j < wrongPerFace ? names[(i + 1) % 6] : n,
      )
      return face(reading, labels)
    })

  it('flags them when the palettes disagree on a large share', () => {
    const suspects = suspectLabels(six(3))
    expect(suspects).toHaveLength(6)
    // The first three stickers of face 0 are labelled Y but read W.
    expect(suspects[0]![0].slice(0)).toEqual(['W', 'W', 'W'])
    expect(suspects[0]![1]).toEqual([null, null, null])
  })

  it('stays quiet when only a few stickers disagree', () => {
    expect(suspectLabels(six(0))).toEqual(Array(6).fill(undefined))
    expect(suspectLabels(six(1))).toEqual(Array(6).fill(undefined))
  })

  it('has nothing to say without a palette', () => {
    const faces = six(3).map((f) => ({ ...f, palette: undefined }))
    expect(suspectLabels(faces)).toEqual(Array(6).fill(undefined))
  })
})

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { readFixtureColors } from '../src/client/fixtures/fixtureFormat'
import { analysisSamples } from '../src/client/capture/analysisSamples'

const ORDER = ['U', 'R', 'F', 'D', 'L', 'B']

function load() {
  const meta = JSON.parse(
    readFileSync(
      join(__dirname, 'fixtures/cube-5x5-2026-10-25T23-50-58/meta.json'),
      'utf8',
    ),
  )
  const slots = readFixtureColors(meta)!.colors
  return Object.fromEntries(
    ORDER.map((key) => [
      key,
      {
        colors: slots[key],
        cellColors: meta.faces[key.toLowerCase()].readings.map(
          ([r, g, b]: number[]) => ({ r, g, b }),
        ),
        confidence: 1,
        timestamp: 0,
      },
    ]),
  )
}

describe('the analysis samples', () => {
  it('has a sample and a net cell for every sticker', () => {
    const captured = load()
    // Readings are flat in the fixture; the analysis wants rows.
    for (const key of ORDER)
      captured[key].cellColors = Array.from({ length: 5 }, (_, r) =>
        captured[key].cellColors.slice(r * 5, r * 5 + 5),
      )
    const { samples, cells, netFaces } = analysisSamples(
      captured as never,
      ORDER,
      5,
      (key) => key,
    )
    expect(samples).toHaveLength(150)
    expect(cells).toHaveLength(150)
    expect(cells.every(Boolean)).toBe(true)
    expect(Object.keys(netFaces!).sort()).toEqual([
      'B',
      'D',
      'F',
      'L',
      'R',
      'U',
    ])
    expect(samples[0].where).toMatch(
      /^(Left|Front|Right|Back|Up|Down), row 1, column 1$/,
    )
    // The label of a sticker is the color the net shows in its cell.
    samples.forEach((sample, i) =>
      expect(netFaces![cells[i]!.face][cells[i]!.row][cells[i]!.col]).toBe(
        sample.label,
      ),
    )
  })

  it('gives each net face the photo of its capture', () => {
    const captured = load()
    for (const key of ORDER) {
      Object.assign(captured[key], { croppedImage: `photo-${key}` })
      captured[key].cellColors = Array.from({ length: 5 }, (_, r) =>
        captured[key].cellColors.slice(r * 5, r * 5 + 5),
      )
    }
    const { photos, netFaces } = analysisSamples(
      captured as never,
      ORDER,
      5,
      (key) => key,
    )
    expect(Object.keys(photos!).sort()).toEqual(Object.keys(netFaces!).sort())
    // Every capture's photo shows up exactly once, with a quarter-turn count.
    expect(
      Object.values(photos!)
        .map((photo) => photo.image)
        .sort(),
    ).toEqual(ORDER.map((key) => `photo-${key}`).sort())
    for (const photo of Object.values(photos!))
      expect([0, 1, 2, 3]).toContain(photo.turns)
  })

  it('has no net while a face is missing', () => {
    const captured = load()
    delete (captured as Record<string, unknown>).D
    for (const key of ORDER.filter((k) => k !== 'D'))
      captured[key].cellColors = Array.from({ length: 5 }, (_, r) =>
        captured[key].cellColors.slice(r * 5, r * 5 + 5),
      )
    const { cells, netFaces } = analysisSamples(
      captured as never,
      ORDER,
      5,
      (key) => key,
    )
    expect(netFaces).toBeNull()
    expect(cells.every((cell) => cell === undefined)).toBe(true)
  })
})

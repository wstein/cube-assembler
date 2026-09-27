import { describe, expect, it } from 'vitest'
import {
  AVERAGE_LIMIT_FRACTION,
  colorDeletionEffects,
  colorsUnderWhite,
  colorDifferences,
  deleteColorProfiles,
  groupDifferences,
  groupSimilarProfiles,
  withinMergeLimit,
  mergeColorProfiles,
  mergedColors,
  profileDistance,
  splitColorLevel,
  unusedColorProfiles,
  whiteBalancedColors,
} from '../src/client/colorProfileReview'
import {
  AUTO_COLORS_ID,
  EMPTY_SETTINGS,
  builtinColorProfiles,
  type ColorProfile,
  type ProfileSettings,
} from '../src/client/profileSettings'
import type { RGB } from '../src/client/imageProcessing'

const rgb = (r: number, g: number, b: number): RGB => ({ r, g, b })
const profile = (
  id: string,
  colors: Record<string, RGB>,
  captures = 1,
): ColorProfile => ({ id, name: id, colors, captures })

// Real learned palettes from an exported settings file: the same stickers
// under daylight and under a warm lamp, and a clearly different pastel cube.
const DAYLIGHT = {
  W: rgb(198, 206, 224),
  Y: rgb(196, 222, 68),
  O: rgb(238, 106, 54),
  R: rgb(196, 42, 58),
  G: rgb(12, 168, 88),
  B: rgb(10, 68, 185),
}
const WARM = {
  W: rgb(216, 204, 182),
  Y: rgb(218, 202, 48),
  O: rgb(232, 92, 42),
  R: rgb(190, 36, 44),
  G: rgb(24, 152, 66),
  B: rgb(16, 62, 155),
}
const UV = {
  W: rgb(230, 235, 248),
  Y: rgb(232, 238, 44),
  O: rgb(248, 98, 38),
  R: rgb(216, 34, 52),
  G: rgb(8, 185, 90),
  B: rgb(2, 68, 226),
}
const PASTEL = {
  W: rgb(228, 230, 236),
  Y: rgb(242, 232, 115),
  O: rgb(244, 142, 92),
  R: rgb(232, 92, 108),
  G: rgb(108, 212, 138),
  B: rgb(82, 142, 232),
}

const settings = (
  colors: ColorProfile[],
  extra: Partial<ProfileSettings> = {},
): ProfileSettings => ({ ...EMPTY_SETTINGS, colors, ...extra })

describe('A/B swatch difference labels', () => {
  it('calls only ΔE below 3 the same', () => {
    expect(splitColorLevel(2.9)).toEqual(['ok', 'same'])
    expect(splitColorLevel(3)).toEqual(['warn', 'slightly different'])
    expect(splitColorLevel(4.7)).toEqual(['warn', 'slightly different'])
    expect(splitColorLevel(12)).toEqual(['bad', 'different'])
  })
})

describe('whiteBalancedColors', () => {
  it('makes White neutral and keeps the other colors relative to it', () => {
    const balanced = whiteBalancedColors(WARM)
    expect(balanced.W.r).toBe(balanced.W.g)
    expect(balanced.W.g).toBe(balanced.W.b)
    // Under the warm lamp White was reddish; balancing takes the same red
    // cast out of Blue.
    expect(balanced.B.r / balanced.B.b).toBeLessThan(WARM.B.r / WARM.B.b)
  })
})

describe('profileDistance', () => {
  it('ignores the room light once each profile is balanced on its own White', () => {
    const tinted = Object.fromEntries(
      Object.entries(UV).map(([key, c]) => [
        key,
        rgb(Math.min(255, c.r * 1.08), c.g, Math.round(c.b * 0.85)),
      ]),
    )
    expect(profileDistance(UV, tinted)).toBeLessThan(1.5)
  })

  it('puts the warm-lamp profile closer to the UV one than the raw colors do', () => {
    expect(profileDistance(WARM, UV)).toBeLessThan(3)
    expect(profileDistance(PASTEL, UV)).toBeGreaterThan(8)
  })
})

describe('the merge limit', () => {
  it('rejects one color beyond the limit, however close the others are', () => {
    expect(withinMergeLimit({ Y: 0.5, O: 0.5, R: 0.5, G: 10, B: 0.5 }, 3)).toBe(
      false,
    )
    expect(
      withinMergeLimit({ Y: 0.5, O: 0.5, R: 0.5, G: 3.2, B: 0.5 }, 3),
    ).toBe(false)
  })

  it(`rejects colors all moderately apart: the average may be at most ${AVERAGE_LIMIT_FRACTION.toFixed(2)} of the limit`, () => {
    expect(
      withinMergeLimit({ Y: 2.9, O: 2.9, R: 2.9, G: 2.9, B: 2.9 }, 3),
    ).toBe(false)
    expect(withinMergeLimit({ Y: 1, O: 1, R: 1.2, G: 2.8, B: 1 }, 3)).toBe(true)
  })
})

describe('colorDifferences', () => {
  it('measures each colored sticker separately after balancing', () => {
    const greenOff = { ...UV, G: rgb(110, 185, 30) }
    const diffs = colorDifferences(UV, greenOff)
    expect(diffs.G).toBeGreaterThan(5)
    for (const key of ['Y', 'O', 'R', 'B'] as const)
      expect(diffs[key]).toBeLessThan(0.5)
    // The old average would have hidden it.
    expect(profileDistance(UV, greenOff)).toBeLessThan(3)
  })
})

describe('groupSimilarProfiles', () => {
  const profiles = [
    profile('daylight', DAYLIGHT),
    profile('warm', WARM),
    profile('uv', UV),
    profile('pastel', PASTEL),
  ]

  it('groups profiles that are all within the limit of each other', () => {
    // Warm Indoor and UV Coated differ by just over 3 in Green only.
    const ids = (limit: number) =>
      groupSimilarProfiles(profiles, limit).map((group) =>
        group.map((p) => p.id).sort(),
      )
    expect(ids(4)).toContainEqual(['uv', 'warm'])
    expect(ids(4)).toContainEqual(['pastel'])
    expect(ids(3)).not.toContainEqual(['uv', 'warm'])
  })

  it('does not group profiles when one color is far apart', () => {
    const greenOff = profile('green-off', { ...UV, G: rgb(110, 185, 30) })
    expect(
      groupSimilarProfiles([profile('uv', UV), greenOff], 3).every(
        (group) => group.length === 1,
      ),
    ).toBe(true)
  })

  it('summarizes a group by its worst color and largest average', () => {
    const near = profile('near', { ...UV, G: rgb(8, 180, 95) })
    const summary = groupDifferences([profile('uv', UV), near])
    expect(summary.worst.color).toBe('G')
    expect(summary.worst.value).toBeCloseTo(summary.byColor.G, 5)
    expect(summary.average).toBeLessThan(summary.worst.value)
  })

  it('keeps every profile alone at a tiny limit', () => {
    expect(
      groupSimilarProfiles(profiles, 0.1).every((group) => group.length === 1),
    ).toBe(true)
  })
})

describe('mergedColors', () => {
  it('keeps the mean White brightness of the merged profiles', () => {
    const lum = (c: RGB) => {
      const lin = (v: number) => {
        v /= 255
        return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
      }
      return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b)
    }
    const merged = mergedColors([{ colors: WARM }, { colors: UV }])
    expect(lum(merged.W)).toBeCloseTo((lum(WARM.W) + lum(UV.W)) / 2, 2)
  })
})

describe('mergeColorProfiles', () => {
  const base = settings(
    [profile('warm', WARM, 2), profile('uv', UV, 3), profile('pastel', PASTEL)],
    {
      activeColorsId: 'uv',
      autoMatchedColorsId: 'warm',
    },
  )

  it("replaces the merged profiles with one new profile in the first one's place", () => {
    const { settings: merged, profile: created } = mergeColorProfiles(
      base,
      ['warm', 'uv'],
      ' Bright stickers ',
      '2026-09-26T20:00:00.000Z',
    )
    expect(merged.colors.map((p) => p.id)).toEqual([created.id, 'pastel'])
    expect(created.name).toBe('Bright stickers')
    expect(created.captures).toBe(5)
    expect(created.updatedAt).toBe('2026-09-26T20:00:00.000Z')
    expect(created.colors.W.r).toBe(created.colors.W.g)
    expect(created.colors.W.g).toBe(created.colors.W.b)
  })

  it('moves the selected and the automatically matched profile to the new one', () => {
    const { settings: merged, profile: created } = mergeColorProfiles(
      base,
      ['warm', 'uv'],
      'Bright',
      '2026-09-26T20:00:00.000Z',
    )
    expect(merged.activeColorsId).toBe(created.id)
    expect(merged.autoMatchedColorsId).toBe(created.id)
  })

  it('leaves other selections alone', () => {
    const other = {
      ...base,
      activeColorsId: AUTO_COLORS_ID,
      autoMatchedColorsId: 'pastel',
    }
    const { settings: merged } = mergeColorProfiles(
      other,
      ['warm', 'uv'],
      'Bright',
      '2026-09-26T20:00:00.000Z',
    )
    expect(merged.activeColorsId).toBe(AUTO_COLORS_ID)
    expect(merged.autoMatchedColorsId).toBe('pastel')
  })

  it('refuses fewer than two profiles, built-in colors, unknown ids and an empty name', () => {
    const at = '2026-09-26T20:00:00.000Z'
    expect(() => mergeColorProfiles(base, ['warm'], 'X', at)).toThrow()
    expect(() =>
      mergeColorProfiles(base, ['warm', builtinColorProfiles()[0].id], 'X', at),
    ).toThrow()
    expect(() => mergeColorProfiles(base, ['warm', 'nope'], 'X', at)).toThrow()
    expect(() => mergeColorProfiles(base, ['warm', 'uv'], '  ', at)).toThrow()
  })
})

describe('deleting color profiles', () => {
  const base = settings(
    [profile('warm', WARM), profile('uv', UV), profile('pastel', PASTEL)],
    {
      activeColorsId: 'uv',
      autoMatchedColorsId: 'warm',
    },
  )

  it('deletes several profiles; the selection and the automatic match are cleared', () => {
    const next = deleteColorProfiles(base, ['warm', 'uv'])
    expect(next.colors.map((p) => p.id)).toEqual(['pastel'])
    expect(next.activeColorsId).toBe(AUTO_COLORS_ID)
    expect(next.autoMatchedColorsId).toBeUndefined()
  })

  it('refuses built-in and unknown profiles', () => {
    expect(() =>
      deleteColorProfiles(base, [builtinColorProfiles()[0].id]),
    ).toThrow()
    expect(() => deleteColorProfiles(base, ['nope'])).toThrow()
  })

  it('says what a deletion changes', () => {
    expect(colorDeletionEffects(base, ['uv'])).toEqual([
      'Colors switch to Automatic',
    ])
    expect(colorDeletionEffects(base, ['warm'])).toEqual([
      'Automatic looks for a new match',
    ])
    expect(colorDeletionEffects(base, ['pastel'])).toEqual([])
  })

  it('selects profiles that are neither selected nor the automatic match', () => {
    expect(unusedColorProfiles(base)).toEqual(['pastel'])
  })
})

describe('colorsUnderWhite', () => {
  it("shows a balanced profile's stickers under a capture's White", () => {
    // Colors that don't clip when balanced (orange's red would).
    const capture = {
      W: { r: 177, g: 211, b: 255 },
      B: { r: 3, g: 74, b: 229 },
      G: { r: 0, g: 166, b: 108 },
    }
    const back = colorsUnderWhite(whiteBalancedColors(capture), capture.W)
    for (const key of Object.keys(capture) as Array<keyof typeof capture>) {
      for (const channel of ['r', 'g', 'b'] as const)
        expect(
          Math.abs(back[key][channel] - capture[key][channel]),
        ).toBeLessThanOrEqual(1)
    }
  })
})

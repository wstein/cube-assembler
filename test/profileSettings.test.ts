import { describe, expect, it } from 'vitest'
import { STICKER_COLORS } from '../src/client/imageProcessing'
import {
  EMPTY_SETTINGS, GENERIC_COLORS_ID, activeColorProfile, activeCube, allCubes, builtinCube,
  colorPalette, convertLegacySettings, cubesForSize, saveColorProfile, saveCube, selectColorProfile,
} from '../src/client/profileSettings'

describe('separate cube and color settings', () => {
  it('always lists both construction presets for every size', () => {
    expect(allCubes(EMPTY_SETTINGS)).toHaveLength(12)
    expect(cubesForSize(EMPTY_SETTINGS, 5).map((cube) => cube.name)).toEqual([
      'Stickerless 5×5', 'Stickers on black 5×5',
    ])
    expect(activeCube(EMPTY_SETTINGS, 5)).toEqual(builtinCube(5, 'stickerless'))
    const custom = { id: 'custom', name: 'My cube', size: 5, sampling: { stickerCore: 0.5 } }
    const saved = saveCube(EMPTY_SETTINGS, custom)
    expect(cubesForSize(saved, 5).map((cube) => cube.name)).toEqual([
      'Stickerless 5×5', 'Stickers on black 5×5', 'My cube',
    ])
    expect(saved.cubes).toEqual([custom])
    expect(() => saveCube(saved, builtinCube(5, 'stickerless'))).toThrow('built-in')
  })

  it('shares one selected color profile across cube sizes', () => {
    const custom = { id: 'colors-a', name: 'My colors', colors: colorPalette(activeColorProfile(EMPTY_SETTINGS)), captures: 2, updatedAt: '2026-09-25T00:00:00.000Z' }
    const saved = selectColorProfile(saveColorProfile(EMPTY_SETTINGS, custom), custom.id)
    expect(activeColorProfile(saved).id).toBe('colors-a')
    expect(activeCube(saved, 3).size).toBe(3)
    expect(activeCube(saved, 7).size).toBe(7)
    expect(activeColorProfile(EMPTY_SETTINGS).id).toBe(GENERIC_COLORS_ID)
    expect(colorPalette(activeColorProfile(EMPTY_SETTINGS))).toEqual(STICKER_COLORS)
  })

  it('converts old combined profiles without changing the old value', () => {
    const legacy = {
      profiles: [{
        id: 'old-cube', name: 'My 3×3', size: 3,
        sampling: { backgroundGap: 0.2, stickerCore: 0.55 },
        learnedColors: { W: [240, 240, 240], Y: [240, 220, 10], O: [240, 100, 10], R: [200, 30, 30], G: [20, 180, 50], B: [20, 60, 190] },
        learnedAt: '2026-09-25T00:00:00.000Z',
      }],
      active: { 3: 'old-cube' },
    }
    const before = JSON.stringify(legacy)
    const settings = convertLegacySettings(legacy)
    expect(settings.cubes).toEqual([{ id: 'old-cube', name: 'My 3×3', size: 3, sampling: { stickerCore: 0.55 } }])
    expect(settings.activeCubeBySize[3]).toBe('old-cube')
    expect(settings.colors).toMatchObject([{ id: 'colors-old-cube', name: 'My 3×3 colors', captures: 1 }])
    expect(settings.activeColorsId).toBe('colors-old-cube')
    expect(JSON.stringify(legacy)).toBe(before)
  })
})

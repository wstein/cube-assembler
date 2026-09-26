import { describe, expect, it } from 'vitest'
import { STICKER_COLORS } from '../src/client/imageProcessing'
import {
  AUTO_COLORS_ID, EMPTY_SETTINGS, GENERIC_COLORS_ID, activeColorProfile, activeCube, allCubes, builtinCube,
  colorPalette, convertLegacySettings, copyColorProfile, copyCubeSetting, cubesForSize, deleteColorProfile, groupCubesByName, mergeSettings, parseProfileSettings,
  saveColorProfile, saveCube, selectColorProfile, selectCube, setAutoColorMatch,
} from '../src/client/profileSettings'

describe('separate cube and color settings', () => {
  it('groups cube choices by name and shows sizes within each group', () => {
    const withNamedCubes = saveCube(saveCube(EMPTY_SETTINGS,
      { id: 'small', name: 'My Cube 3×3', size: 3, sampling: { stickerCore: 0.6 } }),
      { id: 'large', name: 'My Cube 7x7', size: 7, sampling: { stickerCore: 0.6 } })
    expect(groupCubesByName(withNamedCubes).map(({ name, cubes }) => ({
      name, sizes: cubes.map((cube) => cube.size),
    }))).toEqual([
      { name: 'Generic', sizes: [2, 3, 4, 5, 6, 7] },
      { name: 'My Cube', sizes: [3, 7] },
    ])
  })

  it('always lists one read-only Generic cube with a 60 percent core for every size', () => {
    expect(allCubes(EMPTY_SETTINGS)).toHaveLength(6)
    expect(cubesForSize(EMPTY_SETTINGS, 5).map((cube) => cube.name)).toEqual(['Generic 5×5'])
    expect(activeCube(EMPTY_SETTINGS, 5)).toEqual(builtinCube(5))
    expect(activeCube(EMPTY_SETTINGS, 5)).toBe(activeCube(EMPTY_SETTINGS, 5))
    expect(activeCube(EMPTY_SETTINGS, 5).sampling).toBe(activeCube(EMPTY_SETTINGS, 5).sampling)
    expect(activeCube(EMPTY_SETTINGS, 5).sampling.stickerCore).toBe(0.6)
    const custom = { id: 'custom', name: 'My cube', size: 5, sampling: { stickerCore: 0.5 } }
    const saved = saveCube(EMPTY_SETTINGS, custom)
    expect(cubesForSize(saved, 5).map((cube) => cube.name)).toEqual([
      'Generic 5×5', 'My cube',
    ])
    expect(saved.cubes).toEqual([custom])
    expect(() => saveCube(saved, builtinCube(5))).toThrow('built-in')
  })

  it('shares one selected color profile across cube sizes', () => {
    const custom = { id: 'colors-a', name: 'My colors', colors: colorPalette(activeColorProfile(EMPTY_SETTINGS)), captures: 2, updatedAt: '2026-09-25T00:00:00.000Z' }
    const saved = selectColorProfile(saveColorProfile(EMPTY_SETTINGS, custom), custom.id)
    expect(activeColorProfile(saved).id).toBe('colors-a')
    expect(activeCube(saved, 3).size).toBe(3)
    expect(activeCube(saved, 7).size).toBe(7)
    expect(EMPTY_SETTINGS.activeColorsId).toBe(AUTO_COLORS_ID)
    expect(activeColorProfile(EMPTY_SETTINGS).id).toBe(GENERIC_COLORS_ID)
    expect(colorPalette(activeColorProfile(EMPTY_SETTINGS))).toEqual(STICKER_COLORS)
    const auto = setAutoColorMatch(selectColorProfile(saved, AUTO_COLORS_ID), custom.id)
    expect(auto.activeColorsId).toBe(AUTO_COLORS_ID)
    expect(activeColorProfile(auto).id).toBe(custom.id)
    expect(activeColorProfile(setAutoColorMatch(auto, null)).id).toBe(GENERIC_COLORS_ID)
    expect(activeColorProfile(parseProfileSettings(JSON.parse(JSON.stringify(auto)))).id).toBe(custom.id)
    expect(activeColorProfile(deleteColorProfile(auto, custom.id)).id).toBe(GENERIC_COLORS_ID)
  })

  it('creates a named color profile from the selected palette without inheriting capture history', () => {
    const source = { id: 'old', name: 'Generic 3×3 colors', colors: colorPalette(activeColorProfile(EMPTY_SETTINGS)), captures: 7, updatedAt: '2026-09-25T00:00:00.000Z' }
    const created = copyColorProfile(EMPTY_SETTINGS, source, '  GoCube  ')
    expect(created).toMatchObject({ name: 'GoCube', colors: source.colors, captures: 0 })
    expect(created.id).not.toBe(source.id)
    expect(created.updatedAt).toBeUndefined()
    expect(created.colors).not.toBe(source.colors)
    const saved = saveColorProfile(EMPTY_SETTINGS, created)
    expect(activeColorProfile(saved).name).toBe('GoCube')
    expect(saveColorProfile(saved, { ...created, name: 'GoCube UV' }).colors).toHaveLength(1)
  })

  it('selects a cube by id and copies a built-in under a custom name', () => {
    const builtIn = builtinCube(7)
    const selected = selectCube(EMPTY_SETTINGS, builtIn.id)
    expect(activeCube(selected, 7).sampling.stickerCore).toBe(0.6)
    const copy = copyCubeSetting(selected, builtIn, 'My 7×7')
    expect(copy).toMatchObject({ name: 'My 7×7', size: 7, sampling: { stickerCore: 0.6 } })
    expect(copy.id).not.toBe(builtIn.id)
  })

  it('merges imported cubes and colors while keeping the chosen ids', () => {
    const cube = { id: 'custom', name: 'My cube', size: 5, sampling: { stickerCore: 0.5 } }
    const color = { id: 'colors-a', name: 'My colors', colors: colorPalette(activeColorProfile(EMPTY_SETTINGS)), captures: 1 }
    const imported = selectColorProfile(saveColorProfile(saveCube(EMPTY_SETTINGS, cube), color), color.id)
    const merged = mergeSettings(EMPTY_SETTINGS, imported)
    expect(activeCube(merged, 5).id).toBe(cube.id)
    expect(activeColorProfile(merged).id).toBe(color.id)
    expect(merged.cubes).toHaveLength(1)
    expect(merged.colors).toHaveLength(1)
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

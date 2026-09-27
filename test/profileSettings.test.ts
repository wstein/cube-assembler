import { describe, expect, it } from 'vitest'
import { STICKER_COLORS } from '../src/client/imageProcessing'
import {
  AUTO_COLORS_ID, EMPTY_SETTINGS, GENERIC_COLORS_ID, GENERIC_STICKER_COLORS, activeColorProfile, activeCube, allCubes, builtinCube,
  captureColorProfileSnapshot, capturePalette, colorPalette, genericColorProfile, copyColorProfile, copyCubeSetting, cubesForSize, deleteColorProfile, groupCubesByName, mergeSettings, parseProfileSettings,
  renameColorProfile, renameCube, saveColorProfile, saveCube, selectColorProfile, selectCube, setAutoColorMatch, resolvedColorProfileSnapshot,
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
    expect(colorPalette(activeColorProfile(EMPTY_SETTINGS))).toEqual(GENERIC_STICKER_COLORS)
    const auto = setAutoColorMatch(selectColorProfile(saved, AUTO_COLORS_ID), custom.id)
    expect(auto.activeColorsId).toBe(AUTO_COLORS_ID)
    expect(activeColorProfile(auto).id).toBe(custom.id)
    expect(activeColorProfile(setAutoColorMatch(auto, null)).id).toBe(GENERIC_COLORS_ID)
    expect(activeColorProfile(parseProfileSettings(JSON.parse(JSON.stringify(auto)))).id).toBe(custom.id)
    expect(activeColorProfile(deleteColorProfile(auto, custom.id)).id).toBe(GENERIC_COLORS_ID)
  })

  it('does not preselect the last automatic match for a new capture', () => {
    const custom = { id: 'old-match', name: 'Old match', colors: colorPalette(activeColorProfile(EMPTY_SETTINGS)), captures: 2 }
    const auto = setAutoColorMatch(selectColorProfile(saveColorProfile(EMPTY_SETTINGS, custom), AUTO_COLORS_ID), custom.id)
    expect(capturePalette(auto)).toBeUndefined()
    expect(capturePalette(selectColorProfile(auto, custom.id))).toEqual(custom.colors)
  })

  it('names the learned palette when Automatic found no saved match', () => {
    const colors = colorPalette(activeColorProfile(EMPTY_SETTINGS))
    expect(captureColorProfileSnapshot(colors)).toMatchObject({
      id: 'capture-colors', name: 'Colors from this capture', selection: 'automatic', colors,
    })
  })

  it('gives Generic colors camera-realistic references, not pure RGB', () => {
    // Pure 255/0/0 red or 0/0/255 blue is never what a camera reads; the
    // realistic values come from real captures (see GENERIC_STICKER_COLORS).
    const generic = genericColorProfile()
    expect(generic.colors).toEqual(colorPalette({ colors: GENERIC_STICKER_COLORS }))
    for (const key of ['W', 'Y', 'O', 'R', 'G', 'B']) expect(generic.colors[key]).not.toEqual(STICKER_COLORS[key])
  })

  it('keeps Generic and Automatic color choices read-only', () => {
    const generic = activeColorProfile(EMPTY_SETTINGS)
    expect(() => saveColorProfile(EMPTY_SETTINGS, { ...generic, name: 'Changed' })).toThrow('built-in')
    expect(() => saveColorProfile(EMPTY_SETTINGS, { ...generic, id: AUTO_COLORS_ID })).toThrow('built-in')
    expect(() => deleteColorProfile(EMPTY_SETTINGS, GENERIC_COLORS_ID)).toThrow('built-in')
    expect(() => deleteColorProfile(EMPTY_SETTINGS, AUTO_COLORS_ID)).toThrow('built-in')
  })

  it('snapshots one resolved profile and its RGB values for the whole capture', () => {
    const custom = { id: 'gocube', name: 'GoCube', colors: colorPalette(activeColorProfile(EMPTY_SETTINGS)), captures: 2 }
    custom.colors.W = { r: 245, g: 244, b: 238 }
    const auto = setAutoColorMatch(selectColorProfile(saveColorProfile(EMPTY_SETTINGS, custom), AUTO_COLORS_ID), custom.id)
    const used = resolvedColorProfileSnapshot(activeColorProfile(auto), 'automatic')
    expect(used).toMatchObject({ id: 'gocube', name: 'GoCube', selection: 'automatic', colors: { W: { r: 245, g: 244, b: 238 } } })
    custom.colors.W.r = 100
    expect(used.colors.W.r).toBe(245)
    expect(resolvedColorProfileSnapshot(activeColorProfile(selectColorProfile(auto, custom.id)), 'manual').selection).toBe('manual')
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

})

describe('renaming profiles', () => {
  const cube = { id: 'cube-a', name: 'GAN', size: 3, sampling: { stickerCore: 0.65 } }
  const colors = { id: 'colors-a', name: 'Daylight', colors: colorPalette({ colors: STICKER_COLORS }), captures: 1 }
  const settings = { ...EMPTY_SETTINGS, cubes: [cube], colors: [colors], activeCubeBySize: { 3: 'cube-a' }, activeColorsId: 'colors-a' }

  it('renames a saved cube and keeps it active', () => {
    const next = renameCube(settings, 'cube-a', '  GAN 356  ')
    expect(next.cubes[0]).toEqual({ ...cube, name: 'GAN 356' })
    expect(next.activeCubeBySize[3]).toBe('cube-a')
  })

  it('renames a saved color profile and keeps it selected', () => {
    const next = renameColorProfile(settings, 'colors-a', 'Desk lamp')
    expect(next.colors[0]).toEqual({ ...colors, name: 'Desk lamp' })
    expect(next.activeColorsId).toBe('colors-a')
  })

  it('caps names at 60 characters', () => {
    expect(renameCube(settings, 'cube-a', 'x'.repeat(80)).cubes[0].name).toHaveLength(60)
  })

  it('refuses built-in profiles, unknown ids and empty names', () => {
    expect(() => renameCube(settings, builtinCube(3).id, 'Mine')).toThrow()
    expect(() => renameColorProfile(settings, GENERIC_COLORS_ID, 'Mine')).toThrow()
    expect(() => renameColorProfile(settings, AUTO_COLORS_ID, 'Mine')).toThrow()
    expect(() => renameCube(settings, 'nope', 'Mine')).toThrow()
    expect(() => renameColorProfile(settings, 'colors-a', '   ')).toThrow()
  })
})

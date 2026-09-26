import { describe, expect, it } from 'vitest'
import { cubeDeletionEffects, cubesSameAsGeneric, deleteCubes, duplicateCubeGroups, mergeCubes, replaceCubes, unusedCubes } from '../src/client/cubeProfileReview'
import { EMPTY_SETTINGS, builtinCube, type CubeSetting, type ProfileSettings } from '../src/client/profileSettings'

const cube = (id: string, size: number, stickerCore: number): CubeSetting => ({ id, name: id, size, sampling: { stickerCore } })
const settings = (cubes: CubeSetting[], activeCubeBySize: Record<number, string> = {}): ProfileSettings =>
  ({ ...EMPTY_SETTINGS, cubes, activeCubeBySize })

// Shaped like a real exported file: most saved cubes copy Generic's 60%.
const BASE = settings([
  cube('daylight', 3, 0.6), cube('warm', 3, 0.6), cube('gan', 3, 0.65), cube('gocube', 3, 0.65),
  cube('qiyi', 2, 0.65), cube('big', 7, 0.6),
], { 3: 'daylight', 2: 'qiyi' })

const ids = (groups: CubeSetting[][]) => groups.map((group) => group.map((c) => c.id).sort())

describe('duplicateCubeGroups', () => {
  it('groups cubes of one size whose sticker areas are within the tolerance, with the built-in Generic', () => {
    const groups = ids(duplicateCubeGroups(BASE, 0.02))
    expect(groups).toContainEqual(['builtin-generic-3', 'daylight', 'warm'].sort())
    expect(groups).toContainEqual(['gan', 'gocube'])
    expect(groups).toContainEqual(['big', 'builtin-generic-7'].sort())
  })

  it('never groups across sizes, and skips groups of built-in cubes only', () => {
    const groups = duplicateCubeGroups(BASE, 0.1)
    for (const group of groups) expect(new Set(group.map((c) => c.size)).size).toBe(1)
    expect(ids(groups)).not.toContainEqual(['builtin-generic-4'])
    expect(groups.every((group) => group.some((c) => !c.id.startsWith('builtin-')))).toBe(true)
  })

  it('keeps cubes apart beyond the tolerance', () => {
    expect(ids(duplicateCubeGroups(BASE, 0.02))).not.toContainEqual(['builtin-generic-2', 'qiyi'].sort())
  })
})

describe('mergeCubes', () => {
  it('replaces saved cubes with one named cube of their mean sticker area, in the first one\'s place', () => {
    const { settings: next, cube: merged } = mergeCubes(BASE, ['gan', 'gocube'], ' GAN family ')
    expect(merged).toMatchObject({ name: 'GAN family', size: 3, sampling: { stickerCore: 0.65 } })
    expect(next.cubes.map((c) => c.id)).toEqual(['daylight', 'warm', merged.id, 'qiyi', 'big'])
  })

  it('moves the size\'s active cube to the merged one', () => {
    const { settings: next, cube: merged } = mergeCubes(BASE, ['daylight', 'warm'], 'Plain')
    expect(next.activeCubeBySize[3]).toBe(merged.id)
    expect(next.activeCubeBySize[2]).toBe('qiyi')
  })

  it('refuses built-in cubes, mixed sizes, fewer than two cubes and an empty name', () => {
    expect(() => mergeCubes(BASE, ['daylight', builtinCube(3).id], 'X')).toThrow()
    expect(() => mergeCubes(BASE, ['daylight', 'qiyi'], 'X')).toThrow()
    expect(() => mergeCubes(BASE, ['daylight'], 'X')).toThrow()
    expect(() => mergeCubes(BASE, ['daylight', 'warm'], ' ')).toThrow()
  })
})

describe('replaceCubes', () => {
  it('deletes copies of Generic and makes Generic the active cube', () => {
    const next = replaceCubes(BASE, ['daylight', 'warm'], builtinCube(3).id)
    expect(next.cubes.map((c) => c.id)).toEqual(['gan', 'gocube', 'qiyi', 'big'])
    expect(next.activeCubeBySize[3]).toBe(builtinCube(3).id)
  })

  it('refuses to delete the kept cube or a cube of another size', () => {
    expect(() => replaceCubes(BASE, ['daylight', 'gan'], 'gan')).toThrow()
    expect(() => replaceCubes(BASE, ['qiyi'], builtinCube(3).id)).toThrow()
  })
})

describe('deleting cubes', () => {
  it('deletes several saved cubes; a size whose active cube goes falls back to Generic', () => {
    const next = deleteCubes(BASE, ['daylight', 'qiyi'])
    expect(next.cubes.map((c) => c.id)).toEqual(['warm', 'gan', 'gocube', 'big'])
    expect(next.activeCubeBySize[3]).toBeUndefined()
    expect(next.activeCubeBySize[2]).toBeUndefined()
  })

  it('refuses built-in and unknown cubes', () => {
    expect(() => deleteCubes(BASE, [builtinCube(3).id])).toThrow()
    expect(() => deleteCubes(BASE, ['nope'])).toThrow()
  })

  it('says which sizes lose their active cube and what they use instead', () => {
    expect(cubeDeletionEffects(BASE, ['daylight', 'warm'])).toEqual(['3×3 then uses Generic 3×3'])
    expect(cubeDeletionEffects(BASE, ['warm'])).toEqual([])
  })

  it('selects saved cubes that copy Generic, and cubes that are not active', () => {
    expect(cubesSameAsGeneric(BASE)).toEqual(['daylight', 'warm', 'big'])
    expect(unusedCubes(BASE)).toEqual(['warm', 'gan', 'gocube', 'big'])
  })
})

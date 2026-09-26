// Reviewing saved cube definitions. A cube only sets how much of each
// sticker is sampled (stickerCore), so cubes of one size whose sticker areas
// match are duplicates: they can be merged into one, or deleted in favour of
// the built-in Generic cube they copy.
import { CUBE_SIZES, allCubes, isBuiltinCube, type CubeSetting, type ProfileSettings } from './profileSettings'

// Groups per size in which every cube's sticker area is within `tolerance`
// of every other one (complete linkage). Built-in cubes take part, but a
// group needs at least one saved cube to be worth reviewing.
export function duplicateCubeGroups(settings: ProfileSettings, tolerance: number): CubeSetting[][] {
  const result: CubeSetting[][] = []
  for (const size of CUBE_SIZES) {
    const groups = allCubes(settings).filter((cube) => cube.size === size).map((cube) => [cube])
    for (;;) {
      let best: { worst: number; i: number; j: number } | null = null
      for (let i = 0; i < groups.length; i++) {
        for (let j = i + 1; j < groups.length; j++) {
          let worst = 0
          for (const a of groups[i]) for (const b of groups[j]) worst = Math.max(worst, Math.abs(a.sampling.stickerCore - b.sampling.stickerCore))
          if (worst <= tolerance + 1e-9 && (!best || worst < best.worst)) best = { worst, i, j }
        }
      }
      if (!best) break
      groups[best.i].push(...groups[best.j])
      groups.splice(best.j, 1)
    }
    result.push(...groups.filter((group) => group.length > 1 && group.some((cube) => !isBuiltinCube(cube.id))))
  }
  return result
}

// The saved cubes `ids`, all of one size and none built in.
function savedCubes(settings: ProfileSettings, ids: string[]): CubeSetting[] {
  const unique = [...new Set(ids)]
  if (unique.some(isBuiltinCube)) throw new Error('Cannot change a built-in cube')
  const cubes = unique.map((id) => settings.cubes.find((cube) => cube.id === id))
  if (cubes.some((cube) => !cube)) throw new Error('Unknown cube')
  if (new Set(cubes.map((cube) => cube!.size)).size > 1) throw new Error('Cubes of different sizes')
  return cubes as CubeSetting[]
}

// `settings` without the cubes `gone`, with `keep` as the size's active cube
// where one of them was active.
function withoutCubes(settings: ProfileSettings, gone: Set<string>, size: number, keepId: string, cubes = settings.cubes.filter((cube) => !gone.has(cube.id))): ProfileSettings {
  const active = settings.activeCubeBySize[size]
  const activeCubeBySize = { ...settings.activeCubeBySize, ...(active !== undefined && gone.has(active) ? { [size]: keepId } : {}) }
  return { ...settings, cubes, activeCubeBySize }
}

// Replaces the saved cubes `ids` with one cube named `name` whose sticker area
// is their mean, placed where the first of them was.
export function mergeCubes(settings: ProfileSettings, ids: string[], name: string): { settings: ProfileSettings; cube: CubeSetting } {
  const members = savedCubes(settings, ids)
  if (members.length < 2) throw new Error('Pick at least two cubes')
  const trimmed = name.trim().slice(0, 60)
  if (!trimmed) throw new Error('Cube name required')
  let id: string
  do { id = `cube-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }
  while (allCubes(settings).some((cube) => cube.id === id))
  const stickerCore = Math.round(members.reduce((sum, cube) => sum + cube.sampling.stickerCore, 0) / members.length * 1000) / 1000
  const cube: CubeSetting = { id, name: trimmed, size: members[0].size, sampling: { stickerCore } }
  const gone = new Set(members.map((member) => member.id))
  const cubes = settings.cubes.filter((saved) => !gone.has(saved.id))
  cubes.splice(settings.cubes.findIndex((saved) => gone.has(saved.id)), 0, cube)
  return { settings: withoutCubes(settings, gone, cube.size, id, cubes), cube }
}

// Deletes the saved cubes `ids` in favour of `keepId` (a built-in Generic
// cube or another saved cube of the same size).
export function replaceCubes(settings: ProfileSettings, ids: string[], keepId: string): ProfileSettings {
  const members = savedCubes(settings, ids)
  const keep = allCubes(settings).find((cube) => cube.id === keepId)
  if (!keep || members.length === 0) throw new Error('Unknown cube')
  if (members.some((cube) => cube.id === keepId)) throw new Error('Cannot delete the cube to keep')
  if (members.some((cube) => cube.size !== keep.size)) throw new Error('Cubes of different sizes')
  return withoutCubes(settings, new Set(members.map((cube) => cube.id)), keep.size, keepId)
}

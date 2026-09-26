// Cube geometry and sticker colors are independent: one color profile can
// serve cubes of several sizes, while each cube keeps its own sticker gap.
import { STICKER_COLORS, type RGB, type SamplingGeometry } from './imageProcessing'

export interface CubeSetting {
  id: string
  name: string
  size: number
  sampling: SamplingGeometry
}

export interface ColorProfile {
  id: string
  name: string
  colors: Record<string, RGB>
  captures: number
  updatedAt?: string
}

export interface ProfileSettings {
  cubes: CubeSetting[]
  colors: ColorProfile[]
  activeCubeBySize: Record<number, string>
  activeColorsId: string
}

export const CUBE_SIZES = [2, 3, 4, 5, 6, 7]
export const GENERIC_COLORS_ID = 'generic-colors'
const COLOR_KEYS = ['W', 'Y', 'O', 'R', 'G', 'B']
const CONSTRUCTIONS = {
  stickerless: { label: 'Stickerless', stickerCore: 0.65 },
  stickered: { label: 'Stickers on black', stickerCore: 0.55 },
} as const
export type Construction = keyof typeof CONSTRUCTIONS

export const EMPTY_SETTINGS: ProfileSettings = {
  cubes: [], colors: [], activeCubeBySize: {}, activeColorsId: GENERIC_COLORS_ID,
}

export function builtinCube(size: number, construction: Construction): CubeSetting {
  if (!CUBE_SIZES.includes(size)) throw new Error('Unsupported cube size')
  const preset = CONSTRUCTIONS[construction]
  return {
    id: `builtin-${construction}-${size}`,
    name: `${preset.label} ${size}×${size}`,
    size,
    sampling: { stickerCore: preset.stickerCore },
  }
}

export function isBuiltinCube(id: string): boolean {
  return CUBE_SIZES.some((size) => id === builtinCube(size, 'stickerless').id || id === builtinCube(size, 'stickered').id)
}

export function allCubes(settings: ProfileSettings): CubeSetting[] {
  return [...CUBE_SIZES.flatMap((size) => [builtinCube(size, 'stickerless'), builtinCube(size, 'stickered')]), ...settings.cubes]
}

export function cubesForSize(settings: ProfileSettings, size: number): CubeSetting[] {
  return allCubes(settings).filter((cube) => cube.size === size)
}

export function activeCube(settings: ProfileSettings, size: number): CubeSetting {
  return cubesForSize(settings, size).find((cube) => cube.id === settings.activeCubeBySize[size]) ?? builtinCube(size, 'stickerless')
}

export function saveCube(settings: ProfileSettings, cube: CubeSetting): ProfileSettings {
  if (isBuiltinCube(cube.id)) throw new Error('Cannot change a built-in cube')
  if (!validCube(cube)) throw new Error('Invalid cube')
  const exists = settings.cubes.some((saved) => saved.id === cube.id)
  return {
    ...settings,
    cubes: exists ? settings.cubes.map((saved) => saved.id === cube.id ? cube : saved) : [...settings.cubes, cube],
    activeCubeBySize: { ...settings.activeCubeBySize, [cube.size]: cube.id },
  }
}

export function selectCube(settings: ProfileSettings, id: string): ProfileSettings {
  const cube = allCubes(settings).find((candidate) => candidate.id === id)
  if (!cube) throw new Error('Unknown cube')
  return { ...settings, activeCubeBySize: { ...settings.activeCubeBySize, [cube.size]: id } }
}

export function copyCubeSetting(settings: ProfileSettings, cube: CubeSetting, name: string): CubeSetting {
  const trimmed = name.trim().slice(0, 60)
  if (!trimmed) throw new Error('Cube name required')
  let id: string
  do { id = `cube-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }
  while (allCubes(settings).some((saved) => saved.id === id))
  return { id, name: trimmed, size: cube.size, sampling: { ...cube.sampling } }
}

export function deleteCube(settings: ProfileSettings, id: string): ProfileSettings {
  if (isBuiltinCube(id)) throw new Error('Cannot delete a built-in cube')
  const activeCubeBySize = { ...settings.activeCubeBySize }
  for (const [size, active] of Object.entries(activeCubeBySize)) if (active === id) delete activeCubeBySize[Number(size)]
  return { ...settings, cubes: settings.cubes.filter((cube) => cube.id !== id), activeCubeBySize }
}

export function genericColorProfile(): ColorProfile {
  return { id: GENERIC_COLORS_ID, name: 'Generic colors', colors: colorPalette({ colors: STICKER_COLORS } as ColorProfile), captures: 0 }
}

export function colorPalette(profile: Pick<ColorProfile, 'colors'>): Record<string, RGB> {
  return Object.fromEntries(COLOR_KEYS.map((key) => [key, { ...profile.colors[key] }]))
}

export function allColorProfiles(settings: ProfileSettings): ColorProfile[] {
  return [genericColorProfile(), ...settings.colors]
}

export function activeColorProfile(settings: ProfileSettings): ColorProfile {
  return allColorProfiles(settings).find((profile) => profile.id === settings.activeColorsId) ?? genericColorProfile()
}

export function saveColorProfile(settings: ProfileSettings, profile: ColorProfile): ProfileSettings {
  if (profile.id === GENERIC_COLORS_ID) throw new Error('Cannot change built-in colors')
  if (!validColorProfile(profile)) throw new Error('Invalid color profile')
  const exists = settings.colors.some((saved) => saved.id === profile.id)
  return {
    ...settings,
    colors: exists ? settings.colors.map((saved) => saved.id === profile.id ? profile : saved) : [...settings.colors, profile],
    activeColorsId: profile.id,
  }
}

export function selectColorProfile(settings: ProfileSettings, id: string): ProfileSettings {
  if (!allColorProfiles(settings).some((profile) => profile.id === id)) throw new Error('Unknown color profile')
  return { ...settings, activeColorsId: id }
}

export function deleteColorProfile(settings: ProfileSettings, id: string): ProfileSettings {
  if (id === GENERIC_COLORS_ID) throw new Error('Cannot delete built-in colors')
  return {
    ...settings,
    colors: settings.colors.filter((profile) => profile.id !== id),
    activeColorsId: settings.activeColorsId === id ? GENERIC_COLORS_ID : settings.activeColorsId,
  }
}

export function mergeSettings(current: ProfileSettings, imported: ProfileSettings): ProfileSettings {
  const cubes = [...current.cubes]
  const colors = [...current.colors]
  for (const cube of imported.cubes) {
    const index = cubes.findIndex((saved) => saved.id === cube.id)
    if (index < 0) cubes.push(cube)
    else cubes[index] = cube
  }
  for (const profile of imported.colors) {
    const index = colors.findIndex((saved) => saved.id === profile.id)
    if (index < 0) colors.push(profile)
    else colors[index] = profile
  }
  return parseProfileSettings({
    cubes, colors,
    activeCubeBySize: { ...current.activeCubeBySize, ...imported.activeCubeBySize },
    activeColorsId: imported.activeColorsId,
  })
}

function validCube(value: unknown): value is CubeSetting {
  const cube = value as CubeSetting | null
  return typeof cube?.id === 'string' && cube.id.length > 0 && typeof cube.name === 'string' && cube.name.trim().length > 0
    && CUBE_SIZES.includes(cube.size) && Number.isFinite(cube.sampling?.stickerCore)
    && cube.sampling.stickerCore > 0 && cube.sampling.stickerCore <= 1
}

function validColors(value: unknown): value is Record<string, RGB> {
  if (!value || typeof value !== 'object') return false
  const colors = value as Record<string, RGB>
  return COLOR_KEYS.every((key) => ['r', 'g', 'b'].every((channel) => {
    const n = colors[key]?.[channel as keyof RGB]
    return typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 255
  }))
}

function validColorProfile(value: unknown): value is ColorProfile {
  const profile = value as ColorProfile | null
  return typeof profile?.id === 'string' && profile.id.length > 0 && typeof profile.name === 'string'
    && profile.name.trim().length > 0 && validColors(profile.colors)
    && Number.isInteger(profile.captures) && profile.captures >= 0
}

export function parseProfileSettings(value: unknown): ProfileSettings {
  const raw = value as Partial<ProfileSettings> | null
  if (!raw || !Array.isArray(raw.cubes) || !Array.isArray(raw.colors)) return EMPTY_SETTINGS
  const cubes = raw.cubes.filter(validCube).filter((cube) => !isBuiltinCube(cube.id))
    .map((cube) => ({ id: cube.id, name: cube.name.slice(0, 60), size: cube.size, sampling: { stickerCore: cube.sampling.stickerCore } }))
  const colors = raw.colors.filter(validColorProfile).filter((profile) => profile.id !== GENERIC_COLORS_ID)
    .map((profile) => ({ id: profile.id, name: profile.name.slice(0, 60), colors: colorPalette(profile), captures: profile.captures,
      ...(typeof profile.updatedAt === 'string' ? { updatedAt: profile.updatedAt } : {}) }))
  const activeCubeBySize: Record<number, string> = {}
  for (const [size, id] of Object.entries(raw.activeCubeBySize ?? {})) {
    if (CUBE_SIZES.includes(Number(size)) && typeof id === 'string'
      && [...cubes, builtinCube(Number(size), 'stickerless'), builtinCube(Number(size), 'stickered')]
        .some((cube) => cube.id === id && cube.size === Number(size))) activeCubeBySize[Number(size)] = id
  }
  const activeColorsId = typeof raw.activeColorsId === 'string' && colors.some((profile) => profile.id === raw.activeColorsId)
    ? raw.activeColorsId : GENERIC_COLORS_ID
  return { cubes, colors, activeCubeBySize, activeColorsId }
}

function legacyColors(value: unknown): Record<string, RGB> | null {
  if (!value || typeof value !== 'object') return null
  const tuples = value as Record<string, unknown>
  const colors = Object.fromEntries(COLOR_KEYS.map((key) => {
    const tuple = tuples[key]
    return [key, Array.isArray(tuple) && tuple.length === 3 ? { r: tuple[0], g: tuple[1], b: tuple[2] } : null]
  }))
  return validColors(colors) ? colors : null
}

// Reads v2 combined cube/color profiles and the older per-size sampling
// object. The caller writes a separate v3 key; this never changes old data.
export function convertLegacySettings(value: unknown): ProfileSettings {
  if (!value || typeof value !== 'object') return EMPTY_SETTINGS
  const raw = value as Record<string, unknown>
  const profiles = Array.isArray(raw.profiles) ? raw.profiles : Object.entries(raw)
    .filter(([size, sampling]) => /^[2-7]$/.test(size) && typeof sampling === 'object')
    .map(([size, sampling]) => ({ id: `legacy-${size}`, name: `Legacy ${size}×${size}`, size: Number(size), sampling }))
  const cubes: CubeSetting[] = []
  const colors: ColorProfile[] = []
  for (const value of profiles) {
    const profile = value as Record<string, unknown> | null
    const cube = {
      id: profile?.id, name: profile?.name, size: profile?.size,
      sampling: { stickerCore: (profile?.sampling as Record<string, unknown> | null)?.stickerCore },
    }
    if (!validCube(cube) || isBuiltinCube(cube.id)) continue
    cubes.push(cube)
    const palette = legacyColors(profile?.learnedColors)
    if (palette) colors.push({ id: `colors-${cube.id}`, name: `${cube.name} colors`.slice(0, 60), colors: palette,
      captures: 1, ...(typeof profile?.learnedAt === 'string' ? { updatedAt: profile.learnedAt } : {}) })
  }
  const activeCubeBySize: Record<number, string> = {}
  const oldActive = raw.active && typeof raw.active === 'object' ? raw.active as Record<string, unknown> : {}
  for (const [size, id] of Object.entries(oldActive)) {
    if (cubes.some((cube) => cube.size === Number(size) && cube.id === id)) activeCubeBySize[Number(size)] = id as string
  }
  const selected = colors.find((profile) => Object.values(activeCubeBySize).some((id) => profile.id === `colors-${id}`))
  return { cubes, colors, activeCubeBySize, activeColorsId: selected?.id ?? colors[0]?.id ?? GENERIC_COLORS_ID }
}

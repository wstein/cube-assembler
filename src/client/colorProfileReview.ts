// Reviewing saved color profiles side by side. Captures are white balanced
// before colors are learned, so two profiles that differ only by the room
// light describe the same stickers. Balancing each profile on its own White
// (von Kries, in linear light) takes that light out before comparing, and
// profiles that stay close can be merged into one.
import { linearChannelToSrgb, rgbToOklab, srgbChannelToLinear, type RGB } from './imageProcessing'
import { AUTO_COLORS_ID, GENERIC_COLORS_ID, deleteColorProfile, type ColorProfile, type ProfileSettings } from './profileSettings'

const COLOR_KEYS = ['W', 'Y', 'O', 'R', 'G', 'B']
// White is equal after balancing, so only these tell profiles apart.
const HUED_KEYS = ['Y', 'O', 'R', 'G', 'B']
// Balanced White: a neutral grey at 90% of full linear brightness.
const BALANCED_WHITE = 0.9

const toLinear = (c: RGB) => [srgbChannelToLinear(c.r), srgbChannelToLinear(c.g), srgbChannelToLinear(c.b)]
const luminance = ([r, g, b]: number[]) => 0.2126 * r + 0.7152 * g + 0.0722 * b

// `colors` scaled per channel so White becomes a neutral grey of linear
// brightness `white`; every other color keeps its relation to White.
export function whiteBalancedColors(colors: Record<string, RGB>, white = BALANCED_WHITE): Record<string, RGB> {
  const w = toLinear(colors.W).map((v) => Math.max(v, 1e-4))
  return Object.fromEntries(Object.entries(colors).map(([key, color]) => {
    const [r, g, b] = toLinear(color).map((v, i) => v / w[i] * white)
    return [key, { r: linearChannelToSrgb(r), g: linearChannelToSrgb(g), b: linearChannelToSrgb(b) }]
  }))
}

// Mean OKLab distance x 100 of the five colored stickers once both
// profiles are balanced: under 5 is hard to tell apart.
export function profileDistance(a: Record<string, RGB>, b: Record<string, RGB>): number {
  const p = whiteBalancedColors(a), q = whiteBalancedColors(b)
  return HUED_KEYS.reduce((sum, key) => {
    const x = rgbToOklab(p[key]), y = rgbToOklab(q[key])
    return sum + 100 * Math.hypot(x.l - y.l, x.a - y.a, x.b - y.b)
  }, 0) / HUED_KEYS.length
}

// Groups in which every profile is within `limit` (see profileDistance) of
// every other one - complete linkage, so a chain of near neighbours never
// pulls two different cubes together.
export function groupSimilarProfiles<T extends Pick<ColorProfile, 'id' | 'colors'>>(profiles: T[], limit: number): T[][] {
  const distance = new Map<string, number>()
  const between = (a: T, b: T) => {
    const key = a.id < b.id ? `${a.id}\n${b.id}` : `${b.id}\n${a.id}`
    if (!distance.has(key)) distance.set(key, profileDistance(a.colors, b.colors))
    return distance.get(key)!
  }
  const groups = profiles.map((profile) => [profile])
  for (;;) {
    let best: { worst: number; i: number; j: number } | null = null
    for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        let worst = 0
        for (const a of groups[i]) for (const b of groups[j]) worst = Math.max(worst, between(a, b))
        if (worst <= limit && (!best || worst < best.worst)) best = { worst, i, j }
      }
    }
    if (!best) return groups
    groups[best.i].push(...groups[best.j])
    groups.splice(best.j, 1)
  }
}

// The largest profileDistance inside a group.
export function groupSpread(profiles: Pick<ColorProfile, 'colors'>[]): number {
  let spread = 0
  for (const a of profiles) for (const b of profiles) if (a !== b) spread = Math.max(spread, profileDistance(a.colors, b.colors))
  return spread
}

// The members balanced to their mean White brightness and averaged in linear
// light: the merged profile keeps the exposure its captures had.
export function mergedColors(profiles: Pick<ColorProfile, 'colors'>[]): Record<string, RGB> {
  const white = profiles.reduce((sum, p) => sum + luminance(toLinear(p.colors.W)), 0) / profiles.length
  const balanced = profiles.map((p) => whiteBalancedColors(p.colors, white))
  return Object.fromEntries(COLOR_KEYS.map((key) => {
    const mean = [0, 1, 2].map((i) => balanced.reduce((sum, colors) => sum + toLinear(colors[key])[i], 0) / balanced.length)
    return [key, { r: linearChannelToSrgb(mean[0]), g: linearChannelToSrgb(mean[1]), b: linearChannelToSrgb(mean[2]) }]
  }))
}

// Replaces the profiles `ids` with one merged profile named `name`, placed
// where the first of them was. The selection and the automatic match move
// to it when they pointed at a merged profile.
export function mergeColorProfiles(settings: ProfileSettings, ids: string[], name: string, updatedAt: string): {
  settings: ProfileSettings; profile: ColorProfile
} {
  const unique = [...new Set(ids)]
  if (unique.length < 2) throw new Error('Pick at least two color profiles')
  if (unique.some((id) => id === GENERIC_COLORS_ID || id === AUTO_COLORS_ID)) throw new Error('Cannot merge built-in colors')
  const members = unique.map((id) => settings.colors.find((profile) => profile.id === id))
  if (members.some((profile) => !profile)) throw new Error('Unknown color profile')
  const trimmed = name.trim().slice(0, 60)
  if (!trimmed) throw new Error('Color profile name required')

  const gone = new Set(unique)
  let id: string
  do { id = `colors-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }
  while (settings.colors.some((profile) => profile.id === id))
  const profile: ColorProfile = {
    id, name: trimmed, colors: mergedColors(members as ColorProfile[]),
    captures: (members as ColorProfile[]).reduce((sum, p) => sum + p.captures, 0), updatedAt,
  }
  const colors = settings.colors.filter((p) => !gone.has(p.id))
  colors.splice(settings.colors.findIndex((p) => gone.has(p.id)), 0, profile)
  const moved = (current?: string) => current !== undefined && gone.has(current) ? id : current
  const autoMatchedColorsId = moved(settings.autoMatchedColorsId)
  const { autoMatchedColorsId: _old, ...rest } = settings
  return {
    settings: { ...rest, colors, activeColorsId: moved(settings.activeColorsId)!, ...(autoMatchedColorsId ? { autoMatchedColorsId } : {}) },
    profile,
  }
}

// Deletes the saved color profiles `ids` (see deleteColorProfile): a deleted
// selection goes back to Automatic, a deleted automatic match is cleared.
export function deleteColorProfiles(settings: ProfileSettings, ids: string[]): ProfileSettings {
  const unique = [...new Set(ids)]
  if (unique.some((id) => id === GENERIC_COLORS_ID || id === AUTO_COLORS_ID)) throw new Error('Cannot delete built-in colors')
  if (unique.some((id) => !settings.colors.some((profile) => profile.id === id))) throw new Error('Unknown color profile')
  const next = unique.reduce(deleteColorProfile, settings)
  if (next.autoMatchedColorsId !== undefined) return next
  const { autoMatchedColorsId: _cleared, ...rest } = next
  return rest
}

// What deleting `ids` changes for the selected and the automatic colors.
export function colorDeletionEffects(settings: ProfileSettings, ids: string[]): string[] {
  const gone = new Set(ids)
  return [
    ...(gone.has(settings.activeColorsId) ? ['Colors switch to Automatic'] : []),
    ...(settings.autoMatchedColorsId && gone.has(settings.autoMatchedColorsId) ? ['Automatic looks for a new match'] : []),
  ]
}

// Saved color profiles that are neither selected nor the automatic match.
export function unusedColorProfiles(settings: ProfileSettings): string[] {
  return settings.colors.filter((profile) => profile.id !== settings.activeColorsId && profile.id !== settings.autoMatchedColorsId).map((profile) => profile.id)
}

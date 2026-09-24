// Cube profiles: per-cube settings the capture flow uses, since cubes
// differ in size, sticker gaps and how much of the cube body shows around
// a face. Each profile belongs to one cube size; each size has one active
// profile, and a size without any profile uses a built-in generic one.
// Pure data handling only - storage (cookie/file) lives in index.tsx.

import { DEFAULT_SAMPLING, paletteDistance, type RGB, type SamplingGeometry } from './imageProcessing'

export interface CubeProfile {
  id: string
  name: string
  size: number
  sampling: SamplingGeometry
  // The 6 sticker colors learned from this cube's last camera capture
  // (rounded RGB), so later captures can read its stickers right from the
  // start - its shades rather than assumed ones. Absent until then.
  learnedColors?: Record<string, [number, number, number]>
  learnedAt?: string
}

const COLOR_KEYS = ['W', 'Y', 'O', 'R', 'G', 'B']

function isLearnedColors(value: unknown): value is Record<string, [number, number, number]> {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return COLOR_KEYS.every((k) => Array.isArray(v[k]) && (v[k] as unknown[]).length === 3
    && (v[k] as unknown[]).every((c) => typeof c === 'number' && c >= 0 && c <= 255))
}

// A profile's learned colors as a palette for classifySticker, if any.
export function profilePalette(profile: CubeProfile): Record<string, RGB> | undefined {
  if (!profile.learnedColors) return undefined
  return Object.fromEntries(Object.entries(profile.learnedColors).map(([k, [r, g, b]]) => [k, { r, g, b }]))
}

export function withLearnedColors(profile: CubeProfile, palette: Record<string, RGB>, at: Date): CubeProfile {
  return {
    ...profile,
    learnedColors: Object.fromEntries(
      COLOR_KEYS.map((k) => [k, [palette[k].r, palette[k].g, palette[k].b].map(Math.round) as [number, number, number]])
    ),
    learnedAt: at.toISOString(),
  }
}

export function withoutLearnedColors(profile: CubeProfile): CubeProfile {
  const { learnedColors: _colors, learnedAt: _at, ...rest } = profile
  return rest
}

export interface ProfileStore {
  profiles: CubeProfile[]
  // Active profile id per cube size.
  active: Record<number, string>
}

export const EMPTY_PROFILE_STORE: ProfileStore = { profiles: [], active: {} }

export const CUBE_SIZES = [2, 3, 4, 5, 6, 7]

// The profile a size uses until the user creates one of their own.
export function genericProfile(size: number): CubeProfile {
  return { id: `generic-${size}`, name: `Generic ${size}×${size}`, size, sampling: DEFAULT_SAMPLING }
}

// Brands offered when adding a cube - just a name to start from; the
// cube's colors are always learned from its own first capture, since
// official brand colors look nothing like what a webcam sees.
export const CUBE_BRANDS = ['GoCube', "Rubik's", 'GAN', 'MoYu', 'QiYi', 'YJ', 'DaYan', 'X-Man', 'Generic']

// Starting sticker gap by construction: stickerless cubes have narrow
// seams between colored tiles, stickered ones a wide black border around
// each sticker. Only a starting point - the sampling setup fine-tunes it.
export const CUBE_STYLES = {
  stickerless: { label: 'Stickerless', sampling: { backgroundGap: 0, stickerCore: 0.65 } },
  stickered: { label: 'Stickers on black', sampling: { backgroundGap: 0, stickerCore: 0.55 } },
} satisfies Record<string, { label: string; sampling: SamplingGeometry }>

export type CubeStyle = keyof typeof CUBE_STYLES

// A new profile for a brand and style, named e.g. "GoCube 3×3" - or
// "GoCube 3×3 (2)" if that name is taken for this size.
export function brandProfile(store: ProfileStore, brand: string, style: CubeStyle, size: number): CubeProfile {
  const base = `${brand} ${size}×${size}`
  const taken = new Set(store.profiles.filter((p) => p.size === size).map((p) => p.name))
  let name = base
  for (let n = 2; taken.has(name); n++) name = `${base} (${n})`
  return { id: newProfileId(), name, size, sampling: CUBE_STYLES[style].sampling }
}

export function newProfileId(): string {
  return `cube-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

function isSamplingGeometry(value: unknown): value is SamplingGeometry {
  const v = value as SamplingGeometry | null
  return typeof v?.backgroundGap === 'number' && typeof v?.stickerCore === 'number'
}

function parseProfile(value: unknown): CubeProfile | null {
  const v = value as Partial<CubeProfile> | null
  if (typeof v?.id !== 'string' || typeof v.name !== 'string') return null
  if (!CUBE_SIZES.includes(v.size as number) || !isSamplingGeometry(v.sampling)) return null
  const profile: CubeProfile = { id: v.id, name: v.name.slice(0, 60), size: v.size as number, sampling: v.sampling }
  if (isLearnedColors(v.learnedColors)) {
    profile.learnedColors = v.learnedColors
    if (typeof v.learnedAt === 'string') profile.learnedAt = v.learnedAt
  }
  return profile
}

// Reads a stored or uploaded store, dropping anything malformed. Also
// accepts the earlier per-size settings ({ "3": { backgroundGap, ... } }),
// turning each size into its generic profile.
export function parseProfileStore(value: unknown): ProfileStore {
  if (!value || typeof value !== 'object') return EMPTY_PROFILE_STORE
  const v = value as Partial<ProfileStore> & Record<string, unknown>
  if (Array.isArray(v.profiles)) {
    const profiles = v.profiles.map(parseProfile).filter((p): p is CubeProfile => p !== null)
    const active: Record<number, string> = {}
    for (const [size, id] of Object.entries(v.active ?? {})) {
      if (profiles.some((p) => p.id === id && p.size === Number(size))) active[Number(size)] = id
    }
    return { profiles, active }
  }
  const profiles = Object.entries(v)
    .filter(([size, sampling]) => /^[2-7]$/.test(size) && isSamplingGeometry(sampling))
    .map(([size, sampling]) => ({ ...genericProfile(Number(size)), sampling: sampling as SamplingGeometry }))
  return { profiles, active: Object.fromEntries(profiles.map((p) => [p.size, p.id])) }
}

export function profilesForSize(store: ProfileStore, size: number): CubeProfile[] {
  const own = store.profiles.filter((p) => p.size === size)
  return own.length > 0 ? own : [genericProfile(size)]
}

export function activeProfile(store: ProfileStore, size: number): CubeProfile {
  const candidates = profilesForSize(store, size)
  return candidates.find((p) => p.id === store.active[size]) ?? candidates[0]
}

// Adds or replaces a profile (by id) and makes it its size's active one.
export function saveProfile(store: ProfileStore, profile: CubeProfile): ProfileStore {
  const exists = store.profiles.some((p) => p.id === profile.id)
  return {
    profiles: exists ? store.profiles.map((p) => (p.id === profile.id ? profile : p)) : [...store.profiles, profile],
    active: { ...store.active, [profile.size]: profile.id },
  }
}

export function selectProfile(store: ProfileStore, size: number, id: string): ProfileStore {
  return { ...store, active: { ...store.active, [size]: id } }
}

export function deleteProfile(store: ProfileStore, id: string): ProfileStore {
  const active = { ...store.active }
  for (const [size, activeId] of Object.entries(active)) if (activeId === id) delete active[Number(size)]
  return { profiles: store.profiles.filter((p) => p.id !== id), active }
}

// Another cube's colors have to be at least this much closer than the
// selected cube's own before it's suggested - lighting alone shifts a
// cube's colors between captures, so a narrow lead isn't evidence.
const SUGGEST_RATIO = 0.7

// The saved cube a capture's learned colors most resemble, when that's
// clearly not the selected one - a hint that the wrong profile is picked.
// Only compares against cubes whose colors are known, the selected one
// included; with nothing to compare to, no suggestion.
export function suggestProfile(store: ProfileStore, selected: CubeProfile, learned: Record<string, RGB>): CubeProfile | null {
  const ownPalette = profilePalette(selected)
  if (!ownPalette) return null
  const ownDistance = paletteDistance(learned, ownPalette)
  let best: { profile: CubeProfile; distance: number } | null = null
  for (const profile of store.profiles) {
    const palette = profile.size === selected.size && profile.id !== selected.id ? profilePalette(profile) : undefined
    if (!palette) continue
    const distance = paletteDistance(learned, palette)
    if (!best || distance < best.distance) best = { profile, distance }
  }
  return best && best.distance < ownDistance * SUGGEST_RATIO ? best.profile : null
}

// Cube profiles: per-cube settings the capture flow uses, since cubes
// differ in size, sticker gaps and how much of the cube body shows around
// a face. Each profile belongs to one cube size; each size has one active
// profile, and a size without any profile uses a built-in generic one.
// Pure data handling only - storage (cookie/file) lives in index.tsx.

import { DEFAULT_SAMPLING, type SamplingGeometry } from './imageProcessing'

export interface CubeProfile {
  id: string
  name: string
  size: number
  sampling: SamplingGeometry
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
  return { id: v.id, name: v.name.slice(0, 60), size: v.size as number, sampling: v.sampling }
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

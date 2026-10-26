import type { FaceCaptureData, PreviewColorProfile } from './captureTypes'

// The color profile that read most of the captured faces live (the first one
// to read the most when profiles tie); null when no face recorded one.
export function readWithProfile(
  captured: Record<string, FaceCaptureData>,
  order: readonly string[],
): PreviewColorProfile | null {
  const uses = new Map<
    string,
    { profile: PreviewColorProfile; count: number }
  >()
  for (const key of order) {
    const profile = captured[key]?.previewColorProfile
    if (!profile) continue
    const entry = uses.get(profile.id) ?? { profile, count: 0 }
    entry.count++
    uses.set(profile.id, entry)
  }
  let best: { profile: PreviewColorProfile; count: number } | null = null
  for (const entry of uses.values())
    if (!best || entry.count > best.count) best = entry
  return best?.profile ?? null
}

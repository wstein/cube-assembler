// The profiles page lives at #profiles, one tab per kind of profile:
// typed entry point for src/core/app/AppLinks.res.
import {
  profilesHash as profilesHashRes,
  profilesTab as profilesTabRes,
} from '../../core/app/AppLinks.gen'

export type ProfilesTab = 'colors' | 'cubes'

export function profilesTab(hash: string): ProfilesTab | null {
  return profilesTabRes(hash)
}

export function profilesHash(tab: ProfilesTab): string {
  return profilesHashRes(tab)
}

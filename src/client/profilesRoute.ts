// The profiles page lives at #profiles, one tab per kind of profile. The old
// #colors link from before the Cubes tab still opens Colors.
export type ProfilesTab = 'colors' | 'cubes'

export function profilesTab(hash: string): ProfilesTab | null {
  if (hash === '#profiles' || hash === '#profiles/colors' || hash === '#colors') return 'colors'
  if (hash === '#profiles/cubes') return 'cubes'
  return null
}

export function profilesHash(tab: ProfilesTab): string {
  return `#profiles/${tab}`
}

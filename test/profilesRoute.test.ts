import { describe, expect, it } from 'vitest'
import { profilesHash, profilesTab } from '../src/client/profilesRoute'

describe('profiles page route', () => {
  it('opens the Colors tab at #profiles and at the old #colors link', () => {
    expect(profilesTab('#profiles')).toBe('colors')
    expect(profilesTab('#profiles/colors')).toBe('colors')
    expect(profilesTab('#colors')).toBe('colors')
  })

  it('opens the Cubes tab at #profiles/cubes', () => {
    expect(profilesTab('#profiles/cubes')).toBe('cubes')
    expect(profilesHash('cubes')).toBe('#profiles/cubes')
  })

  it('shows the scanner for any other hash', () => {
    expect(profilesTab('')).toBeNull()
    expect(profilesTab('#')).toBeNull()
    expect(profilesTab('#profilesx')).toBeNull()
  })
})

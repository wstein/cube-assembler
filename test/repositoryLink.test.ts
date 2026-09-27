import { describe, expect, it } from 'vitest'
import { repositoryLink } from '../src/client/repositoryLink'

describe('repository link', () => {
  it('uses a short visible hash and links to the source tree at that revision', () => {
    expect(repositoryLink('1234567890abcdef')).toEqual({
      href: 'https://github.com/wstein/cube-assembler/tree/1234567890abcdef',
      label: 'GitHub · 1234567',
    })
  })

  it('marks a dirty checkout without putting the suffix in the URL', () => {
    expect(repositoryLink('abcdef1234-dirty')).toEqual({
      href: 'https://github.com/wstein/cube-assembler/tree/abcdef1234',
      label: 'GitHub · abcdef1-dirty',
    })
  })

  it('links to the repository when the commit is unavailable', () => {
    expect(repositoryLink('unknown')).toEqual({
      href: 'https://github.com/wstein/cube-assembler',
      label: 'GitHub',
    })
  })
})

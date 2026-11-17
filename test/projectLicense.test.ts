import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string): string =>
  readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

describe('project license', () => {
  it('declares AGPL-3.0-or-later in package.json', () => {
    const pkg = JSON.parse(read('package.json')) as { license: string }
    expect(pkg.license).toBe('AGPL-3.0-or-later')
  })

  it('ships the GNU AGPL version 3 text as LICENSE', () => {
    const lines = read('LICENSE').split('\n')
    expect(lines[0].trim()).toBe('GNU AFFERO GENERAL PUBLIC LICENSE')
    expect(lines[1].trim()).toBe('Version 3, 19 November 2007')
  })

  it('names the AGPL and not MIT in the own-license statements', () => {
    const readme = read('README.md')
    const section = readme.slice(readme.indexOf('## License and trademarks'))
    expect(section).toContain('AGPL-3.0-or-later')
    expect(section).not.toMatch(/\bMIT\b/)
    expect(readme).toContain('License-AGPL--3.0--or--later')
    expect(readme).not.toContain('License-MIT')
    expect(read('CONTRIBUTING.md')).toContain('AGPL-3.0-or-later')
    expect(read('CONTRIBUTING.md')).not.toMatch(/project's \[MIT License\]/)
    expect(read('AGENTS.md')).not.toMatch(/CubeAssembler\s+is MIT/)
  })
})

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string): string =>
  readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

// SHA-256 of https://www.gnu.org/licenses/agpl-3.0.txt (LF line endings).
const AGPL_3_SHA256 =
  '0d96a4ff68ad6d4b6f1f30f713b18d5184912ba8dd389f86aa7710db079abcb0'

describe('project license', () => {
  it('declares AGPL-3.0-or-later in package.json', () => {
    const pkg = JSON.parse(read('package.json')) as { license: string }
    expect(pkg.license).toBe('AGPL-3.0-or-later')
  })

  it('declares AGPL-3.0-or-later for the root entry of package-lock.json', () => {
    const lock = JSON.parse(read('package-lock.json')) as {
      packages: Record<string, { license?: string }>
    }
    expect(lock.packages[''].license).toBe('AGPL-3.0-or-later')
  })

  it('ships the complete GNU AGPL version 3 text as LICENSE', () => {
    const text = read('LICENSE').replace(/\r\n/g, '\n')
    expect(createHash('sha256').update(text).digest('hex')).toBe(AGPL_3_SHA256)
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
    expect(read('AGENTS.md').replace(/\s+/g, ' ')).toContain(
      'CubeAssembler is AGPL-3.0-or-later',
    )
  })
})

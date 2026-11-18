import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string): string =>
  readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const page = (): string => read('public/licenses/index.html')

// Every bundled or vendored third-party component needs an entry with its license name and a license text.
const ENTRIES: ReadonlyArray<{
  name: string
  file: string
  license: string
  sha256: string
}> = [
  {
    name: 'three.js',
    file: 'three.LICENSE',
    license: 'MIT',
    sha256: '8b378ebe60e2fe500158cb0ac71cb5e8b7d92953c2abcc63a0eb90499653b5bc',
  },
  {
    name: '@rescript/runtime',
    file: 'rescript-runtime.LICENSE',
    license: 'MIT',
    sha256: '5fb9a2cbdb422b4bf31100b9208d661ab9abf96d33c137e8d3755f2626d0b83b',
  },
  {
    name: '@puzlwerk/viewer',
    file: 'agpl-3.0.LICENSE',
    license: 'AGPL-3.0-or-later',
    sha256: '0d96a4ff68ad6d4b6f1f30f713b18d5184912ba8dd389f86aa7710db079abcb0',
  },
  {
    name: 'PuzlWerk capture recovery',
    file: 'eupl-1.2.LICENSE',
    license: 'EUPL-1.2 OR AGPL-3.0-or-later',
    sha256: '57fb42fbcd0b037ce528ed8f72f1ec095d67bc6825ecf1448ff39be1fe68a4b4',
  },
]

describe('third-party licenses page', () => {
  for (const entry of ENTRIES) {
    it(`lists ${entry.name} with ${entry.license} and links its text`, () => {
      const item = page()
        .split('<li>')
        .find((li) => li.includes(entry.name))
      expect(item, `entry for ${entry.name}`).toBeDefined()
      expect(item).toContain(entry.license)
      expect(item).toContain(`href="${entry.file}"`)
      expect(
        existsSync(
          new URL(`../public/licenses/${entry.file}`, import.meta.url),
        ),
      ).toBe(true)
      const text = read(`public/licenses/${entry.file}`).replace(/\r\n/g, '\n')
      expect(createHash('sha256').update(text).digest('hex')).toBe(entry.sha256)
    })
  }

  it('links only license files that exist', () => {
    for (const [, href] of page().matchAll(/href="([^"]+\.LICENSE)"/g)) {
      expect(
        existsSync(new URL(`../public/licenses/${href}`, import.meta.url)),
        href,
      ).toBe(true)
    }
  })

  it('states both licenses of the capture-recovery Core and which archive carries which', () => {
    const html = page().replace(/\s+/g, ' ')
    expect(html).toContain('EUPL-1.2 OR AGPL-3.0-or-later')
    expect(html).toContain('vendored archive 0.4.0')
    expect(html).not.toContain('vendored archive 0.3.0')
    expect(html).toContain(
      '<code>EUPL-1.2 OR AGPL-3.0-or-later</code> at your choice (<a href="eupl-1.2.LICENSE">EUPL-1.2</a>, <a href="agpl-3.0.LICENSE">AGPL-3.0-or-later</a>)',
    )
    expect(html).toContain(
      'Archives 0.1.0 and 0.3.0 were distributed under EUPL-1.2 only',
    )
    expect(html).toContain('CUBE_ASSEMBLER_LICENSE.txt')
  })
})

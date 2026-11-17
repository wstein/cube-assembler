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
  text: RegExp
}> = [
  {
    name: 'three.js',
    file: 'three.LICENSE',
    license: 'MIT',
    text: /The MIT License/,
  },
  {
    name: '@rescript/runtime',
    file: 'rescript-runtime.LICENSE',
    license: 'MIT',
    text: /MIT License/,
  },
  {
    name: '@puzlwerk/viewer',
    file: 'agpl-3.0.LICENSE',
    license: 'AGPL-3.0-or-later',
    text: /GNU AFFERO GENERAL PUBLIC LICENSE/,
  },
  {
    name: 'PuzlWerk capture recovery',
    file: 'eupl-1.2.LICENSE',
    license: 'EUPL-1.2 OR AGPL-3.0-or-later',
    text: /EUROPEAN UNION PUBLIC LICEN[C]E v\. 1\.2/,
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
      expect(read(`public/licenses/${entry.file}`)).toMatch(entry.text)
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
    expect(html).toMatch(/0\.3\.0 was distributed under EUPL-1\.2 only/)
  })
})

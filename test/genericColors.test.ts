import { describe, expect, it } from 'vitest'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { readFixtureColors } from '../src/client/fixtureFormat'
import { STICKER_COLORS, classifySticker, type RGB } from '../src/client/imageProcessing'
import { genericColorProfile } from '../src/client/profileSettings'

// Real capture readings (gitignored, like test/fixtures.test.ts) read with
// the Generic colors palette alone - what Automatic previews with before any
// saved profile fits. GENERIC_STICKER_COLORS was averaged from these same
// captures; averaged from all the others instead, each capture still read
// 97.2%, so this is a regression guard, not a measure of other cameras.
const root = join(__dirname, 'fixtures')
const captures = existsSync(root)
  ? readdirSync(root).filter((name) => name.startsWith('capture-') && existsSync(join(root, name, 'meta.json')))
  : []

function stickers(): Array<{ rgb: RGB; truth: string }> {
  return captures.flatMap((name) => {
    const meta = JSON.parse(readFileSync(join(root, name, 'meta.json'), 'utf8'))
    const colors = readFixtureColors(meta)?.colors
    if (!colors) return []
    return Object.keys(meta.faces).flatMap((slot) => {
      const readings = meta.faces[slot].readings as number[][] | undefined
      const truth = colors[slot.toUpperCase()]?.flat()
      if (!readings || !truth || readings.length !== truth.length) return []
      return readings.map(([r, g, b], i) => ({ rgb: { r, g, b }, truth: truth[i] }))
    })
  })
}

describe('Generic colors on real captures', () => {
  if (captures.length === 0) {
    it.skip('requires saved real captures', () => {})
    return
  }

  it('reads nearly every sticker, far better than pure RGB references', () => {
    const all = stickers()
    const share = (palette: Record<string, RGB>) => all.filter((s) => classifySticker(s.rgb, palette).color === s.truth).length / all.length
    expect(all.length).toBeGreaterThan(1000)
    expect(share(genericColorProfile().colors)).toBeGreaterThan(0.95)
    expect(share(STICKER_COLORS)).toBeLessThan(0.8)
  })
})

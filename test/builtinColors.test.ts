import { describe, expect, it } from 'vitest'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { readFixtureColors } from '../src/client/fixtureFormat'
import {
  STICKER_COLORS,
  classifySticker,
  type RGB,
} from '../src/client/imageProcessing'
import { builtinColorProfiles } from '../src/client/profileSettings'

// Real capture readings show whether the bundled palettes improve on pure RGB.
const root = join(__dirname, 'fixtures')
const captures = existsSync(root)
  ? readdirSync(root).filter(
      (name) =>
        name.startsWith('capture-') &&
        existsSync(join(root, name, 'meta.json')),
    )
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
      return readings.map(([r, g, b], i) => ({
        rgb: { r, g, b },
        truth: truth[i],
      }))
    })
  })
}

describe('built-in colors on real captures', () => {
  if (captures.length === 0) {
    it.skip('requires saved real captures', () => {})
    return
  }

  it('includes a palette that reads better than pure RGB references', () => {
    const all = stickers()
    const share = (palette: Record<string, RGB>) =>
      all.filter((s) => classifySticker(s.rgb, palette).color === s.truth)
        .length / all.length
    expect(all.length).toBeGreaterThan(1000)
    const bestBuiltIn = Math.max(
      ...builtinColorProfiles().map((profile) => share(profile.colors)),
    )
    expect(bestBuiltIn).toBeGreaterThan(share(STICKER_COLORS))
  })
})

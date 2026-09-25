import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import jpeg from 'jpeg-js'
import { hasPlausibleStickerFace } from '../src/client/imageProcessing'
import { estimateOuterCellRatio } from '../src/client/gridAlignment'

const fixtureRoot = join(__dirname, 'fixtures')
const captures = readdirSync(fixtureRoot)
  .filter((name) => name !== 'synthetic-sanity-check' && existsSync(join(fixtureRoot, name, 'meta.json')))

describe('live sticker appearance on real capture crops', () => {
  if (captures.length === 0) {
    it.skip('requires saved real captures', () => {})
  }
  for (const name of captures) {
    it(`recognizes all faces in ${name}`, () => {
      const directory = join(fixtureRoot, name)
      const meta = JSON.parse(readFileSync(join(directory, 'meta.json'), 'utf8')) as {
        gridSize: number
        faces: Record<string, { photo: string }>
      }
      for (const face of ['u', 'r', 'f', 'd', 'l', 'b']) {
        const image = jpeg.decode(readFileSync(join(directory, meta.faces[face].photo)))
        const data = new Uint8ClampedArray(image.data)
        // Judged in the layout the app samples it in (see hasVisibleCubeFace):
        // big cubes' outer cubies can be 1.6x as wide as the inner ones.
        const outer = estimateOuterCellRatio(data, image.width, image.height, meta.gridSize)
        expect(hasPlausibleStickerFace(data, image.width, image.height, meta.gridSize, outer), `${name} face ${face}`).toBe(true)
      }
    })
  }
})

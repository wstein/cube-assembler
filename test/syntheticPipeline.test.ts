import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { classifyAcrossFaces } from '../src/client/capture/captureRecalibration'
import { NEUTRAL_GAINS } from '../src/client/vision/colorMath'
import { extractColorsFromImageData } from '../src/client/vision/faceDetection'
import { readFixtureColors } from '../src/client/fixtures/fixtureFormat'
import { DEFAULT_SAMPLING } from '../src/client/vision/stickerColorGeometry'
import { PRESETS, renderFace } from '../src/client/vision/syntheticFace'

// All six faces of valid cubes, rendered in every preset, through the app's
// own pipeline: each face read on its own, then the cross-face step that
// compares the faces and corrects what one face alone cannot know (a color
// cast over a photo).
const SIZE = 300
const FACES = ['U', 'R', 'F', 'D', 'L', 'B']
// Valid cubes saved as fixtures, one per size.
const CUBES = [
  'cube-2x2-2026-09-27T15-03-12',
  'cube-3x3-2026-09-27T08-56-38',
  'cube-4x4-2026-09-27T09-05-57',
  'cube-5x5-2026-09-27T09-07-51',
]

function colorsOf(name: string) {
  const meta = JSON.parse(
    readFileSync(join(__dirname, 'fixtures', name, 'meta.json'), 'utf8'),
  )
  return { n: meta.gridSize as number, colors: readFixtureColors(meta)!.colors }
}

// The stickers of the cube the pipeline gets wrong, in every seed.
function misreads(preset: string) {
  const wrong: string[] = []
  for (const name of CUBES) {
    const { n, colors } = colorsOf(name)
    for (const seed of [1, 2]) {
      const measured: Record<
        string,
        ReturnType<typeof extractColorsFromImageData>
      > = {}
      FACES.forEach((face, i) => {
        measured[face.toLowerCase()] = extractColorsFromImageData(
          renderFace(colors[face], preset, seed * 10 + i, SIZE),
          SIZE,
          SIZE,
          n,
          NEUTRAL_GAINS,
          DEFAULT_SAMPLING,
        )
      })
      const classified = classifyAcrossFaces(measured)
      FACES.forEach((face) =>
        colors[face].forEach((row: string[], r: number) =>
          row.forEach((color, c) => {
            const got = classified.faces[face.toLowerCase()].colors[r][c]
            if (got !== color)
              wrong.push(
                `${name} seed ${seed} ${face}(${r},${c}): ${color}->${got}`,
              )
          }),
        ),
      )
    }
  }
  return wrong
}

// Presets the pipeline misreads are findings. They stay listed as known
// failures (it.fails), which turns red once the pipeline handles them.
const MISREAD: Record<string, string> = {
  'dim-warm':
    'a very dark, warm, uniform shot: on 5x5 yellow, orange and white stickers are moved into each other',
}

describe('synthetic presets through the six-face pipeline', () => {
  for (const preset of PRESETS)
    (MISREAD[preset] ? it.fails : it)(
      `reads every sticker of the ${preset} preset back as drawn${MISREAD[preset] ? ` [known failure: ${MISREAD[preset]}]` : ''}`,
      () => {
        expect(misreads(preset)).toEqual([])
      },
      240_000,
    )
})

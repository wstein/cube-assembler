// Deterministic browser-importable counterparts of the legal Core fixtures.
// These JPEGs are synthetic color grids, not photographs of a physical cube.
import { readFileSync, writeFileSync } from 'node:fs'
import { encode } from 'jpeg-js'
import { strToU8, zipSync } from 'fflate'

const fixture = JSON.parse(
  readFileSync(
    new URL('../test/fixtures/guided-4x4-acceptance.json', import.meta.url),
  ),
)
const slots = ['U', 'R', 'F', 'D', 'L', 'B']
const palette = {
  W: [247, 246, 241],
  R: [207, 42, 58],
  G: [30, 158, 87],
  Y: [242, 210, 27],
  O: [255, 122, 26],
  B: [36, 89, 214],
}
for (const sample of fixture.cases) {
  const files = {}
  for (const slot of slots) {
    const size = 192
    const data = Buffer.alloc(size * size * 4)
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const rgb =
          palette[sample.captured[slot][Math.floor(y / 48)][Math.floor(x / 48)]]
        const offset = (y * size + x) * 4
        for (let channel = 0; channel < 3; channel++)
          data[offset + channel] = rgb[channel]
        data[offset + 3] = 255
      }
    files[`face-${slot.toLowerCase()}.jpg`] = encode(
      { width: size, height: size, data },
      100,
    ).data
  }
  const colors = slots
    .map((slot) => sample.captured[slot].flat().join(''))
    .join(' ')
  files['meta.json'] = strToU8(
    JSON.stringify(
      {
        gridSize: 4,
        colorsURFDLB: colors,
        detectedURFDLB: colors,
        capture: { protocol: 'sides-then-top-bottom/v1', mirrored: false },
        synthetic: {
          description:
            'Generated sticker-grid JPEGs; not physical cube photographs.',
          case: sample.name,
          generator: fixture.generator,
          sequence: sample.sequence,
          expectedRetainedAlternatives: sample.legacyAlternatives,
          truncated: sample.truncated,
          provenance:
            'guided-4x4-acceptance.json; no measured v2 observations or saved approval',
        },
        faces: Object.fromEntries(
          slots.map((slot) => [
            slot.toLowerCase(),
            { photo: `face-${slot.toLowerCase()}.jpg` },
          ]),
        ),
      },
      null,
      2,
    ),
  )
  const archive = zipSync(files, {
    level: 9,
    mtime: new Date('2026-11-16T00:00:00Z'),
  })
  writeFileSync(
    new URL(
      `../test/fixtures/synthetic-4x4-${sample.name}.zip`,
      import.meta.url,
    ),
    archive,
  )
}

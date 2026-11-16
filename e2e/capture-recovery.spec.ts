import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate'
import { encode as encodeJpeg } from 'jpeg-js'
import { readFixtureColors } from '../src/client/fixtures/fixtureFormat'
import {
  captureFrame,
  initializeMapping,
  validateMapping,
} from '../src/client/capture/captureFaceMapping'

const archive = resolve('test/fixtures/orientation-recovery-7x7.zip')
async function upload(page: Page, bytes: Uint8Array) {
  await page.goto('/')
  await page.locator('.capture-alternatives input[type="file"]').setInputFiles({
    name: 'capture.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from(bytes),
  })
  await page
    .getByRole('heading', { name: 'Does this match your cube?' })
    .waitFor({ timeout: 30000 })
}
async function savedFixture(page: Page) {
  await page
    .getByRole('button', { name: 'Save as test fixture', exact: true })
    .click()
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download zip', exact: true }).click()
  const download = await pending
  const path = await download.path()
  if (!path) throw new Error('Missing fixture download')
  const bytes = readFileSync(path)
  const zip = unzipSync(bytes)
  const key = Object.keys(zip).find((name) => name.endsWith('meta.json'))!
  return { bytes, zip, meta: JSON.parse(strFromU8(zip[key])) }
}
function solidArchive(size: number) {
  const letters = ['W', 'R', 'G', 'Y', 'O', 'B']
  const rgb = [
    [242, 242, 232],
    [214, 44, 44],
    [23, 155, 87],
    [242, 210, 27],
    [241, 139, 35],
    [36, 89, 214],
  ]
  const keys = ['u', 'r', 'f', 'd', 'l', 'b']
  const zip: Record<string, Uint8Array> = {}
  keys.forEach((face, i) => {
    const data = Buffer.alloc(128 * 128 * 4)
    for (let pixel = 0; pixel < 128 * 128; pixel++) {
      data[pixel * 4] = rgb[i][0]
      data[pixel * 4 + 1] = rgb[i][1]
      data[pixel * 4 + 2] = rgb[i][2]
      data[pixel * 4 + 3] = 255
    }
    zip[`face-${face}.jpg`] = encodeJpeg(
      { width: 128, height: 128, data },
      100,
    ).data
  })
  zip['meta.json'] = strToU8(
    JSON.stringify({
      gridSize: size,
      colorsURFDLB: letters
        .map((letter) => letter.repeat(size * size))
        .join(' '),
      faces: Object.fromEntries(
        keys.map((face) => [face, { photo: `face-${face}.jpg` }]),
      ),
      capture: { mirrored: false },
    }),
  )
  return zipSync(zip)
}
// Legacy exports remain supported; creating one here does not expose free
// corrections in the product. These exact mappings passed the previous suite.
function legacyArchive(bytes: Uint8Array, patterned = false) {
  const zip = unzipSync(bytes)
  const key = Object.keys(zip).find((name) => name.endsWith('meta.json'))!
  const meta = JSON.parse(strFromU8(zip[key]))
  const raw = readFixtureColors(meta)!.colors
  const targets = ['U', 'F', 'L', 'D', 'B', 'R'] as const
  const turns = patterned ? [1, 3, 1, 3, 2, 0] : [1, 0, 0, 0, 0, 0]
  const mapping = initializeMapping(raw, null).map((entry, index) => ({
    ...entry,
    target: patterned ? entry.target : targets[index],
    quarterTurns: turns[index],
  }))
  const checked = validateMapping(raw, mapping, meta.gridSize)
  expect(checked.valid).toBe(true)
  const frontSlot = patterned ? 'U' : 'R'
  const upSlot = patterned ? 'B' : 'U'
  const frame = captureFrame(raw, mapping, frontSlot, upSlot)!
  expect(frame).not.toBeNull()
  const record = {
    stateRelation: 'capture',
    version: 1,
    transformConvention: 'cube-geometry-orientations/v1',
    view: 'capture',
    mapping,
    captureFrame: {
      guideObservations: [],
      frontSlot,
      upSlot,
      confirmed: true,
      displayTransform: frame.displayTransform,
      canonicalTransform: frame.canonicalTransform,
      photoTransforms: frame.mapping,
      protocol: meta.capture.protocol ?? null,
      mirrored: meta.capture.mirrored,
      turnDirection: 'unknown',
      capOrder: 'unknown',
      displayedArrows: [],
    },
  }
  meta.capture.faceRecovery = record
  meta.capture.assembledURFDLB = (['U', 'R', 'F', 'D', 'L', 'B'] as const)
    .map((face) => checked.faces![face].flat().join(''))
    .join(' ')
  zip[key] = strToU8(JSON.stringify(meta))
  return { bytes: zipSync(zip), zip, record }
}
async function noFreeControls(page: Page) {
  await expect(
    page.getByText('Advanced recovery', { exact: true }),
  ).toHaveCount(0)
  await expect(page.locator('.face-recovery-photo')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Rotate Side/ })).toHaveCount(0)
  await expect(page.getByLabel(/Assign Side .* to face/)).toHaveCount(0)
}

test('correct original 7x7 photos offer only constrained choices after rejection', async ({
  page,
}) => {
  await upload(page, readFileSync(archive))
  await page
    .getByRole('button', {
      name: /^Alternatives \([1-9][0-9]*\)$/,
    })
    .click()
  await noFreeControls(page)
  const net = page.getByRole('group', {
    name: 'Recognized cube net',
    exact: true,
  })
  await expect(net.getByRole('button')).toHaveCount(6)
  await expect(page.locator('.spatial-candidate')).toHaveCount(2)
  await page.locator('.spatial-candidate').first().click()
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(
    page.getByLabel('Capture top photo', { exact: true }),
  ).toHaveCount(0)
  await page.getByRole('button', { name: 'Use this cube', exact: true }).click()
  const saved = await savedFixture(page)
  expect(saved.meta.capture.faceRecovery.captureFrame.confirmed).toBe(false)
  for (const key of Object.keys(saved.zip).filter((name) =>
    name.endsWith('.jpg'),
  )) {
    const original = Object.keys(unzipSync(readFileSync(archive))).find(
      (name) => name.endsWith(key.split('/').at(-1)!),
    )!
    expect(
      Buffer.from(saved.zip[key]).equals(
        Buffer.from(unzipSync(readFileSync(archive))[original]),
      ),
    ).toBe(true)
  }
})

for (const size of [2, 4, 6, 8])
  test(`legacy ${size}x${size} face assignments and pose survive displayed approval and roundtrip`, async ({
    page,
  }) => {
    const legacy = legacyArchive(solidArchive(size))
    await upload(page, legacy.bytes)
    const displayed = await page
      .locator('.approval-detected .orientation-net-sticker')
      .evaluateAll((elements) =>
        elements.map((element) => (element as HTMLElement).style.background),
      )
    await page
      .getByRole('button', { name: 'Yes, this is my cube', exact: true })
      .click()
    await expect(page.locator('.face-recovery')).toHaveCount(0)
    const actual = await page
      .locator('.cube-net .net-cell')
      .evaluateAll((elements) =>
        elements.map((element) => (element as HTMLElement).style.background),
      )
    expect(actual).toEqual(displayed)
    const saved = await savedFixture(page)
    expect(saved.meta.capture.faceRecovery).toEqual({
      ...legacy.record,
      view: 'canonical',
    })
    await upload(page, saved.bytes)
    await page
      .getByRole('button', { name: 'Yes, this is my cube', exact: true })
      .click()
    const again = await savedFixture(page)
    expect(again.meta.capture.faceRecovery).toEqual({
      ...legacy.record,
      view: 'canonical',
    })
  })

test('patterned 7x7 legacy rotations preserve exact photo identities and mirrored provenance', async ({
  page,
}) => {
  const legacy = legacyArchive(readFileSync(archive), true)
  await upload(page, legacy.bytes)
  const displayed = await page
    .locator('.approval-detected .orientation-net-sticker')
    .evaluateAll((elements) =>
      elements.map((element) => (element as HTMLElement).style.background),
    )
  await page
    .getByRole('button', { name: 'Yes, this is my cube', exact: true })
    .click()
  expect(
    await page
      .locator('.cube-net .net-cell')
      .evaluateAll((elements) =>
        elements.map((element) => (element as HTMLElement).style.background),
      ),
  ).toEqual(displayed)
  const saved = await savedFixture(page)
  expect(saved.meta.capture.faceRecovery).toEqual({
    ...legacy.record,
    view: 'canonical',
  })
  expect(saved.meta.capture.mirrored).toBe(true)
  for (const key of Object.keys(saved.zip).filter((name) =>
    name.endsWith('.jpg'),
  )) {
    const original = Object.keys(legacy.zip).find((name) =>
      name.endsWith(key.split('/').at(-1)!),
    )!
    expect(
      Buffer.from(saved.zip[key]).equals(Buffer.from(legacy.zip[original])),
    ).toBe(true)
  }
})

for (const size of [3, 5])
  test(`resolved ${size}x${size} faces skip unnecessary questions`, async ({
    page,
  }) => {
    await upload(page, solidArchive(size))
    await expect(
      page.getByRole('button', { name: 'Alternatives (0)', exact: true }),
    ).toBeDisabled()
    await expect(
      page.getByRole('button', { name: 'Yes, this is my cube', exact: true }),
    ).toBeEnabled()
  })

test('displayed approval keeps unknown physical pose across export and reimport', async ({
  page,
}) => {
  await upload(page, readFileSync(archive))
  const displayed = await page
    .locator('.approval-detected .orientation-net-sticker')
    .evaluateAll((elements) =>
      elements.map((element) => (element as HTMLElement).style.background),
    )
  await page
    .getByRole('button', { name: 'Yes, this is my cube', exact: true })
    .click()
  await expect(page.locator('.face-recovery')).toHaveCount(0)
  expect(
    await page
      .locator('.cube-net .net-cell')
      .evaluateAll((elements) =>
        elements.map((element) => (element as HTMLElement).style.background),
      ),
  ).toEqual(displayed)
  const saved = await savedFixture(page)
  expect(saved.meta.capture.faceRecovery.view).toBe('canonical')
  expect(saved.meta.capture.faceRecovery.captureFrame.confirmed).toBe(false)
  expect(saved.meta.capture.faceRecovery.stateRelation).toBe('capture')
  await upload(page, saved.bytes)
  await page
    .getByRole('button', { name: 'Yes, this is my cube', exact: true })
    .click()
  expect((await savedFixture(page)).meta.capture.faceRecovery).toEqual(
    saved.meta.capture.faceRecovery,
  )
})

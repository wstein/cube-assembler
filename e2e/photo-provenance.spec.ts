import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'

const files = unzipSync(
  readFileSync('test/fixtures/photo-identity-4x4-2026-11-16T21-28-43.zip'),
)
const sha = (bytes: Uint8Array) =>
  createHash('sha256').update(bytes).digest('hex')

for (const approved of [false, true])
  test(`keeps the six original photo sources ${approved ? 'after importing approval' : 'before Use this cube'}`, async ({
    page,
  }) => {
    const meta = JSON.parse(strFromU8(files['meta.json']))
    if (!approved) {
      delete meta.capture.faceRecovery
      meta.capture.assembledURFDLB = null
    }
    await page.goto('/')
    await page.locator('.capture-alternatives input[type=file]').setInputFiles({
      name: 'photo-identity.zip',
      mimeType: 'application/zip',
      buffer: Buffer.from(
        zipSync({ ...files, 'meta.json': strToU8(JSON.stringify(meta)) }),
      ),
    })
    const dialog = page.getByRole('dialog').filter({
      has: page.getByRole('heading', { name: 'Does this match your cube?' }),
    })
    await expect(dialog).toBeVisible()
    const sources = { U: 'L', R: 'U', F: 'D', D: 'B', L: 'F', B: 'R' }
    const hashes = []
    for (const [target, slot] of Object.entries(sources)) {
      const photo = dialog
        .getByRole('button', {
          name: `Check colors for ${target} face`,
          exact: true,
        })
        .locator('img.orientation-net-photo')
      await expect(photo).toHaveCount(1)
      const source = await photo.getAttribute('src')
      const hash = sha(Buffer.from(source!.split(',')[1], 'base64'))
      hashes.push(hash)
      expect(hash).toBe(sha(files[`face-${slot.toLowerCase()}.jpg`]))
      await expect(photo).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)')
    }
    expect(new Set(hashes).size).toBe(6)
    // Merely inspecting source images must not create or approve an assembly.
    await expect(page.locator('.cube-display-card')).toHaveCount(0)
    if (approved) {
      await dialog
        .getByRole('button', { name: 'Yes, this is my cube', exact: true })
        .click()
      await page
        .getByRole('button', { name: 'Save as test fixture', exact: true })
        .click()
    } else {
      await dialog.getByRole('button', { name: 'Close', exact: true }).click()
      await page
        .getByRole('button', { name: 'Save capture', exact: true })
        .click()
    }
    const pending = page.waitForEvent('download')
    await page
      .getByRole('button', { name: 'Download zip', exact: true })
      .click()
    const downloaded = await (await pending).path()
    if (!downloaded) throw new Error('Missing capture download')
    const saved = readFileSync(downloaded)
    const exported = unzipSync(saved)
    const metadata = JSON.parse(
      strFromU8(
        exported[
          Object.keys(exported).find((key) => key.endsWith('meta.json'))!
        ],
      ),
    )
    if (!approved) {
      expect(metadata.capture.faceRecovery).toBeNull()
      expect(metadata.capture.assembledURFDLB).toBeNull()
    }
    const identities = Object.fromEntries(
      Object.entries(metadata.faces).map(([slot, face]) => [
        slot,
        (face as { photoIdentity: unknown }).photoIdentity,
      ]),
    )
    for (const [slot, identity] of Object.entries(identities)) {
      expect(identity).toMatchObject({
        sourceHash: sha(files[`face-${slot}.jpg`]),
      })
    }
    await page.goto('/')
    await page.locator('.capture-alternatives input[type=file]').setInputFiles({
      name: 'roundtrip.zip',
      mimeType: 'application/zip',
      buffer: saved,
    })
    await expect(dialog).toBeVisible()
    for (const [target, slot] of Object.entries(sources)) {
      const source = await dialog
        .getByRole('button', {
          name: `Check colors for ${target} face`,
          exact: true,
        })
        .locator('img.orientation-net-photo')
        .getAttribute('src')
      expect(sha(Buffer.from(source!.split(',')[1], 'base64'))).toBe(
        sha(files[`face-${slot.toLowerCase()}.jpg`]),
      )
    }
    await dialog.getByRole('button', { name: 'Close', exact: true }).click()
    await page
      .getByRole('button', { name: 'Save capture', exact: true })
      .click()
    const second = page.waitForEvent('download')
    await page
      .getByRole('button', { name: 'Download zip', exact: true })
      .click()
    const secondPath = await (await second).path()
    if (!secondPath) throw new Error('Missing roundtrip download')
    const secondFiles = unzipSync(readFileSync(secondPath))
    const secondMeta = JSON.parse(
      strFromU8(
        secondFiles[
          Object.keys(secondFiles).find((key) => key.endsWith('meta.json'))!
        ],
      ),
    )
    expect(
      Object.fromEntries(
        Object.entries(secondMeta.faces).map(([slot, face]) => [
          slot,
          (face as { photoIdentity: unknown }).photoIdentity,
        ]),
      ),
    ).toEqual(identities)
  })

test('explicit legacy Yes accepts the displayed logical cube without inventing a photo mapping', async ({
  page,
}) => {
  await page.goto('/')
  await page
    .locator('.capture-alternatives input[type=file]')
    .setInputFiles('test/fixtures/orientation-recovery-7x7.zip')
  const approval = page.getByRole('dialog', {
    name: 'Does this match your cube?',
  })
  await expect(approval).toBeVisible()
  await expect(approval.locator('.orientation-net-photo')).toHaveCount(0)
  await expect(approval).toContainText('Source photos are not established')
  const colors = await approval
    .locator('.orientation-net-sticker')
    .evaluateAll((cells) =>
      cells.map((cell) => (cell as HTMLElement).style.background),
    )
  await approval
    .getByRole('button', { name: 'Yes, this is my cube', exact: true })
    .click()
  await expect(
    page.getByRole('dialog', { name: 'Match your cube' }),
  ).toHaveCount(0)
  await expect(page.locator('.cube-card .verdict.is-valid')).toBeVisible()
  expect(
    await page
      .locator('.cube-card .net-cell')
      .evaluateAll((cells) =>
        cells.map((cell) => (cell as HTMLElement).style.backgroundColor),
      ),
  ).toEqual(colors)
  await expect(page.locator('.cube-card .net-info-photo')).toHaveCount(0)
  await page
    .getByRole('button', { name: 'Save as test fixture', exact: true })
    .click()
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download zip', exact: true }).click()
  const path = await (await pending).path()
  if (!path) throw new Error('Missing legacy fixture')
  const zip = unzipSync(readFileSync(path))
  const meta = JSON.parse(
    strFromU8(zip[Object.keys(zip).find((key) => key.endsWith('meta.json'))!]),
  )
  expect(meta.capture.faceRecovery).toBeNull()
})

test('a retaken source is not silently rebound into the approved main net or fixture', async ({
  page,
}) => {
  await page.goto('/')
  await page
    .locator('.capture-alternatives input[type=file]')
    .setInputFiles('test/fixtures/photo-identity-4x4-2026-11-16T21-28-43.zip')
  await page
    .getByRole('button', { name: 'Yes, this is my cube', exact: true })
    .click()
  await page.locator('.cube-card .net-u .net-face-grid').focus()
  await expect(page.locator('.cube-card .net-info-photo')).toBeVisible()
  await page.locator('.cube-card .net-u .net-cell-edit').first().click()
  const direct = page.locator('.review-modal-content')
  const knownSource = await direct
    .locator('.review-face-image')
    .getAttribute('src')
  expect(sha(Buffer.from(knownSource!.split(',')[1], 'base64'))).toBe(
    sha(files['face-l.jpg']),
  )
  await direct.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.getByRole('button', { name: 'Edit colors', exact: true }).click()
  await page
    .getByRole('button', { name: 'No, check the colors', exact: true })
    .click()
  const review = page.locator('.review-modal-content')
  await expect(review).toBeVisible()
  const image = await review.locator('.review-face-image').getAttribute('src')
  const sourceHash = sha(Buffer.from(image!.split(',')[1], 'base64'))
  const original = Object.entries(files).find(
    ([name, bytes]) => name.endsWith('.jpg') && sha(bytes) === sourceHash,
  )
  if (!original)
    throw new Error('Review did not show an original fixture photo')
  await review.getByRole('button', { name: /^Retake / }).click()
  const capture = page.locator('.capture-modal-content')
  await expect(capture).toBeVisible()
  await capture.getByRole('button', { name: 'Guide grid', exact: true }).click()
  await capture.locator('.capture-import input[type=file]').setInputFiles({
    name: original[0],
    mimeType: 'image/jpeg',
    buffer: Buffer.from(original[1]),
  })
  await expect(capture).toHaveCount(0)
  const next = page.getByRole('dialog')
  await expect(next).toHaveCount(1)
  await next.getByRole('button', { name: 'Close', exact: true }).click()
  await page.locator('.cube-card .net-u .net-face-grid').focus()
  await expect(page.locator('.cube-card .net-info-photo')).toHaveCount(0)
  await page
    .getByRole('button', { name: 'Save as test fixture', exact: true })
    .click()
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download zip', exact: true }).click()
  const path = await (await pending).path()
  if (!path) throw new Error('Missing retake fixture')
  const exported = unzipSync(readFileSync(path))
  const metadata = JSON.parse(
    strFromU8(
      exported[Object.keys(exported).find((key) => key.endsWith('meta.json'))!],
    ),
  )
  expect(metadata.capture.faceRecovery).toBeNull()
  expect(
    Object.values(metadata.faces).every(
      (face) => (face as { photoIdentity?: unknown }).photoIdentity,
    ),
  ).toBe(true)
})

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { recordGuide } from '../src/client/capture/captureRecovery'
import { readFixtureColors } from '../src/client/fixtures/fixtureFormat'
import { physicalSeed } from '../src/client/capture/guidedCaptureProtocol'

// Deliberately incompatible guide metadata exercises a failed assembly.
// These original legacy photos are not claimed to be a physical-v2 scan.
function conflictedCapture() {
  const files = unzipSync(
    readFileSync(resolve('test/fixtures/orientation-recovery-7x7.zip')),
  )
  const key = Object.keys(files).find((key) => key.endsWith('meta.json'))!
  const meta = JSON.parse(strFromU8(files[key]))
  meta.capture.protocol = 'sides-then-top-bottom/v2'
  delete meta.capture.assembledURFDLB
  delete meta.capture.faceRecovery
  for (const slot of ['U', 'R', 'F', 'D', 'L', 'B'])
    meta.faces[slot.toLowerCase()].captureGuide = recordGuide(slot, true, false)
  expect(
    physicalSeed(readFixtureColors(meta)!.colors, 7).validation.valid,
  ).toBe(false)
  files[key] = strToU8(JSON.stringify(meta))
  return { files, meta, bytes: Buffer.from(zipSync(files)) }
}

test('six-photo capture saves before assembly and reimports the same physical-guide conflict', async ({
  page,
}) => {
  const original = conflictedCapture()
  await page.goto('/')
  await page
    .locator('.capture-alternatives input[type="file"]')
    .setInputFiles({
      name: 'conflicting-guide.zip',
      mimeType: 'application/zip',
      buffer: original.bytes,
    })
  await expect(
    page.getByRole('heading', { name: 'Match your cube', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText(
      'Capture conflicts with the physical guide. Check the photos and recorded steps.',
      { exact: true },
    ),
  ).toBeVisible()
  const failure = await page
    .locator('.face-recovery [role="alert"]')
    .first()
    .textContent()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.getByText('All 6 captured', { exact: true })).toBeVisible()
  await page
    .locator('.capture-card')
    .getByRole('button', { name: 'Save capture', exact: true })
    .click()
  const dialog = page.getByRole('dialog', {
    name: 'Save as test fixture',
    exact: true,
  })
  await expect(
    dialog.getByRole('list', { name: 'Photos in the zip' }).locator('li'),
  ).toHaveCount(6)
  const pending = page.waitForEvent('download')
  await dialog
    .getByRole('button', { name: 'Download zip', exact: true })
    .click()
  const path = await (await pending).path()
  if (!path) throw new Error('Missing capture download')
  const bytes = readFileSync(path),
    files = unzipSync(bytes)
  const key = Object.keys(files).find((key) => key.endsWith('meta.json'))!
  const saved = JSON.parse(strFromU8(files[key]))
  expect(saved.colorsURFDLB).toBe(original.meta.colorsURFDLB)
  expect(saved.detectedURFDLB).toBe(original.meta.detectedURFDLB)
  expect(saved.capture.protocol).toBe('sides-then-top-bottom/v2')
  expect(saved.capture.assembledURFDLB).toBeNull()
  expect(saved.capture.faceRecovery).toBeNull()
  expect(saved.capture.assemblyValidation).toEqual({ status: 'not-checked' })
  for (const face of ['u', 'r', 'f', 'd', 'l', 'b']) {
    expect(saved.faces[face].captureGuide).toEqual(
      original.meta.faces[face].captureGuide,
    )
    const filename = `face-${face}.jpg`
    const prior = Object.keys(original.files).find((key) =>
      key.endsWith(filename),
    )!
    const next = Object.keys(files).find((key) => key.endsWith(filename))!
    expect(
      Buffer.from(files[next]).equals(Buffer.from(original.files[prior])),
    ).toBe(true)
  }
  await page.goto('/')
  await page
    .locator('.capture-alternatives input[type="file"]')
    .setInputFiles({
      name: 'capture-only.zip',
      mimeType: 'application/zip',
      buffer: bytes,
    })
  await expect(
    page.getByRole('heading', { name: 'Match your cube', exact: true }),
  ).toBeVisible()
  await expect(
    page.locator('.face-recovery [role="alert"]').first(),
  ).toHaveText(failure!)
  await expect(page.locator('.spatial-candidate')).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Use this cube', exact: true }),
  ).toHaveCount(0)
})

test('new camera introduction uses the same bottom-before-top order as the physical guide', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.locator('.capture-card .card-hint').first()).toContainText(
    'bottom and top',
  )
  await expect(
    page
      .locator('.capture-card')
      .getByRole('button', { name: 'Save capture', exact: true }),
  ).toHaveCount(0)
})

test('Save capture omits an existing approved assembly rather than reusing it', async ({
  page,
}) => {
  await page.goto('/')
  await page
    .locator('.capture-alternatives input[type="file"]')
    .setInputFiles(resolve('test/fixtures/orientation-recovery-7x7.zip'))
  await page
    .getByRole('button', { name: 'Yes, this is my cube', exact: true })
    .click()
  await page
    .locator('.capture-card')
    .getByRole('button', { name: 'Save capture', exact: true })
    .click()
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download zip', exact: true }).click()
  const path = await (await pending).path()
  if (!path) throw new Error('Missing capture download')
  const files = unzipSync(readFileSync(path)),
    key = Object.keys(files).find((key) => key.endsWith('meta.json'))!
  const meta = JSON.parse(strFromU8(files[key]))
  expect(meta.capture.faceRecovery).toBeNull()
  expect(meta.capture.assembledURFDLB).toBeNull()
  expect(meta.capture.assemblyValidation).toEqual({ status: 'not-checked' })
})

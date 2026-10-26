import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test, type Page } from '@playwright/test'

const fixture = resolve('test/fixtures/cube-3x3-2026-09-27T09-00-11')
const faceKeys = ['u', 'r', 'f', 'd', 'l', 'b'] as const
const faceLabels = ['Side 1', 'Side 2', 'Side 3', 'Side 4', 'Top', 'Bottom']
const photos = faceKeys.map((face) => resolve(fixture, `face-${face}.jpg`))
const metadata = JSON.parse(
  readFileSync(resolve(fixture, 'meta.json'), 'utf8'),
) as { colorsURFDLB: string }
const colorNames: Record<string, string> = {
  W: 'White',
  O: 'Orange',
  G: 'Green',
  R: 'Red',
  B: 'Blue',
  Y: 'Yellow',
}

// The sticker color review, opened from Edit colors when the capture went
// straight on to assembly.
async function openColorReview(page: Page) {
  await expect(page.getByText('All 6 captured', { exact: true })).toBeVisible()
  if (!(await page.locator('.review-modal-content').isVisible())) {
    const dialog = page.getByRole('dialog')
    if (await dialog.isVisible())
      await dialog.getByRole('button', { name: 'Close' }).click()
    await page.getByRole('button', { name: 'Edit colors' }).click()
  }
  const review = page.locator('.review-modal-content')
  await expect(review).toBeVisible()
  return review
}

async function reviewFaces(page: Page): Promise<string[]> {
  const review = await openColorReview(page)
  const grids: string[] = []
  for (const label of faceLabels) {
    await review
      .getByRole('group', { name: 'Faces' })
      .getByRole('button', {
        name: label,
        exact: true,
      })
      .click()
    await expect(review.locator('.review-face-image')).toBeVisible()
    const cells = review.locator('.review-detected-cell')
    await expect(cells).toHaveCount(9)
    const titles = await cells.evaluateAll((items) =>
      items.map((item) => item.getAttribute('title') ?? ''),
    )
    grids.push(
      titles
        .map((title) => {
          const color = Object.entries(colorNames).find(([, name]) =>
            title.includes(`: ${name}`),
          )?.[0]
          if (!color) throw new Error(`Missing color in ${title}`)
          return color
        })
        .join(''),
    )
  }
  return grids
}

test('uploads six cropped photos without metadata and shows six detected faces', async ({
  page,
}) => {
  await page.goto('/')
  await page
    .locator('.capture-alternatives input[type="file"]')
    .setInputFiles(photos)
  const preview = page.getByLabel('Photo upload order')
  await expect(preview).toBeVisible()
  await expect(preview.locator('.photo-upload-item')).toHaveCount(6)
  await preview.getByRole('button', { name: 'Read six photos' }).click()
  const grids = await reviewFaces(page)
  expect(grids).toEqual(metadata.colorsURFDLB.split(' '))
})

test('explains Auto framing with readable spacing', async ({ page }) => {
  await page.goto('/')
  await page
    .locator('.capture-alternatives input[type="file"]')
    .setInputFiles(photos)
  const hint = await page
    .getByLabel('Photo upload order')
    .locator('p')
    .first()
    .textContent()
  expect(hint).toMatch(/face crops directly and finds the face/)
})

test('uploads the same photos with meta.json and preserves all saved face colors', async ({
  page,
}) => {
  await page.goto('/')
  await page
    .locator('.capture-alternatives input[type="file"]')
    .setInputFiles([...photos, resolve(fixture, 'meta.json')])
  await expect(page.getByLabel('Photo upload order')).toHaveCount(0)
  const grids = await reviewFaces(page)
  expect(grids).toEqual(metadata.colorsURFDLB.split(' '))
})

test('goes straight to how the faces fit after uploading a fixture with meta.json', async ({
  page,
}) => {
  await page.goto('/')
  await page
    .locator('.capture-alternatives input[type="file"]')
    .setInputFiles([...photos, resolve(fixture, 'meta.json')])
  // Its colors and orientation were saved, so the only question is whether
  // the cube is the user's.
  await expect(
    page.getByRole('heading', { name: 'Does this match your cube?' }),
  ).toBeVisible()
  await expect(page.locator('.orientation-picker')).toHaveCount(0)
  await expect(page.locator('.review-modal-content')).toHaveCount(0)
})

test('edits one sticker in the review color picker', async ({ page }) => {
  await page.goto('/')
  await page
    .locator('.capture-alternatives input[type="file"]')
    .setInputFiles([...photos, resolve(fixture, 'meta.json')])
  const review = await openColorReview(page)
  const firstCell = review.locator('.review-detected-cell').first()
  await firstCell.click()
  const picker = page.locator('.color-picker-content')
  await expect(picker).toBeVisible()
  const alternative = picker.locator('.color-btn:not(.is-current)').first()
  const chosen = await alternative.locator('.color-btn-name').textContent()
  await alternative.click()
  await expect(picker).toHaveCount(0)
  await expect(firstCell).toHaveAttribute('title', new RegExp(`: ${chosen}`))
})

test('shows the fixture contents before downloading and closes with Escape', async ({
  page,
}) => {
  await page.goto('/')
  await page
    .locator('.capture-alternatives input[type="file"]')
    .setInputFiles([...photos, resolve(fixture, 'meta.json')])
  await page.getByRole('button', { name: 'Yes, this is my cube' }).click()
  await expect(
    page.getByRole('status').filter({ hasText: 'Valid cube' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Save as test fixture' }).click()
  const dialog = page.getByRole('dialog', { name: 'Save as test fixture' })
  await expect(
    dialog.getByRole('list', { name: 'Photos in the zip' }).locator('li'),
  ).toHaveCount(6)
  await expect(
    dialog.getByRole('button', { name: 'Download zip' }),
  ).toBeVisible()
  await dialog.press('Escape')
  await expect(dialog).toHaveCount(0)
})

test('opens sticker review from a face in the orientation approval', async ({
  page,
}) => {
  await page.goto('/')
  await page
    .locator('.capture-alternatives input[type="file"]')
    .setInputFiles([...photos, resolve(fixture, 'meta.json')])
  const review = await openColorReview(page)
  await review.locator('.review-detected-cell').first().click()
  await page
    .locator('.color-picker-content .color-btn:not(.is-current)')
    .first()
    .click()
  for (let side = 0; side < 5; side++)
    await review
      .getByRole('button', { name: 'Looks right — next side' })
      .click()
  await review
    .getByRole('button', { name: 'Looks right — put the cube together' })
    .click()

  const approval = page.locator('.orientation-approval')
  await expect(approval).toBeVisible()
  await approval
    .getByRole('button', { name: 'Check colors for U face' })
    .click()
  await expect(review).toBeVisible()
})

test('the cube check shows the photos and the detection side by side', async ({
  page,
}) => {
  await page.goto('/')
  await page
    .locator('.capture-alternatives input[type="file"]')
    .setInputFiles([...photos, resolve(fixture, 'meta.json')])
  const dialog = page.getByRole('dialog', {
    name: 'Does this match your cube?',
  })
  await expect(dialog).toBeVisible()
  // Upper net: the six photos; lower net: the detected colors.
  await expect(dialog.locator('.approval-photos .approval-photo')).toHaveCount(
    6,
  )
  await expect(
    dialog.locator('.approval-detected .orientation-net'),
  ).toBeVisible()
  await expect(dialog.locator('.approval-stats')).toContainText('Side 1')
})

test('a capture that cannot be put together shows an error, not silence', async ({
  page,
}) => {
  const repeated = resolve('test/fixtures/cube-5x5-2026-10-26T00-18-58')
  await page.goto('/')
  await page
    .getByRole('combobox', { name: 'Cube' })
    .selectOption('builtin-generic-5')
  await page
    .locator('.capture-alternatives input[type="file"]')
    .setInputFiles([
      ...faceKeys.map((face) => resolve(repeated, `face-${face}.jpg`)),
      resolve(repeated, 'meta.json'),
    ])
  const dialog = page.getByRole('dialog', { name: 'Error detected' })
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('.approval-photos .approval-photo')).toHaveCount(
    6,
  )
  await expect(dialog.locator('.approval-stats')).toContainText(
    'Side 4 and Top',
  )
  await expect(dialog).toContainText('shot twice')
})

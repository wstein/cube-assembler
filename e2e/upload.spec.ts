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

async function reviewFaces(page: Page): Promise<string[]> {
  await expect(page.getByText('All 6 captured', { exact: true })).toBeVisible()
  if (!(await page.locator('.review-modal-content').isVisible())) {
    const dialog = page.getByRole('dialog')
    if (await dialog.isVisible())
      await dialog.getByRole('button', { name: 'Close' }).click()
    await page.getByRole('button', { name: 'Edit colors' }).click()
  }
  const review = page.locator('.review-modal-content')
  await expect(review).toBeVisible()
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

test('edits one sticker in the review color picker', async ({ page }) => {
  await page.goto('/')
  await page
    .locator('.capture-alternatives input[type="file"]')
    .setInputFiles([...photos, resolve(fixture, 'meta.json')])
  const review = page.locator('.review-modal-content')
  await expect(review).toBeVisible()
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
  const review = page.locator('.review-modal-content')
  await expect(review).toBeVisible()
  for (let side = 0; side < 5; side++) {
    await review
      .getByRole('button', { name: 'Looks right — next side' })
      .click()
  }
  await review
    .getByRole('button', { name: 'Looks right — put the cube together' })
    .click()
  const approve = page.getByRole('button', { name: 'Yes, this is my cube' })
  if (await approve.isVisible()) await approve.click()
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

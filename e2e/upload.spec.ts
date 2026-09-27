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

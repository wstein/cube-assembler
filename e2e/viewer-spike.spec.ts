import { resolve } from 'node:path'
import { expect, test, type Page } from '@playwright/test'

// Capture-review 3D view on the PuzlWerk viewer (spike); `?viewer=puzlwerk` selects it.
const fixtures = [
  ['4x4', 'test/fixtures/synthetic-4x4-high.zip', 4],
  ['5x5', 'test/fixtures/orientation-recovery-5x5.zip', 5],
  ['7x7', 'test/fixtures/orientation-recovery-7x7.zip', 7],
] as const

async function openRecovery(page: Page, url: string, archive: string) {
  await page.goto(url)
  await page
    .locator('.capture-alternatives input[type="file"]')
    .setInputFiles(resolve(archive))
  await page
    .getByRole('heading', { name: 'Does this match your cube?' })
    .waitFor({ timeout: 30000 })
  await page.getByRole('button', { name: /^Alternatives \([1-9]/ }).click()
}

for (const [size, archive, n] of fixtures) {
  test(`recovery preview ${size} uses the PuzlWerk viewer with the flag`, async ({
    page,
  }) => {
    const problems: string[] = []
    page.on('pageerror', (error) => problems.push(String(error)))
    page.on('console', (message) => {
      if (message.type() === 'error') problems.push(message.text())
    })
    await openRecovery(page, '/?viewer=puzlwerk', archive)
    const view = page.locator('.spatial-workspace .cube-3d-puzlwerk')
    await expect(view.locator('canvas')).toBeVisible()
    await expect(
      page.locator('.spatial-workspace .cube-3d-canvas'),
    ).toHaveCount(0)
    // The viewer's own floating panel stays hidden inside the dialog.
    await expect(page.locator('.cube-appearance')).toBeHidden()
    await expect(page.getByText('3D view unavailable')).toHaveCount(0)
    // The inspected face is outlined: its n*n stickers, set after the projection loaded.
    await expect(view).toHaveAttribute(
      'data-highlight',
      new RegExp(`^[urfdlb]:${n * n}$`),
    )
    expect(problems).toEqual([])
  })
}

test('recovery preview keeps the existing view without the flag', async ({
  page,
}) => {
  await openRecovery(page, '/', fixtures[0][1])
  await expect(page.locator('.spatial-workspace .cube-3d-canvas')).toBeVisible()
  await expect(page.locator('.cube-3d-puzlwerk')).toHaveCount(0)
})

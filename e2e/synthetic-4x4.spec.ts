import { resolve } from 'node:path'
import { expect, test } from '@playwright/test'

for (const [name, alternatives] of [
  ['high', 3],
  ['medium', 1],
  ['unique', 0],
] as const) {
  test(`synthetic 4x4 ${name} uploads with ${alternatives} retained alternatives`, async ({
    page,
  }) => {
    await page.goto('/')
    await page
      .locator('.capture-alternatives input[type="file"]')
      .setInputFiles(resolve(`test/fixtures/synthetic-4x4-${name}.zip`))
    await expect(
      page.getByRole('heading', { name: 'Does this match your cube?' }),
    ).toBeVisible()
    const button = page.getByRole('button', {
      name: `Alternatives (${alternatives})`,
      exact: true,
    })
    await expect(
      page.getByRole('button', { name: 'Yes, this is my cube', exact: true }),
    ).toBeEnabled()
    if (alternatives === 0) {
      await expect(button).toBeDisabled()
    } else {
      await expect(button).toBeEnabled()
      await button.click()
      await expect(page.locator('.spatial-candidate')).not.toHaveCount(0)
      await expect(
        page
          .getByRole('group', { name: 'Recognized cube net', exact: true })
          .getByRole('button'),
      ).toHaveCount(6)
      await expect(
        page.locator('.spatial-workspace .cube-3d-canvas'),
      ).toBeVisible()
      await expect(
        page.getByText('Advanced recovery', { exact: true }),
      ).toHaveCount(0)
    }
  })
}

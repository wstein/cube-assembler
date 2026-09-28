import { expect, test } from '@playwright/test'

test('the settings page changes how long a sticker is held for a block', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'Settings' }).click()
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
  const block = page.getByRole('slider', { name: 'Hold for a block of layers' })
  const cube = page.getByRole('slider', { name: 'Hold for the whole cube' })
  await expect(block).toHaveValue('500')
  await expect(cube).toHaveValue('1200')
  const reset = page.getByRole('button', { name: /Reset to 500 and 1200 ms/ })
  await expect(reset).toBeDisabled()

  // A block time past the whole cube's pushes the whole cube later.
  await block.fill('1500')
  await expect(page.getByText('1500 ms')).toBeVisible()
  await expect(cube).toHaveValue('1700')
  await reset.click()
  await expect(block).toHaveValue('500')

  await block.fill('200')
  await expect
    .poll(() => page.evaluate(() => document.cookie))
    .toContain('cube-assembler-wide-press-ms=200')
  await page.getByRole('button', { name: '← Back to the scanner' }).click()

  // A 300 ms hold now turns a block.
  await page.getByRole('button', { name: 'Solved cube' }).click()
  await page.getByRole('button', { name: '3D View' }).click()
  const bounds = await page.locator('.cube-3d-canvas').boundingBox()
  if (!bounds) throw new Error('No canvas')
  await page.mouse.move(
    bounds.x + bounds.width / 2 - 38,
    bounds.y + bounds.height / 2,
  )
  await page.mouse.down()
  await page.waitForTimeout(300)
  await expect(page.locator('.cube-3d-press-mode')).toHaveText(/Wide turn/)
  await page.mouse.up()
})

test('Reset all settings restores the defaults', async ({ page }) => {
  await page.goto('/#settings')
  const block = page.getByRole('slider', { name: 'Hold for a block of layers' })
  await block.fill('900')
  await expect(block).toHaveValue('900')
  await page.getByRole('button', { name: 'Reset all settings' }).click()
  await expect(block).toHaveValue('500')
  expect(await page.evaluate(() => document.cookie)).not.toContain(
    'cube-assembler-wide-press-ms',
  )
})

test('capture switches on the settings page reach the scanner', async ({
  page,
}) => {
  await page.goto('/#settings')
  const auto = page.getByRole('switch', { name: /Auto capture/ })
  await expect(auto).not.toBeChecked()
  await auto.check()
  await page.getByRole('switch', { name: /Mirror the camera preview/ }).check()
  await expect
    .poll(() => page.evaluate(() => document.cookie))
    .toContain('cube-assembler-auto-capture=1')
  await page.getByRole('button', { name: '← Back to the scanner' }).click()
  await page.getByRole('button', { name: 'Capture faces' }).click()
  await expect(
    page.getByRole('checkbox', { name: /Auto capture/ }),
  ).toBeChecked()
})

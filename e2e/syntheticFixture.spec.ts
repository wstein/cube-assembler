import { expect, test } from '@playwright/test'

// A cube state with no photos saves as a fixture of rendered ones.

test('saves a solved cube as a synthetic fixture and switches the lighting', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Solved cube' }).click()
  await page.getByRole('button', { name: 'Save as test fixture' }).click()
  const dialog = page.getByRole('dialog', { name: 'Save as test fixture' })
  const photos = dialog.getByRole('list', { name: 'Photos in the zip' })
  await expect(photos.locator('li')).toHaveCount(6)
  await expect(dialog).toContainText(/synthetic/i)
  await expect(dialog.locator('code').first()).toContainText(/^synt-3x3-/)
  const lighting = dialog.getByRole('combobox', { name: 'Lighting' })
  await expect(lighting).toHaveValue('clean')
  await lighting.selectOption('shadow')
  await expect(dialog.getByText('Lighting', { exact: true })).toBeVisible()
  await expect(dialog.locator('dd', { hasText: /^shadow$/ })).toBeVisible()
  await expect(photos.locator('li')).toHaveCount(6)
  await expect(
    dialog.getByRole('button', { name: 'Download zip' }),
  ).toBeVisible()
  await dialog.press('Escape')
  await expect(dialog).toHaveCount(0)
})

test('saves a state that is no cube, marked invalid', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Type colors' }).click()
  // Two stickers swapped between the top and the right face.
  const facelets = [
    'RUUUUUUUU',
    'URRRRRRRR',
    'FFFFFFFFF',
    'DDDDDDDDD',
    'LLLLLLLLL',
    'BBBBBBBBB',
  ].join(' ')
  await page.getByRole('textbox', { name: /facelets/i }).fill(facelets)
  await page.getByRole('button', { name: 'Apply Facelets' }).click()
  await page.getByRole('button', { name: 'Save as test fixture' }).click()
  const dialog = page.getByRole('dialog', { name: 'Save as test fixture' })
  await expect(
    dialog.getByRole('list', { name: 'Photos in the zip' }).locator('li'),
  ).toHaveCount(6)
  await expect(dialog.locator('dd', { hasText: /^invalid:/ })).toBeVisible()
})

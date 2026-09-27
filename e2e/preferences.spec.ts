import { expect, test } from '@playwright/test'

test('restores cube size and chosen colors from cookies after local storage is cleared', async ({
  page,
}) => {
  await page.goto('/')
  const cube = page.getByRole('combobox', { name: 'Cube' })
  const colors = page.getByRole('combobox', { name: 'Colors' })
  await cube.selectOption({ label: '5×5' })
  await colors.selectOption({ label: 'Classic' })
  const selectedColorId = await colors.inputValue()

  await expect
    .poll(async () => page.evaluate(() => document.cookie))
    .toContain('cube-assembler-cube-size=5')
  await expect
    .poll(async () => page.evaluate(() => document.cookie))
    .toContain('cube-assembler-color-profile=')

  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await expect(cube).toHaveValue('builtin-generic-5')
  await expect(colors).toHaveValue(selectedColorId)
})

test('ignores invalid size and missing color profile cookies', async ({
  page,
}) => {
  await page.context().addCookies([
    {
      name: 'cube-assembler-cube-size',
      value: '8',
      url: 'http://127.0.0.1:4174/',
    },
    {
      name: 'cube-assembler-color-profile',
      value: 'missing-profile',
      url: 'http://127.0.0.1:4174/',
    },
  ])
  await page.goto('/')
  await expect(page.getByRole('combobox', { name: 'Cube' })).toHaveValue(
    'builtin-generic-3',
  )
  await expect(page.getByRole('combobox', { name: 'Colors' })).toHaveValue(
    'auto-colors',
  )
})

test('restores the 3D view, sticker style, and auto-rotation after reload', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Solved cube' }).click()
  const views = page.getByRole('group', { name: 'Cube view mode' })
  await views.getByRole('button', { name: '3D View' }).click()
  await page.getByRole('button', { name: 'Stickerless' }).click()
  await page.getByRole('button', { name: 'Auto-rotate' }).click()
  await expect
    .poll(async () => page.evaluate(() => document.cookie))
    .toContain('cube-assembler-cube-view=3d')
  await expect
    .poll(async () => page.evaluate(() => document.cookie))
    .toContain('cube-assembler-stickerless=0')
  await expect
    .poll(async () => page.evaluate(() => document.cookie))
    .toContain('cube-assembler-auto-rotate=1')

  await page.reload()
  await page.getByRole('button', { name: 'Solved cube' }).click()
  await expect(views.getByRole('button', { name: '3D View' })).toHaveClass(
    /is-active/,
  )
  await expect(page.getByRole('button', { name: 'Stickered' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible()

  await views.getByRole('button', { name: '2D Net' }).click()
  await expect
    .poll(async () => page.evaluate(() => document.cookie))
    .toContain('cube-assembler-cube-view=net')
  await page.reload()
  await page.getByRole('button', { name: 'Solved cube' }).click()
  await expect(views.getByRole('button', { name: '2D Net' })).toHaveClass(
    /is-active/,
  )
})

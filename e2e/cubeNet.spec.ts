import { expect, test } from '@playwright/test'

test('shows a solved cube on first load without marking faces as captured', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.locator('.cube-net')).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Notation' })).toHaveValue(
    /^W{9} R{9} G{9} Y{9} O{9} B{9}$/,
  )
  await expect(
    page.getByRole('button', { name: 'Save as test fixture' }),
  ).toHaveCount(0)
  await page.getByRole('button', { name: '3D View' }).click()
  await expect(page.locator('.cube-3d-canvas')).toBeVisible()
  await page.getByRole('button', { name: '2D Net' }).click()
  await page
    .getByRole('combobox', { name: 'Cube' })
    .selectOption({ label: '5×5' })
  await expect(page.locator('.cube-net .net-u .net-cell')).toHaveCount(25)
})

test('shows sticker details on hover and clears them on leaving the net', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Solved cube' }).click()

  const net = page.locator('.cube-net')
  await expect(net).toBeVisible()
  await net.locator('.net-u .net-cell').first().hover()
  await expect(net.locator('.net-info')).toContainText('Top')

  await page.locator('.notation-card').hover()
  await expect(net.locator('.net-info')).toContainText('Point at a sticker')
})

test('turns the solved preview and keeps its notation across view switches', async ({
  page,
}) => {
  await page.goto('/')
  await page
    .getByRole('combobox', { name: 'Cube' })
    .selectOption({ label: '5×5' })
  const notation = page.getByRole('textbox', { name: 'Notation' })
  const solved = await notation.inputValue()
  await page.getByRole('button', { name: '3D View' }).click()
  await page.getByRole('button', { name: 'Front (F)' }).click()
  const bounds = await page.locator('.cube-3d-canvas').boundingBox()
  if (!bounds) throw new Error('No canvas')
  const x = bounds.x + bounds.width / 2 - 38
  const y = bounds.y + bounds.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x, y - 70, { steps: 5 })
  await page.mouse.up()
  await expect(page.getByRole('status', { name: 'Move history' })).toHaveText(
    "Moves: 2L'",
  )
  await expect(notation).not.toHaveValue(solved)
  const turned = await notation.inputValue()
  await page.getByRole('button', { name: '2D Net' }).click()
  await expect(notation).toHaveValue(turned)
  await page.getByRole('button', { name: '3D View' }).click()
  await expect(page.getByRole('status', { name: 'Move history' })).toHaveText(
    "Moves: 2L'",
  )
})

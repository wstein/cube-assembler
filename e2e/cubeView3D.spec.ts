import { expect, test } from '@playwright/test'

test('a dragged cube keeps turning briefly after release', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Solved cube' }).click()
  await page.getByRole('button', { name: '3D View' }).click()
  const canvas = page.locator('.cube-3d-canvas')
  await expect(canvas).toBeVisible()
  const bounds = await canvas.boundingBox()
  expect(bounds).not.toBeNull()
  if (!bounds) return

  const x = bounds.x + bounds.width / 2
  const y = bounds.y + bounds.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + 100, y + 35, { steps: 5 })
  await page.mouse.up()
  const released = await canvas.screenshot()
  await page.waitForTimeout(150)
  const coasting = await canvas.screenshot()
  expect(coasting.equals(released)).toBe(false)
})

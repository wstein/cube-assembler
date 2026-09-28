import { expect, test } from '@playwright/test'

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

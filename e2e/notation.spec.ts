import { expect, test } from '@playwright/test'

test('switches notation and copies the displayed facelets', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/')
  await page.getByRole('button', { name: 'Solved cube' }).click()

  const notation = page.getByRole('textbox', { name: 'Notation' })
  await expect(notation).toHaveValue(/^W/)
  await page.getByRole('button', { name: 'Faces (URF)' }).click()
  await expect(notation).toHaveValue(/^U/)
  await expect(page.getByText('Orbit64 state token:')).toBeVisible()

  await page.getByRole('button', { name: 'Copy', exact: true }).click()
  await expect(page.getByRole('button', { name: '✓ Copied' })).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    await notation.inputValue(),
  )
})

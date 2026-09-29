import { expect, test } from '@playwright/test'

const settings = {
  version: 3,
  cubes: [
    { id: 'cube-a', name: 'Cube A', size: 3, sampling: { stickerCore: 0.7 } },
    { id: 'cube-b', name: 'Cube B', size: 3, sampling: { stickerCore: 0.71 } },
  ],
  colors: [],
  activeCubeBySize: { 3: 'cube-a' },
  activeColorsId: 'automatic',
}

test('merges duplicate cubes and restores them with undo', async ({ page }) => {
  await page.addInitScript((text) => {
    localStorage.setItem('cube-assembler-profiles-v1', text)
  }, JSON.stringify(settings))
  await page.goto('/#profiles/cubes')

  const group = page.locator('.color-review-group')
  await expect(group).toHaveCount(1)
  await expect(group).toContainText('Cube A')
  await expect(group).toContainText('Cube B')
  await group.getByLabel('New cube name').fill('Merged cube')
  await group.getByRole('button', { name: 'Merge 2 into one' }).click()

  await expect(page.locator('.color-review-message').first()).toHaveText(
    'Merged 2 cubes into “Merged cube”.',
  )
  const cubeList = page.locator('section[aria-labelledby="cubes-list"]')
  await expect(cubeList).toContainText('Merged cube')
  await expect(cubeList).not.toContainText('Cube A')
  await expect(cubeList).not.toContainText('Cube B')

  await page.getByRole('button', { name: 'Undo last change' }).first().click()
  await expect(cubeList).toContainText('Cube A')
  await expect(cubeList).toContainText('Cube B')
})

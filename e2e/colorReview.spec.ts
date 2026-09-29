import { resolve } from 'node:path'
import { expect, test, type Page } from '@playwright/test'

// Three saved color profiles: two that differ only a little and one that is
// clearly different.
const colors = (shift: number) => ({
  W: { r: 235, g: 235, b: 235 },
  Y: { r: 240, g: 220, b: 40 },
  O: { r: 250, g: 120 + shift, b: 20 },
  R: { r: 200, g: 20, b: 30 + shift },
  G: { r: 20, g: 160, b: 60 },
  B: { r: 20, g: 60 + shift, b: 190 },
})
const settings = {
  version: 3,
  cubes: [],
  colors: [
    { id: 'kitchen', name: 'Kitchen', colors: colors(0), captures: 2 },
    { id: 'desk', name: 'Desk', colors: colors(2), captures: 1 },
    { id: 'odd', name: 'Odd', colors: colors(60), captures: 1 },
  ],
  activeCubeBySize: {},
  activeColorsId: 'kitchen',
}

const openColors = async (page: Page) => {
  await page.addInitScript((text) => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('cube-assembler-profiles-v1', text)
      sessionStorage.setItem('seeded', '1')
    }
  }, JSON.stringify(settings))
  await page.goto('/#profiles')
  await page.getByRole('link', { name: 'Colors' }).click()
}
const table = (page: Page) =>
  page.locator('section[aria-labelledby="review-all"] table')
const status = (page: Page) => page.locator('.color-review-message').first()

test('merges two similar profiles into a new one and undoes it', async ({
  page,
}) => {
  await openColors(page)
  const group = page.locator('.color-review-group')
  await expect(group).toHaveCount(1)
  await expect(group).toContainText('Group 1 · 2 profiles')
  await expect(page.locator('.color-review-note').last()).toContainText(
    'Distinct (no partner within the limit): Odd',
  )
  await group.getByLabel('New profile name').fill('Room light')
  await group.getByRole('button', { name: /Merge 2 into new profile/ }).click()
  await expect(status(page)).toHaveText(
    'Merged 2 profiles into “Room light” and deleted them.',
  )
  await expect(table(page)).toContainText('Room light')
  await expect(table(page)).not.toContainText('Kitchen')
  await expect(table(page)).not.toContainText('Desk')
  // The merged profile replaces A, which was Kitchen.
  await expect(page.locator('#review-a option:checked')).toHaveText(
    'Room light',
  )
  await page.getByRole('button', { name: 'Undo last change' }).first().click()
  await expect(status(page)).toHaveText('Undone.')
  await expect(table(page)).toContainText('Kitchen')
  await expect(table(page)).toContainText('Desk')
})

test('a merge needs two ticked profiles', async ({ page }) => {
  await openColors(page)
  const group = page.locator('.color-review-group')
  await group.getByRole('checkbox').first().uncheck()
  await expect(
    group.getByRole('button', { name: /Merge 1 into new profile/ }),
  ).toBeDisabled()
  await expect(group).toContainText('Tick at least two profiles')
})

test('shows what the merge limit allows', async ({ page }) => {
  await openColors(page)
  const limit = page.locator('.color-review-limit')
  await expect(limit).toContainText('worst color ≤ 3.0 · average ≤ 2.0')
  await expect(limit).toContainText('3 profiles → 2 if every group is merged')
  await page.locator('#review-limit').fill('6')
  await expect(limit).toContainText('worst color ≤ 6.0 · average ≤ 4.0')
})

test('deletes a profile after confirming, and renames one', async ({
  page,
}) => {
  await openColors(page)
  await page.getByRole('button', { name: 'Delete Odd' }).click()
  await page
    .getByRole('group', { name: 'Delete Odd?' })
    .getByRole('button', { name: 'Yes' })
    .click()
  await expect(status(page)).toHaveText('Deleted “Odd”.')
  await expect(table(page)).not.toContainText('Odd')
  await page.getByRole('button', { name: 'Rename Desk' }).click()
  await page.getByLabel('New name').fill('Office')
  await page.getByLabel('New name').press('Enter')
  await expect(status(page)).toHaveText('Renamed “Desk” to “Office”.')
  await expect(table(page)).toContainText('Office')
})

test('deletes ticked profiles together', async ({ page }) => {
  await openColors(page)
  await page.getByLabel('Select Desk').check()
  await page.getByLabel('Select Odd').check()
  await expect(table(page).locator('tr.is-selected')).toHaveCount(2)
  await page.getByRole('button', { name: 'Delete selected (2)' }).click()
  await page
    .getByRole('group', { name: 'Delete 2 color profiles?' })
    .getByRole('button', { name: 'Yes, delete' })
    .click()
  await expect(status(page)).toHaveText('Deleted 2 color profiles.')
  await expect(table(page)).not.toContainText('Desk')
  await expect(table(page)).not.toContainText('Odd')
  await expect(table(page).locator('tr.is-selected')).toHaveCount(0)
})

test('compares A and B, swaps them and compares a group', async ({ page }) => {
  await openColors(page)
  await page.locator('#review-b').selectOption({ label: 'Odd' })
  const splits = page.locator('.color-review-split')
  await expect(splits).toHaveCount(6)
  // White is the same in both; Blue differs a lot.
  await expect(splits.nth(0)).toContainText('White')
  await expect(splits.nth(0)).toContainText('ΔE 0.0')
  await expect(splits.nth(5)).toContainText('Blue')
  await expect(splits.nth(5).locator('.color-review-pill')).not.toHaveText(
    'same',
  )
  await expect(page.locator('.color-review-pair-col')).toHaveCount(2)
  await expect(page.locator('.color-review-pair-col').nth(1)).toContainText(
    'Odd',
  )
  await page.getByRole('button', { name: 'Swap A and B' }).click()
  await expect(page.locator('#review-a option:checked')).toHaveText('Odd')
  await expect(page.locator('#review-b option:checked')).toHaveText('Kitchen')
  await page.getByRole('button', { name: 'Compare first two' }).click()
  await expect(page.locator('#review-a option:checked')).toHaveText('Kitchen')
  await expect(page.locator('#review-b option:checked')).toHaveText('Desk')
})

test('shows the hue wheel, the raw numbers and the empty try-on', async ({
  page,
}) => {
  await openColors(page)
  await expect(
    page.getByText('Capture a cube with the camera first'),
  ).toBeVisible()
  await page.getByText('Hue wheel').click()
  await expect(
    page.getByRole('img', { name: 'Hue wheel of profiles A and B' }),
  ).toBeVisible()
  await expect(
    page
      .getByRole('img', { name: 'Hue wheel of profiles A and B' })
      .locator('circle[stroke-width="2"]'),
  ).toHaveCount(12)
  await page.getByText('Numbers (as saved, before balancing)').click()
  const rows = page.locator('.color-review-numbers tbody tr')
  const profiles = await page.locator('#review-a option').count()
  await expect(rows).toHaveCount(profiles * 6)
})

test('tries A and B on the last capture', async ({ page }) => {
  const fixture = resolve('test/fixtures/cube-3x3-2026-09-27T09-00-11')
  await page.goto('/')
  await page
    .locator('.capture-alternatives input[type="file"]')
    .setInputFiles(
      ['u', 'r', 'f', 'd', 'l', 'b'].map((face) =>
        resolve(fixture, `face-${face}.jpg`),
      ),
    )
  await page
    .getByLabel('Photo upload order')
    .getByRole('button', { name: 'Read six photos' })
    .click()
  await expect(page.getByText('All 6 captured', { exact: true })).toBeVisible()
  await page.evaluate(() => {
    location.hash = '#profiles'
  })
  await page.getByRole('link', { name: 'Colors' }).click()
  const faces = page.getByRole('tablist', { name: 'Face' }).getByRole('tab')
  await expect(faces).toHaveCount(6)
  await expect(page.locator('.color-review-sticker')).toHaveCount(9)
  const scores = page.locator('.color-review-score')
  await expect(scores).toHaveCount(2)
  await expect(scores.first()).toContainText(/\d+\/54/)
  await faces.nth(2).click()
  await expect(faces.nth(2)).toHaveAttribute('aria-selected', 'true')
  await expect(faces.nth(0)).toHaveAttribute('aria-selected', 'false')
})

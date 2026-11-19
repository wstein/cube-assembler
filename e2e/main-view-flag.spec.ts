import { expect, test, type Page } from '@playwright/test'

// The main 3D view of the app (view mode): `?viewer=puzlwerk` selects the PuzlWerk viewer.
function watchProblems(page: Page) {
  const problems: string[] = []
  page.on('pageerror', (error) => problems.push(String(error)))
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(message.text())
  })
  return problems
}

async function openMainView(page: Page, url: string, size: number) {
  await page.goto(url)
  await page
    .getByRole('combobox', { name: 'Cube' })
    .selectOption({ label: `${size}×${size}` })
  await page.getByRole('button', { name: 'Solved cube' }).click()
  await page.getByRole('button', { name: '3D View' }).click()
}

for (const size of [2, 3, 7, 15]) {
  test(`main view ${size}x${size} uses the PuzlWerk viewer with the flag`, async ({
    page,
  }) => {
    const problems = watchProblems(page)
    await openMainView(page, '/?viewer=puzlwerk', size)
    const view = page.locator('.cube-card .cube-3d-puzlwerk')
    await expect(view.locator('canvas')).toBeVisible()
    await expect(page.locator('.cube-card .cube-3d-canvas')).toHaveCount(0)
    await expect(page.getByText('3D view unavailable')).toHaveCount(0)
    const gizmo = view.locator(
      'svg[aria-label="Cube orientation axes X, Y and Z"]',
    )
    await expect(gizmo.locator('[data-axis]')).toHaveCount(3)
    // The gizmo shows the colors of the solved cube's R, U and F faces (X, Y, Z) in the app's palette.
    await expect(view).toHaveAttribute(
      'data-indicator',
      '#cf2a3a,#f7f6f1,#1e9e57',
    )
    expect(problems).toEqual([])
  })
}

test('a state with other centers recolors the gizmo without rebuilding the stage', async ({
  page,
}) => {
  await page.goto('/?viewer=puzlwerk')
  await page
    .getByRole('combobox', { name: 'Cube' })
    .selectOption({ label: '3×3' })
  await page.getByRole('button', { name: 'Type colors' }).click()
  await page.getByRole('button', { name: 'Solved cube' }).click()
  await page.getByRole('button', { name: '3D View' }).click()
  const view = page.locator('.cube-card .cube-3d-puzlwerk')
  await expect(view).toHaveAttribute(
    'data-indicator',
    '#cf2a3a,#f7f6f1,#1e9e57',
  )
  await view
    .locator('canvas')
    .evaluate((canvas) => canvas.setAttribute('data-same-stage', '1'))
  // Solid faces whose colors sit on other faces: the centers, and so the frame, change.
  const moved = ['R', 'F', 'U', 'L', 'B', 'D']
    .map((face) => face.repeat(9))
    .join(' ')
  await page.getByRole('textbox', { name: /facelets/i }).fill(moved)
  await page.getByRole('button', { name: 'Apply Facelets' }).click()
  await expect(view).toHaveAttribute(
    'data-indicator',
    '#1e9e57,#cf2a3a,#f7f6f1',
  )
  await expect(view.locator('canvas[data-same-stage="1"]')).toHaveCount(1)
})

test('main view keeps the existing view without the flag and does not load the viewer', async ({
  page,
}) => {
  const requested: string[] = []
  page.on('request', (request) => requested.push(request.url()))
  await openMainView(page, '/', 3)
  await expect(page.locator('.cube-card .cube-3d-canvas')).toBeVisible()
  await expect(page.locator('.cube-3d-puzlwerk')).toHaveCount(0)
  expect(
    requested.filter((url) => /puzlwerkCubeView|@puzlwerk_viewer/.test(url)),
  ).toEqual([])
})

import { expect, test } from '@playwright/test'

test('move history and Undo survive a view switch, then Reset clears them', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Solved cube' }).click()
  const notation = page.getByRole('textbox', { name: 'Notation' })
  const solved = await notation.inputValue()
  await page.getByRole('button', { name: '3D View' }).click()
  const undo = page.getByRole('button', { name: 'Undo', exact: true })
  const history = page.getByRole('status', { name: 'Move history' })
  await expect(undo).toBeDisabled()

  await page.getByTitle('Turn R clockwise').click()
  await expect(history).toHaveText('Moves: R')
  const afterR = await notation.inputValue()
  expect(afterR).not.toBe(solved)
  await page.getByTitle('Turn U counter-clockwise').click()
  await expect(history).toHaveText("Moves: R U'")
  await expect(notation).not.toHaveValue(afterR)

  await page.getByRole('button', { name: '2D Net' }).click()
  await page.getByRole('button', { name: '3D View' }).click()
  await expect(history).toHaveText("Moves: R U'")
  await undo.click()
  await expect(notation).toHaveValue(afterR)
  await expect(history).toHaveText('Moves: R')
  await page.getByRole('button', { name: 'Reset', exact: true }).click()
  await expect(notation).toHaveValue(solved)
  await expect(history).toHaveText('Moves: None')
  await expect(undo).toBeDisabled()
})

test('scramble records completed turns that can be undone', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Solved cube' }).click()
  await page.getByRole('button', { name: '3D View' }).click()
  const history = page.getByRole('status', { name: 'Move history' })
  await page.getByRole('button', { name: 'Scramble', exact: true }).click()
  await expect
    .poll(async () => (await history.textContent())?.trim().split(/\s+/).length)
    .toBe(19)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect
    .poll(async () => (await history.textContent())?.trim().split(/\s+/).length)
    .toBe(18)
})

test('layer turns update the facelet notation across views and reset', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Solved cube' }).click()
  const notation = page.getByRole('textbox', { name: 'Notation' })
  const solved = await notation.inputValue()
  await page.getByRole('button', { name: '3D View' }).click()
  await page.getByTitle('Turn U clockwise').click()
  await expect(notation).not.toHaveValue(solved)

  const turned = await notation.inputValue()
  await page.getByRole('button', { name: '2D Net' }).click()
  await expect(notation).toHaveValue(turned)
  await page.getByRole('button', { name: '3D View' }).click()
  await page.getByRole('button', { name: 'Reset', exact: true }).click()
  await expect(notation).toHaveValue(solved)
})

test('swiping a sticker turns its inner slice on a 5x5 cube', async ({
  page,
}) => {
  await page.goto('/')
  await page
    .getByRole('combobox', { name: 'Cube' })
    .selectOption({ label: '5×5' })
  await page.getByRole('button', { name: 'Solved cube' }).click()
  await page.getByRole('button', { name: '3D View' }).click()
  await page.getByRole('button', { name: 'Front (F)' }).click()
  const notation = page.getByRole('textbox', { name: 'Notation' })
  const solved = (await notation.inputValue()).split(' ')
  const bounds = await page.locator('.cube-3d-canvas').boundingBox()
  expect(bounds).not.toBeNull()
  if (!bounds) return
  const x = bounds.x + bounds.width / 2 - 38
  const y = bounds.y + bounds.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x, y - 70, { steps: 5 })
  await page.mouse.up()
  await expect(notation).not.toHaveValue(solved.join(' '))
  const turned = (await notation.inputValue()).split(' ')
  expect(turned[1]).toBe(solved[1])
  expect(turned[4]).toBe(solved[4])
  await expect(page.getByRole('status', { name: 'Move history' })).toHaveText(
    "Moves: 2L'",
  )
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(notation).toHaveValue(solved.join(' '))
})

test('lists face presets in URFDLB order', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Solved cube' }).click()
  await page.getByRole('button', { name: '3D View' }).click()
  const section = page.locator('.cube-3d-section').first()
  await expect(section).toBeVisible()
  const labels = await section.locator('button').allTextContents()
  expect(labels.map((label) => label.trim())).toEqual([
    'Up (U)',
    'Right (R)',
    'Front (F)',
    'Down (D)',
    'Left (L)',
    'Back (B)',
    'Isometric',
  ])
})

test('shows the slate backdrop through a transparent WebGL canvas', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Solved cube' }).click()
  await page.getByRole('button', { name: '3D View' }).click()
  const backdrop = await page
    .locator('.cube-3d-canvas-wrap')
    .evaluate((wrap) => {
      const canvas = wrap.querySelector('canvas')
      const gl = canvas?.getContext('webgl2') ?? canvas?.getContext('webgl')
      return {
        alpha: gl?.getContextAttributes()?.alpha,
        background: getComputedStyle(wrap).backgroundImage,
      }
    })
  expect(backdrop.alpha).toBe(true)
  expect(backdrop.background.match(/radial-gradient/g)).toHaveLength(2)
})

test('a dragged cube keeps turning briefly after release', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Solved cube' }).click()
  await page.getByRole('button', { name: '3D View' }).click()
  const canvas = page.locator('.cube-3d-canvas')
  await expect(canvas).toBeVisible()
  const bounds = await canvas.boundingBox()
  expect(bounds).not.toBeNull()
  if (!bounds) return

  const x = bounds.x + bounds.width * 0.12
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

test('auto-rotate pauses for a drag and resumes without changing its setting', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Solved cube' }).click()
  await page.getByRole('button', { name: '3D View' }).click()
  await page.getByRole('button', { name: 'Auto-rotate' }).click()
  const canvas = page.locator('.cube-3d-canvas')
  const bounds = await canvas.boundingBox()
  expect(bounds).not.toBeNull()
  if (!bounds) return

  const x = bounds.x + bounds.width * 0.12
  const y = bounds.y + bounds.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + 90, y + 20)
  await page.waitForTimeout(100)
  const held = await canvas.screenshot()
  await page.waitForTimeout(150)
  expect((await canvas.screenshot()).equals(held)).toBe(true)

  await page.mouse.up()
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible()
  await expect
    .poll(async () => page.evaluate(() => document.cookie))
    .toContain('cube-assembler-auto-rotate=1')
  await page.waitForTimeout(250)
  const idle = await canvas.screenshot()
  await page.waitForTimeout(150)
  expect((await canvas.screenshot()).equals(idle)).toBe(true)
  await page.waitForTimeout(1350)
  const resumed = await canvas.screenshot()
  await page.waitForTimeout(150)
  expect((await canvas.screenshot()).equals(resumed)).toBe(false)
})

for (const control of ['Front (F)', 'Isometric', 'Tilt Up', 'Rotate Left']) {
  test(`${control} pauses auto-rotate so its view can be inspected`, async ({
    page,
  }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Solved cube' }).click()
    await page.getByRole('button', { name: '3D View' }).click()
    await page.getByRole('button', { name: 'Auto-rotate' }).click()
    await page.getByRole('button', { name: control }).click()
    const canvas = page.locator('.cube-3d-canvas')
    await page.waitForTimeout(100)
    const held = await canvas.screenshot()
    await page.waitForTimeout(150)
    expect((await canvas.screenshot()).equals(held)).toBe(true)
    await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible()
  })
}

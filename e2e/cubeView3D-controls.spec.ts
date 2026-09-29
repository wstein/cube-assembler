// The 3D view's move history, Undo, scramble, the X/Y/Z gizmo and the
// preset views.
import { expect, test } from '@playwright/test'
import { swipeFrontFace, waitForCubeIdle } from './cubeView3DHelpers'

test('move history and Undo survive a view switch, then Reset clears them', async ({
  page,
}) => {
  await page.goto('/')
  await page
    .getByRole('combobox', { name: 'Cube' })
    .selectOption({ label: '5×5' })
  await page.getByRole('button', { name: 'Solved cube' }).click()
  const notation = page.getByRole('textbox', { name: 'Notation' })
  const solved = await notation.inputValue()
  await page.getByRole('button', { name: '3D View' }).click()
  await page.getByRole('button', { name: 'Front (F)' }).click()
  const undo = page.getByRole('button', { name: 'Undo', exact: true })
  const history = page.getByRole('status', { name: 'Move history' })
  await expect(undo).toBeDisabled()

  await swipeFrontFace(page)
  await expect(history).toHaveText("Moves: 2L'")
  const afterFirst = await notation.inputValue()
  expect(afterFirst).not.toBe(solved)
  await swipeFrontFace(page, 38)
  await expect(history).toHaveText("Moves: 2L' 2R")
  await expect(notation).not.toHaveValue(afterFirst)

  await page.getByRole('button', { name: '2D Net' }).click()
  await page.getByRole('button', { name: '3D View' }).click()
  await expect(history).toHaveText("Moves: 2L' 2R")
  await undo.click()
  await expect(notation).toHaveValue(afterFirst)
  await expect(history).toHaveText("Moves: 2L'")
  await page.getByRole('button', { name: 'Reset', exact: true }).click()
  await expect(notation).toHaveValue(solved)
  await expect(history).toHaveText('Moves: None')
  await expect(undo).toBeDisabled()
})

test('the X/Y/Z gizmo follows the view and the faces it points through', async ({
  page,
}) => {
  await page.goto('/')
  await page
    .getByRole('combobox', { name: 'Cube' })
    .selectOption({ label: '2×2' })
  await page.getByRole('button', { name: 'Solved cube' }).click()
  await page.getByRole('button', { name: '3D View' }).click()
  await page.getByRole('button', { name: 'Front (F)' }).click()
  const gizmo = page.getByRole('img', { name: /X, Y and Z axes/ })
  await expect(gizmo).toBeVisible()
  // Drawn farthest first, so their order follows the view.
  expect((await gizmo.locator('text').allTextContents()).sort()).toEqual([
    'X',
    'Y',
    'Z',
  ])
  // It shows the orientation only: touches reach the canvas under it.
  await expect(gizmo).toHaveCSS('pointer-events', 'none')
  const zColor = () =>
    gizmo
      .locator('[data-axis="z"]')
      .evaluate((el) => getComputedStyle(el).color)
  const green = await zColor()

  // Two fingers turn the whole cube a quarter about y: Z now points
  // through what was the right face.
  const canvas = page.locator('.cube-3d-canvas')
  const bounds = await canvas.boundingBox()
  if (!bounds) throw new Error('No canvas')
  const cx = bounds.x + bounds.width / 2
  const cy = bounds.y + bounds.height / 2
  const touch = (type: string, id: number, x: number) =>
    canvas.dispatchEvent(type, {
      pointerId: id,
      pointerType: 'touch',
      isPrimary: id === 1,
      clientX: x,
      clientY: cy,
      bubbles: true,
    })
  const turnY = async () => {
    await touch('pointerdown', 1, cx - 40)
    await touch('pointerdown', 2, cx + 40)
    for (let step = 1; step <= 8; step++) {
      await touch('pointermove', 1, cx - 40 - step * 15)
      await touch('pointermove', 2, cx + 40 - step * 15)
    }
    await page.waitForTimeout(150)
    await touch('pointerup', 1, cx - 160)
    await touch('pointerup', 2, cx - 80)
  }
  await turnY()
  await expect(page.getByRole('status', { name: 'Move history' })).toHaveText(
    'Moves: y',
  )
  await expect.poll(zColor).not.toBe(green)
  const turned = await zColor()
  await page.getByRole('button', { name: '2D Net' }).click()
  await page.getByRole('button', { name: '3D View' }).click()
  await expect.poll(zColor).toBe(turned)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect.poll(zColor).toBe(green)
  await turnY()
  await expect.poll(zColor).toBe(turned)
  await page.getByRole('button', { name: 'Reset', exact: true }).click()
  await expect.poll(zColor).toBe(green)
})

test('a 4x4 scramble and Undo leave the invisible axis colors stable', async ({
  page,
}) => {
  await page.goto('/')
  await page
    .getByRole('combobox', { name: 'Cube' })
    .selectOption({ label: '4×4' })
  await page.getByRole('button', { name: 'Solved cube' }).click()
  await page.getByRole('button', { name: '3D View' }).click()
  const z = page.locator('.cube-3d-gizmo [data-axis="z"]')
  const color = () => z.evaluate((el) => getComputedStyle(el).color)
  const green = await color()
  await page.getByRole('button', { name: 'Scramble', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Scramble', exact: true }),
  ).toBeVisible()
  await expect.poll(color).toBe(green)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect.poll(color).toBe(green)
  await page.getByRole('button', { name: 'Reset', exact: true }).click()
  await expect.poll(color).toBe(green)
})

for (const size of [3, 5, 7]) {
  test(`a middle-row swipe moves the ${size}x${size} gizmo like a y rotation`, async ({
    page,
  }) => {
    await page.goto('/')
    await page
      .getByRole('combobox', { name: 'Cube' })
      .selectOption({ label: `${size}×${size}` })
    await page.getByRole('button', { name: '3D View' }).click()
    await page.getByRole('button', { name: 'Front (F)' }).click()
    const gizmoFrontColor = () =>
      page
        .locator('.cube-3d-gizmo [data-axis="z"]')
        .evaluate((el) => getComputedStyle(el).color)
    const original = await gizmoFrontColor()
    const bounds = await page.locator('.cube-3d-canvas').boundingBox()
    if (!bounds) throw new Error('No canvas')
    const x = bounds.x + bounds.width / 2
    const y = bounds.y + bounds.height / 2
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x + 90, y, { steps: 5 })
    await page.mouse.up()
    await expect(page.getByRole('status', { name: 'Move history' })).toHaveText(
      `Moves: ${(size + 1) / 2}U'`,
    )
    await expect.poll(gizmoFrontColor).not.toBe(original)
  })
}

test('consecutive same-layer turns accumulate in move history', async ({
  page,
}) => {
  await page.goto('/')
  await page
    .getByRole('combobox', { name: 'Cube' })
    .selectOption({ label: '5×5' })
  await page.getByRole('button', { name: 'Solved cube' }).click()
  await page.getByRole('button', { name: '3D View' }).click()
  await page.getByRole('button', { name: 'Front (F)' }).click()
  const history = page.getByRole('status', { name: 'Move history' })

  await swipeFrontFace(page)
  await expect(history).toHaveText("Moves: 2L'")
  await swipeFrontFace(page)
  await expect(history).toHaveText('Moves: 2L2')
  await swipeFrontFace(page)
  await expect(history).toHaveText('Moves: 2L')
  await swipeFrontFace(page)
  await expect(history).toHaveText('Moves: None')
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
    .toBe(21)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect
    .poll(async () => (await history.textContent())?.trim().split(/\s+/).length)
    .toBe(20)
})

test('keeps scramble and history controls without layer turn buttons', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Solved cube' }).click()
  await page.getByRole('button', { name: '3D View' }).click()
  await expect(page.getByText('Layer Turns:')).toHaveCount(0)
  await expect(page.getByTitle('Turn U clockwise')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Scramble' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible()
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
    'Iso-back',
  ])
})

test('Iso-back shows the cube from behind, and Isometric turns it back', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Solved cube' }).click()
  await page.getByRole('button', { name: '3D View' }).click()
  const canvas = page.locator('.cube-3d-canvas')
  await page.getByRole('button', { name: 'Isometric' }).click()
  await waitForCubeIdle(page)
  const front = await canvas.screenshot()
  await page.getByRole('button', { name: 'Iso-back' }).click()
  await waitForCubeIdle(page)
  expect((await canvas.screenshot()).equals(front)).toBe(false)
  await page.getByRole('button', { name: 'Isometric' }).click()
  await waitForCubeIdle(page)
  expect((await canvas.screenshot()).equals(front)).toBe(true)
})

test('Iso-back reveals the Down face', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Solved cube' }).click()
  await page.getByRole('button', { name: '3D View' }).click()
  await page.getByRole('button', { name: 'Iso-back' }).click()
  const screenshot = await page.locator('.cube-3d-canvas').screenshot()
  const yellowPixels = await page.evaluate(async (base64) => {
    const image = new Image()
    image.src = `data:image/png;base64,${base64}`
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = image.width
    canvas.height = image.height
    const context = canvas.getContext('2d')!
    context.drawImage(image, 0, 0)
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
    let count = 0
    for (let i = 0; i < pixels.length; i += 4) {
      const red = pixels[i]
      const green = pixels[i + 1]
      const blue = pixels[i + 2]
      // Matte yellow is lime leaning, unlike the older orange-yellow display color.
      if (red > 60 && green > red * 1.05 && blue < red * 0.5) count++
    }
    return count
  }, screenshot.toString('base64'))
  expect(yellowPixels).toBeGreaterThan(1_000)
})

// The 3D view's help overlay, rendering and backdrop, the view's inertia
// after a drag, and auto-rotate.
import { expect, test } from '@playwright/test'
import { waitForCubeIdle } from './cubeView3DHelpers'

test('3D help hides after first touch and returns after twenty seconds idle', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = window.setTimeout.bind(window)
    window.setTimeout = ((
      handler: TimerHandler,
      timeout?: number,
      ...args: unknown[]
    ) =>
      original(
        handler,
        timeout === 10_000 ? 500 : timeout === 20_000 ? 1_000 : timeout,
        ...args,
      )) as typeof window.setTimeout
  })
  await page.goto('/')
  await page.getByRole('button', { name: '3D View' }).click()
  const hint = page.locator('.cube-3d-hint')
  await expect(hint).toBeVisible()
  const canvas = page.locator('.cube-3d-canvas')
  const bounds = await canvas.boundingBox()
  if (!bounds) throw new Error('No canvas')
  const touch = async (type: string) =>
    canvas.dispatchEvent(type, {
      pointerId: 1,
      pointerType: 'touch',
      clientX: bounds.x + bounds.width / 2,
      clientY: bounds.y + bounds.height / 2,
      bubbles: true,
    })
  await touch('pointerdown')
  await touch('pointerup')
  await page.waitForTimeout(250)
  await expect(hint).toBeVisible()
  await expect(hint).toHaveCount(0, { timeout: 1_500 })
  await page.waitForTimeout(250)
  await touch('pointerdown')
  await touch('pointerup')
  await page.waitForTimeout(750)
  await expect(hint).toHaveCount(0)
  await expect(hint).toBeVisible({ timeout: 1_500 })
})

test('3D help turns itself off after active play, including a whole-cube touch', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = window.setTimeout.bind(window)
    window.setTimeout = ((
      handler: TimerHandler,
      timeout?: number,
      ...args: unknown[]
    ) =>
      original(
        handler,
        timeout === 30 * 60_000 ? 500 : timeout,
        ...args,
      )) as typeof window.setTimeout
  })
  await page.goto('/')
  await page.getByRole('button', { name: '3D View' }).click()
  const canvas = page.locator('.cube-3d-canvas')
  const bounds = await canvas.boundingBox()
  if (!bounds) throw new Error('No canvas')
  for (const [id, offset] of [
    [1, -20],
    [2, 20],
  ]) {
    await canvas.dispatchEvent('pointerdown', {
      pointerId: id,
      pointerType: 'touch',
      clientX: bounds.x + bounds.width / 2 + offset,
      clientY: bounds.y + bounds.height / 2,
      bubbles: true,
    })
  }
  await expect(page.locator('.cube-3d-hint')).toHaveCount(0)
  await expect
    .poll(() => page.evaluate(() => document.cookie))
    .toContain('cube-assembler-view-help=0')
})

test('touchpad whole-cube swipes count as 3D help activity', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = window.setTimeout.bind(window)
    window.setTimeout = ((
      handler: TimerHandler,
      timeout?: number,
      ...args: unknown[]
    ) =>
      original(
        handler,
        timeout === 30 * 60_000 ? 500 : timeout,
        ...args,
      )) as typeof window.setTimeout
  })
  await page.goto('/')
  await page.getByRole('button', { name: '3D View' }).click()
  const canvas = page.locator('.cube-3d-canvas')
  const bounds = await canvas.boundingBox()
  if (!bounds) throw new Error('No canvas')
  await canvas.dispatchEvent('wheel', {
    deltaY: 50,
    deltaX: 0,
    deltaMode: 0,
    clientX: bounds.x + bounds.width / 2,
    clientY: bounds.y + bounds.height / 2,
    bubbles: true,
  })
  await expect
    .poll(() => page.evaluate(() => document.cookie))
    .toContain('cube-assembler-view-help=0')
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

for (const size of [2, 5]) {
  test(`${size}x${size} turning cut keeps solid rounded plastic`, async ({
    page,
  }) => {
    await page.goto('/')
    await page
      .getByRole('combobox', { name: 'Cube' })
      .selectOption({ label: `${size}×${size}` })
    await page.getByRole('button', { name: 'Solved cube' }).click()
    await page.getByRole('button', { name: '3D View' }).click()
    const canvas = page.locator('.cube-3d-canvas')
    await expect(canvas).toBeVisible()
    await page.locator('.cube-3d-hint').evaluate((hint) => {
      ;(hint as HTMLElement).style.visibility = 'hidden'
    })
    await page.getByRole('button', { name: 'Front (F)' }).click()
    const bounds = await canvas.boundingBox()
    expect(bounds).not.toBeNull()
    if (!bounds) return
    // Hold the column 40% of a quarter turn into the drag. Facing the
    // front, the sticker moves half the cube width per radian, seen from the
    // default camera distance to the face.
    const half = size / 2
    const focal = bounds.height / (2 * Math.tan(Math.PI / 8))
    const quarter = ((Math.PI / 2) * focal * half) / (3 + size * 1.8 - half)
    const x = bounds.x + bounds.width / 2 - 38
    const y = bounds.y + bounds.height / 2
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x, y - 0.4 * quarter, { steps: 5 })
    await expect(canvas).toHaveScreenshot(`cube-${size}x${size}-mid-turn.png`, {
      maxDiffPixelRatio: 0.03,
    })
    await page.mouse.up()
  })
}

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
  await expect
    .poll(async () => (await canvas.screenshot()).equals(released))
    .toBe(false)
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
  await waitForCubeIdle(page)
  const idle = await canvas.screenshot()
  await page.waitForTimeout(150)
  expect((await canvas.screenshot()).equals(idle)).toBe(true)
  await expect(canvas).toHaveAttribute('data-idle', 'false')
  await expect
    .poll(async () => (await canvas.screenshot()).equals(idle))
    .toBe(false)
})

for (const control of ['Front (F)', 'Isometric', 'Iso-back']) {
  test(`${control} pauses auto-rotate so its view can be inspected`, async ({
    page,
  }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Solved cube' }).click()
    await page.getByRole('button', { name: '3D View' }).click()
    await page.getByRole('button', { name: 'Auto-rotate' }).click()
    await page.getByRole('button', { name: control }).click()
    const canvas = page.locator('.cube-3d-canvas')
    await waitForCubeIdle(page)
    const held = await canvas.screenshot()
    await page.waitForTimeout(150)
    expect((await canvas.screenshot()).equals(held)).toBe(true)
    await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible()
  })
}

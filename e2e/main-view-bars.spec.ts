import { viewPresetOrientation } from '@puzlwerk/viewer'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { Euler, Quaternion } from 'three'
import { setLayerMoves } from './cubeView3DHelpers'

// Controls under the main 3D view on the PuzlWerk viewer (`?viewer=puzlwerk`): FACES, Stickerless,
// Auto-rotate, Move layers and the keyboard shortcuts. The oracles are the viewer's own state, read from
// the stage host (`data-orientation`, `data-appearance`, `data-auto-rotate`, `data-interaction`).
const PUZLWERK = '.cube-card .cube-3d-puzlwerk'

async function openMainView(page: Page, size = 3) {
  await page.goto('/?viewer=puzlwerk')
  await page
    .getByRole('combobox', { name: 'Cube' })
    .selectOption({ label: `${size}×${size}` })
  await page.getByRole('button', { name: 'Solved cube' }).click()
  await page.getByRole('button', { name: '3D View' }).click()
  await expect(page.locator(`${PUZLWERK} canvas`)).toBeVisible()
  return page.locator(PUZLWERK)
}

// Rx(pitch) * Ry(yaw), the form of the existing view's angles, as a quaternion (x, y, z, w).
const orientation = (pitch: number, yaw: number): number[] =>
  new Quaternion().setFromEuler(new Euler(pitch, yaw, 0, 'XYZ')).toArray()

// The stage reports a rotation, which q and -q both name: equal when the quaternions' dot product is +-1.
async function expectOrientation(view: Locator, expected: readonly number[]) {
  await expect
    .poll(async () => {
      const raw = await view.getAttribute('data-orientation')
      if (!raw) return 0
      const got = raw.split(',').map(Number)
      return Math.abs(got.reduce((sum, v, i) => sum + v * expected[i], 0))
    })
    .toBeGreaterThan(0.99999)
}

const FACES = [
  ['Up (U)', 'up'],
  ['Right (R)', 'right'],
  ['Front (F)', 'front'],
  ['Down (D)', 'down'],
  ['Left (L)', 'left'],
  ['Back (B)', 'back'],
  ['Isometric', 'isometric'],
  ['Iso-back', 'iso-back'],
] as const

test('each FACES button shows its view on the stage', async ({ page }) => {
  const view = await openMainView(page)
  for (const [label, preset] of FACES) {
    await page.getByRole('button', { name: label, exact: true }).click()
    await expectOrientation(view, viewPresetOrientation(preset))
  }
})

test('the face letters and the arrow keys move the view like the existing view', async ({
  page,
}) => {
  const view = await openMainView(page)
  await view.locator('xpath=..').focus()
  await page.keyboard.press('f')
  await expectOrientation(view, orientation(0, 0))
  await page.keyboard.press('U')
  await expectOrientation(view, orientation(Math.PI / 2 - 0.05, 0))
  await page.keyboard.press('f')
  await expectOrientation(view, orientation(0, 0))
  await page.keyboard.press('ArrowUp')
  await expectOrientation(view, orientation(0.2, 0))
  await page.keyboard.press('ArrowLeft')
  await expectOrientation(view, orientation(0.2, 0.2))
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await expectOrientation(view, orientation(0.2, -0.2))
  await page.keyboard.press('ArrowDown')
  await expectOrientation(view, orientation(0, -0.2))
})

test('Stickerless toggles the stage appearance and is remembered', async ({
  page,
}) => {
  const view = await openMainView(page)
  await expect(view).toHaveAttribute('data-appearance', 'stickerless')
  const toggle = page.getByRole('button', { name: 'Stickerless', exact: true })
  await toggle.click()
  await expect(view).toHaveAttribute('data-appearance', 'stickered')
  await expect(
    page.getByRole('button', { name: 'Stickered', exact: true }),
  ).toBeVisible()
  const again = await openMainView(page)
  await expect(again).toHaveAttribute('data-appearance', 'stickered')
  await page.getByRole('button', { name: 'Stickered', exact: true }).click()
  await expect(again).toHaveAttribute('data-appearance', 'stickerless')
})

test('Auto-rotate spins the stage and Pause stops it', async ({ page }) => {
  const view = await openMainView(page)
  await expect(view).toHaveAttribute('data-auto-rotate', 'false')
  const start = await view.getAttribute('data-orientation')
  await page.getByRole('button', { name: 'Auto-rotate', exact: true }).click()
  await expect(view).toHaveAttribute('data-auto-rotate', 'true')
  const pause = page.getByRole('button', { name: 'Pause', exact: true })
  await expect(pause).toHaveClass(/cube-3d-btn-active/)
  await expect(view).not.toHaveAttribute('data-orientation', start ?? '')
  await pause.click()
  await expect(view).toHaveAttribute('data-auto-rotate', 'false')
  await expect(
    page.getByRole('button', { name: 'Auto-rotate', exact: true }),
  ).not.toHaveClass(/cube-3d-btn-active/)
})

test('Move layers switches the stage between view and play mode', async ({
  page,
}) => {
  const view = await openMainView(page)
  const lock = page.getByRole('button', { name: 'Move layers' })
  await expect(lock).toHaveAttribute('aria-pressed', 'false')
  await expect(view).toHaveAttribute('data-interaction', 'view')
  await lock.click()
  await expect(lock).toHaveAttribute('aria-pressed', 'true')
  await expect(view).toHaveAttribute('data-interaction', 'play')
  await lock.click()
  await expect(lock).toHaveAttribute('aria-pressed', 'false')
  await expect(view).toHaveAttribute('data-interaction', 'view')
})

test('Move layers is remembered', async ({ page, context }) => {
  await setLayerMoves(context)
  const view = await openMainView(page)
  await expect(
    page.getByRole('button', { name: 'Move layers' }),
  ).toHaveAttribute('aria-pressed', 'true')
  await expect(view).toHaveAttribute('data-interaction', 'play')
})

// The viewer has no idle signal (inventory G9): the stage is still once two frames 250 ms apart are equal.
async function stillFrame(page: Page): Promise<Buffer> {
  const canvas = page.locator(`${PUZLWERK} canvas`)
  let previous: Buffer | undefined
  let still: Buffer | undefined
  await expect
    .poll(async () => {
      const frame = await canvas.screenshot()
      if (previous?.equals(frame)) still = frame
      previous = frame
      await page.waitForTimeout(250)
      return still !== undefined
    })
    .toBe(true)
  if (!still) throw new Error('No still frame')
  return still
}

test('switching the lock keeps the state shown', async ({ page, context }) => {
  await setLayerMoves(context)
  const view = await openMainView(page)
  await page.getByRole('button', { name: 'Front (F)', exact: true }).click()
  const bounds = await view.boundingBox()
  if (!bounds) throw new Error('No stage')
  const solved = await stillFrame(page)
  // A swipe across the middle row of the front face turns it by a quarter.
  await page.mouse.move(bounds.x + 224, bounds.y + 210)
  await page.mouse.down()
  await page.mouse.move(bounds.x + 424, bounds.y + 210, { steps: 12 })
  await page.mouse.up()
  await expect(view).toHaveAttribute('data-turn', 'end')
  const turned = await stillFrame(page)
  expect(turned.equals(solved)).toBe(false)
  const lock = page.getByRole('button', { name: 'Move layers' })
  await lock.click()
  await expect(view).toHaveAttribute('data-interaction', 'view')
  await lock.click()
  await expect(view).toHaveAttribute('data-interaction', 'play')
  expect((await stillFrame(page)).equals(turned)).toBe(true)
})

// A swipe that starts in the outer quarter of a sticker next to a gap (front view, 3x3, a point of the
// stage 224 px right and 141 px below its corner) turns one layer, or with the seam setting a wide block.
for (const [name, seam, turn] of [
  ['one layer without the seam setting', false, 'Y:2'],
  ['a wide block with the seam setting, with the badge', true, 'Y:1,2'],
] as const) {
  test(`swipe near a gap: ${name}`, async ({ page, context }) => {
    await setLayerMoves(context)
    if (seam)
      await context.addCookies([
        {
          name: 'cube-assembler-seam-wide',
          value: '1',
          url: `http://127.0.0.1:${process.env.E2E_PORT ?? '4174'}`,
        },
      ])
    const view = await openMainView(page)
    await page.getByRole('button', { name: 'Front (F)', exact: true }).click()
    await stillFrame(page)
    const bounds = await view.boundingBox()
    if (!bounds) throw new Error('No stage')
    const badge = page.locator('.cube-card [role="status"]', {
      hasText: 'Wide turn: drag to turn the touched layers',
    })
    await page.mouse.move(bounds.x + 224, bounds.y + 141)
    await page.mouse.down()
    await page.mouse.move(bounds.x + 284, bounds.y + 141, { steps: 6 })
    await expect(view).toHaveAttribute('data-turn', turn)
    if (seam) await expect(badge).toBeVisible()
    else await expect(badge).toHaveCount(0)
    await page.mouse.up()
    await expect(view).toHaveAttribute('data-turn', 'end')
  })
}

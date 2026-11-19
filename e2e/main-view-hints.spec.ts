import { expect, test, type Page } from '@playwright/test'
import { setLayerMoves } from './cubeView3DHelpers'

// Overlay hints of the main 3D view on the PuzlWerk viewer (`?viewer=puzlwerk`): the viewer draws no texts,
// the app shows them as DOM. Wording and conditions are those of the existing view.
const WIDE = 'Wide turn: drag to turn the touched layers'
const LOCKED = 'Locked - tap the lock to move layers'
const CLASSIC_CANVAS = '.cube-card .cube-3d-canvas'
const PUZLWERK = '.cube-card .cube-3d-puzlwerk'

async function openMainView(page: Page, url: string, size = 3) {
  await page.goto(url)
  await page
    .getByRole('combobox', { name: 'Cube' })
    .selectOption({ label: `${size}×${size}` })
  await page.getByRole('button', { name: 'Solved cube' }).click()
  await page.getByRole('button', { name: '3D View' }).click()
}

async function stageBounds(page: Page) {
  const view = page.locator(PUZLWERK)
  await expect(view.locator('canvas')).toBeVisible()
  const bounds = await view.boundingBox()
  if (!bounds) throw new Error('No stage')
  return bounds
}

test('the help line has the wording of the existing view, with the seam rule on', async ({
  page,
  context,
}) => {
  // The help line of one page, once its canvas (not the loading text) is shown.
  const read = async (url: string, canvas: string) => {
    await openMainView(page, url)
    await expect(page.locator(canvas)).toBeVisible()
    const hint = page.locator('.cube-card .cube-3d-hint')
    await expect(hint).toBeVisible()
    return (await hint.innerText()).replace(/\s+/g, ' ').trim()
  }
  const classic = await read('/', CLASSIC_CANVAS)
  const puzlwerk = await read('/?viewer=puzlwerk', `${PUZLWERK} canvas`)
  expect(puzlwerk).toBe(
    'Swipe a sticker to turn its layer; gaps are inactive • Shift makes a wide turn • Two fingers on the cube turn the whole cube • Drag the background or swipe two fingers beside the cube to rotate the view • Pinch or scroll to zoom',
  )
  expect(puzlwerk).toBe(classic)
  await context.addCookies([
    {
      name: 'cube-assembler-seam-wide',
      value: '1',
      url: `http://127.0.0.1:${process.env.E2E_PORT ?? '4174'}`,
    },
  ])
  const classicSeam = await read('/', CLASSIC_CANVAS)
  const puzlwerkSeam = await read('/?viewer=puzlwerk', `${PUZLWERK} canvas`)
  expect(puzlwerkSeam).toContain(
    'gaps are inactive; swipe near a gap and lean toward a side for a wide turn • Shift',
  )
  expect(puzlwerkSeam).toBe(classicSeam)
})

test('the help line hides while the stage is pressed and returns after the idle time', async ({
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
  await openMainView(page, '/?viewer=puzlwerk')
  const bounds = await stageBounds(page)
  const hint = page.locator('.cube-card .cube-3d-hint')
  await expect(hint).toBeVisible()
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + 40)
  await page.mouse.down()
  // Held: the line goes away after the first-touch delay and stays away.
  await expect(hint).toBeHidden()
  await page.mouse.up()
  // Idle again: it comes back.
  await expect(hint).toBeVisible()
})

test('a drag while layer moves are locked explains the lock', async ({
  page,
}) => {
  await openMainView(page, '/?viewer=puzlwerk')
  const view = page.locator(PUZLWERK)
  const bounds = await stageBounds(page)
  await expect(view).toHaveAttribute('data-interaction', 'view')
  const status = page.locator('.cube-card [role="status"]', { hasText: LOCKED })
  await expect(status).toHaveCount(0)
  const cx = bounds.x + bounds.width / 2
  const cy = bounds.y + bounds.height / 2
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  await page.mouse.move(cx + 60, cy, { steps: 6 })
  await expect(status).toBeVisible()
  await page.mouse.up()
})

for (const [name, shift] of [
  ['a plain drag turns one layer and shows no badge', false],
  ['a Shift drag turns a wide block and shows the badge until it ends', true],
] as const) {
  test(`layer moves on: ${name}`, async ({ page, context }) => {
    await setLayerMoves(context)
    await openMainView(page, '/?viewer=puzlwerk')
    const view = page.locator(PUZLWERK)
    const bounds = await stageBounds(page)
    await expect(view).toHaveAttribute('data-interaction', 'play')
    const badge = page.locator('.cube-card [role="status"]', { hasText: WIDE })
    const locked = page.locator('.cube-card [role="status"]', {
      hasText: LOCKED,
    })
    const cx = bounds.x + bounds.width / 2
    const cy = bounds.y + bounds.height / 2
    if (shift) await page.keyboard.down('Shift')
    await page.mouse.move(cx - 60, cy + 40)
    await page.mouse.down()
    await page.mouse.move(cx - 60, cy - 30, { steps: 6 })
    await expect(view).toHaveAttribute(
      'data-turn',
      shift ? /^[XYZ]:\d,\d$/ : /^[XYZ]:\d$/,
    )
    if (shift) await expect(badge).toBeVisible()
    else await expect(badge).toHaveCount(0)
    // The drag is past the lock hint's distance; unlocked, the hint stays away.
    await expect(locked).toHaveCount(0)
    await page.mouse.up()
    await expect(view).toHaveAttribute('data-turn', 'end')
    await expect(badge).toHaveCount(0)
    if (shift) await page.keyboard.up('Shift')
  })
}

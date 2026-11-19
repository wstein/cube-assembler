import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { setLayerMoves } from './cubeView3DHelpers'

// The state of the main 3D view on the PuzlWerk viewer (`?viewer=puzlwerk`): the CUBE group, the move
// list ("Moves: ..."), a turn by gesture, scramble, undo, reset and random state. The app's 2D net shows
// the state the view reports (`onTurnStateChange`); its parity verdict is the oracle that the state is a
// valid cube.
const PUZLWERK = '.cube-card .cube-3d-puzlwerk'
const base = () => `http://127.0.0.1:${process.env.E2E_PORT ?? '4174'}`

async function openMainView(page: Page, size = 3) {
  await page.goto('/?viewer=puzlwerk')
  await page
    .getByRole('combobox', { name: 'Cube' })
    .selectOption({ label: `${size}×${size}` })
  await page.getByRole('button', { name: 'Solved cube' }).click()
  await page.getByRole('button', { name: '3D View' }).click()
  await expect(page.locator(`${PUZLWERK} canvas`)).toBeVisible()
  await expect(page.locator(PUZLWERK)).toHaveAttribute('data-appearance', /.+/)
}

// Short, fast scrambles keep the software renderer's run short.
async function quickTurns(context: BrowserContext) {
  await context.addCookies(
    [
      ['cube-assembler-turn-ms', '60'],
      ['cube-assembler-scramble-length', 'short'],
      // No help line over the stage: screenshots of it are compared.
      ['cube-assembler-view-help', '0'],
    ].map(([name, value]) => ({ name, value, url: base() })),
  )
}

// Share of pixels that differ clearly between two PNG screenshots, compared in the page.
async function differingShare(page: Page, first: Buffer, second: Buffer) {
  return page.evaluate(
    async ([x, y]) => {
      const pixels = async (base64: string) => {
        const blob = await (
          await fetch(`data:image/png;base64,${base64}`)
        ).blob()
        const bitmap = await createImageBitmap(blob)
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
        const context = canvas.getContext('2d')
        if (!context) throw new Error('No 2d context')
        context.drawImage(bitmap, 0, 0)
        return context.getImageData(0, 0, bitmap.width, bitmap.height).data
      }
      const [p, q] = [await pixels(x), await pixels(y)]
      let differing = 0
      for (let i = 0; i < p.length; i += 4)
        if (
          Math.abs(p[i] - q[i]) +
            Math.abs(p[i + 1] - q[i + 1]) +
            Math.abs(p[i + 2] - q[i + 2]) >
          60
        )
          differing += 1
      return differing / (p.length / 4)
    },
    [first.toString('base64'), second.toString('base64')],
  )
}

// The stage as the viewer shows it after playing turns equals the stage made again from the state the app
// holds (the 2D net and back). Only the thin cubie sides can differ (a made-again cube has no piece
// identities), under 2% of the pixels; a wrong state changes whole sticker blocks (over 25%).
async function expectHeldStateShown(page: Page) {
  const stage = page.locator(PUZLWERK)
  // No hover highlight under the pointer.
  await page.mouse.move(0, 0)
  // Settled: two shots a moment apart are the same.
  let played = await stage.screenshot()
  await expect
    .poll(
      async () => {
        await page.waitForTimeout(300)
        const next = await stage.screenshot()
        const same = next.equals(played)
        played = next
        return same
      },
      { timeout: 20_000 },
    )
    .toBe(true)
  await page.getByRole('button', { name: '2D Net' }).click()
  await expect(page.locator('.cube-card .cube-net')).toBeVisible()
  await page.getByRole('button', { name: '3D View' }).click()
  await expect(page.locator(`${PUZLWERK} canvas`)).toBeVisible()
  await expect(stage).toHaveAttribute('data-appearance', /.+/)
  await expect
    .poll(async () => differingShare(page, played, await stage.screenshot()), {
      timeout: 20_000,
    })
    .toBeLessThan(0.02)
}

const history = (page: Page) => page.locator('.cube-card .cube-3d-move-history')
const button = (page: Page, name: string) =>
  page.locator('.cube-card').getByRole('button', { name, exact: true })
const moveCount = async (page: Page) => {
  const text = (await history(page).innerText()).replace(/\s+/g, ' ').trim()
  return text === 'Moves: None' ? 0 : text.split(' ').length - 1
}

// The 2D net of the state the view reported, and back to the 3D view (which starts from that state).
async function netVerdict(page: Page) {
  await page.getByRole('button', { name: '2D Net' }).click()
  const verdict = page.locator('.cube-card .verdict')
  await expect(verdict).toBeVisible()
  const valid = await verdict.evaluate((el) =>
    el.classList.contains('is-valid'),
  )
  await page.getByRole('button', { name: '3D View' }).click()
  await expect(page.locator(`${PUZLWERK} canvas`)).toBeVisible()
  return valid
}

test('the CUBE group and the move list show with the groups of the existing view', async ({
  page,
}) => {
  await openMainView(page)
  const labels = page.locator('.cube-card .cube-3d-toolbar .cube-3d-label')
  await expect(labels).toHaveText(['Faces:', 'Cube:'])
  const group = page.locator('.cube-card .cube-3d-section', {
    has: page.locator('.cube-3d-label', { hasText: 'Cube:' }),
  })
  await expect(group.getByRole('button')).toHaveText([
    'Scramble',
    'Random State',
    'Undo',
    'Reset',
  ])
  await expect(history(page)).toHaveText('Moves: None')
  await expect(button(page, 'Undo')).toBeDisabled()
  await expect(button(page, 'Reset')).toBeDisabled()
})

test('a turn by gesture enters the move list; Undo takes it back; Reset starts over', async ({
  page,
  context,
}) => {
  await setLayerMoves(context)
  await quickTurns(context)
  await openMainView(page)
  const view = page.locator(PUZLWERK)
  const bounds = await view.boundingBox()
  if (!bounds) throw new Error('No stage')
  const cx = bounds.x + bounds.width / 2
  const cy = bounds.y + bounds.height / 2
  await page.mouse.move(cx - 60, cy + 40)
  await page.mouse.down()
  await page.mouse.move(cx - 60, cy - 30, { steps: 6 })
  await page.mouse.up()
  await expect(view).toHaveAttribute('data-turn', 'end')
  await expect(history(page)).not.toHaveText('Moves: None')
  expect(await moveCount(page)).toBe(1)
  await expect(button(page, 'Undo')).toBeEnabled()
  await expect(button(page, 'Reset')).toBeEnabled()
  await expectHeldStateShown(page)
  expect(await netVerdict(page)).toBe(true)
  // The state survives the switch to the net and back.
  expect(await moveCount(page)).toBe(1)
  await button(page, 'Undo').click()
  await expect(history(page)).toHaveText('Moves: None')
  await expect(button(page, 'Undo')).toBeDisabled()
  await expect(button(page, 'Reset')).toBeDisabled()
  await expectHeldStateShown(page)
  // A turn, then Reset.
  await page.mouse.move(cx - 60, cy + 40)
  await page.mouse.down()
  await page.mouse.move(cx - 60, cy - 30, { steps: 6 })
  await page.mouse.up()
  await expect.poll(() => moveCount(page)).toBe(1)
  await button(page, 'Reset').click()
  await expect(history(page)).toHaveText('Moves: None')
  await expect(button(page, 'Reset')).toBeDisabled()
  await expectHeldStateShown(page)
})

test('Scramble turns the cube move by move, Undo takes one back, Reset solves it', async ({
  page,
  context,
}) => {
  await quickTurns(context)
  await openMainView(page)
  await button(page, 'Scramble').click()
  await expect(button(page, 'Stop')).toBeVisible()
  await expect(button(page, 'Undo')).toBeDisabled()
  await expect(button(page, 'Scramble')).toBeVisible({ timeout: 60_000 })
  // A short scramble of a 3x3 is ten turns, none of them cancelling.
  await expect.poll(() => moveCount(page)).toBe(10)
  await expect(button(page, 'Undo')).toBeEnabled()
  await expectHeldStateShown(page)
  expect(await netVerdict(page)).toBe(true)
  await button(page, 'Undo').click()
  await expect.poll(() => moveCount(page)).toBe(9)
  await expectHeldStateShown(page)
  expect(await netVerdict(page)).toBe(true)
  await button(page, 'Reset').click()
  await expect(history(page)).toHaveText('Moves: None')
  await expect(button(page, 'Reset')).toBeDisabled()
  await expectHeldStateShown(page)
})

test('Stop ends a scramble after the turn in progress', async ({
  page,
  context,
}) => {
  await context.addCookies([
    { name: 'cube-assembler-turn-ms', value: '60', url: base() },
  ])
  await openMainView(page, 5)
  await button(page, 'Scramble').click()
  await expect.poll(() => moveCount(page)).toBeGreaterThan(1)
  await button(page, 'Stop').click()
  await expect(button(page, 'Scramble')).toBeVisible()
  const stopped = await moveCount(page)
  expect(stopped).toBeLessThan(40)
  await page.waitForTimeout(1500)
  // At most the turn that was playing joined the list.
  expect(await moveCount(page)).toBeLessThanOrEqual(stopped + 1)
  await expect(button(page, 'Undo')).toBeEnabled()
})

for (const size of [2, 3, 4, 7, 15]) {
  test(`Random State at ${size}x${size} shows a valid cube with no moves`, async ({
    page,
  }) => {
    await openMainView(page, size)
    await button(page, 'Random State').click()
    await expect(history(page)).toHaveText('Moves: None')
    await expect(button(page, 'Reset')).toBeEnabled()
    await expect(page.getByText('3D view unavailable')).toHaveCount(0)
    await expect(page.locator(`${PUZLWERK} canvas`)).toBeVisible()
    await expectHeldStateShown(page)
    expect(await netVerdict(page)).toBe(true)
    await button(page, 'Reset').click()
    await expect(button(page, 'Reset')).toBeDisabled()
    await expectHeldStateShown(page)
  })
}

test('the CUBE group works while layer moves are locked', async ({
  page,
  context,
}) => {
  await quickTurns(context)
  await openMainView(page)
  // Locked (the default): a drag only orbits; the CUBE group still works.
  await expect(page.locator(PUZLWERK)).toHaveAttribute(
    'data-interaction',
    'view',
  )
  await button(page, 'Scramble').click()
  await expect(button(page, 'Undo')).toBeDisabled()
  await expect(button(page, 'Scramble')).toBeVisible({ timeout: 60_000 })
  await expect.poll(() => moveCount(page)).toBe(10)
})

import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { setLayerMoves } from './cubeView3DHelpers'

// Sound on the main 3D view on the PuzlWerk viewer (`?viewer=puzlwerk`): the Sound toggle of the existing
// toolbar, the click of a finished turn and the cue of a selected wide turn. A stand-in for Web Audio
// counts the sounds the page starts (`window.__sound`).
const PUZLWERK = '.cube-card .cube-3d-puzlwerk'
const SOUND_COOKIE = 'cube-assembler-turn-sound'
const base = () => `http://127.0.0.1:${process.env.E2E_PORT ?? '4174'}`

async function countSounds(page: Page) {
  await page.addInitScript(() => {
    const counts = { clicks: 0, cues: 0 }
    ;(window as unknown as { __sound: typeof counts }).__sound = counts
    const node = (): Record<string, unknown> => {
      const self: Record<string, unknown> = {
        connect: (next: unknown) => next,
        start: () => {},
        stop: () => {},
        frequency: { value: 0 },
        Q: { value: 0 },
        gain: {
          setValueAtTime: () => {},
          exponentialRampToValueAtTime: () => {},
        },
      }
      return self
    }
    class FakeAudio {
      state = 'running'
      currentTime = 0
      sampleRate = 8000
      destination = node()
      resume() {}
      createBuffer(_c: number, length: number) {
        return { getChannelData: () => new Float32Array(length) }
      }
      createBufferSource() {
        counts.clicks += 1
        return node()
      }
      createBiquadFilter() {
        return node()
      }
      createGain() {
        return node()
      }
      createOscillator() {
        counts.cues += 1
        return node()
      }
    }
    ;(window as unknown as { AudioContext: unknown }).AudioContext = FakeAudio
  })
}

const sounds = (page: Page) =>
  page.evaluate(
    () =>
      (window as unknown as { __sound: { clicks: number; cues: number } })
        .__sound,
  )

async function setSound(context: BrowserContext, on: boolean) {
  await context.addCookies([
    { name: SOUND_COOKIE, value: on ? '1' : '0', url: base() },
    { name: 'cube-assembler-turn-ms', value: '60', url: base() },
    { name: 'cube-assembler-scramble-length', value: 'short', url: base() },
    { name: 'cube-assembler-view-help', value: '0', url: base() },
  ])
}

async function openMainView(page: Page) {
  await page.goto('/?viewer=puzlwerk')
  await page.getByRole('button', { name: 'Solved cube' }).click()
  await page.getByRole('button', { name: '3D View' }).click()
  await expect(page.locator(`${PUZLWERK} canvas`)).toBeVisible()
  await expect(page.locator(PUZLWERK)).toHaveAttribute('data-interaction', /.+/)
}

const soundButton = (page: Page) =>
  page.locator('.cube-card .cube-3d-actions').getByRole('button', {
    name: 'Sound',
    exact: true,
  })

async function drag(page: Page, shift = false) {
  const bounds = await page.locator(PUZLWERK).boundingBox()
  if (!bounds) throw new Error('No stage')
  const cx = bounds.x + bounds.width / 2
  const cy = bounds.y + bounds.height / 2
  if (shift) await page.keyboard.down('Shift')
  await page.mouse.move(cx - 60, cy + 40)
  await page.mouse.down()
  await page.mouse.move(cx - 60, cy - 30, { steps: 6 })
  await page.mouse.up()
  if (shift) await page.keyboard.up('Shift')
}

test('the Sound toggle sits with the other toggles and stores the setting', async ({
  page,
  context,
}) => {
  await setSound(context, true)
  await openMainView(page)
  const labels = page.locator('.cube-card .cube-3d-actions button')
  await expect(labels).toHaveText([
    'Stickerless',
    'Auto-rotate',
    'Move layers',
    'Sound',
  ])
  await expect(soundButton(page)).toHaveAttribute('aria-pressed', 'true')
  await expect(soundButton(page)).toHaveClass(/cube-3d-btn-active/)
  await soundButton(page).click()
  await expect(soundButton(page)).toHaveAttribute('aria-pressed', 'false')
  await expect(soundButton(page)).not.toHaveClass(/cube-3d-btn-active/)
  const stored = async () =>
    (await context.cookies()).find((c) => c.name === SOUND_COOKIE)?.value
  expect(await stored()).toBe('0')
  await soundButton(page).click()
  expect(await stored()).toBe('1')
})

test('a turn by gesture clicks with sound on and stays silent with it off', async ({
  page,
  context,
}) => {
  await countSounds(page)
  await setLayerMoves(context)
  await setSound(context, true)
  await openMainView(page)
  expect((await sounds(page)).clicks).toBe(0)
  await drag(page)
  await expect(page.locator(PUZLWERK)).toHaveAttribute('data-turn', 'end')
  await expect.poll(async () => (await sounds(page)).clicks).toBe(1)
  await soundButton(page).click()
  await drag(page)
  // The same layer again: the history merges the two quarter turns.
  await expect(page.locator('.cube-card .cube-3d-move-history')).toHaveText(
    /^Moves: \S+2$/,
  )
  await page.waitForTimeout(500)
  expect((await sounds(page)).clicks).toBe(1)
})

test('each step of a scramble and an undo click; a stopped-sound scramble does not', async ({
  page,
  context,
}) => {
  await countSounds(page)
  await setSound(context, true)
  await openMainView(page)
  const scramble = page
    .locator('.cube-card')
    .getByRole('button', { name: 'Scramble', exact: true })
  await scramble.click()
  await expect(scramble).toBeVisible({ timeout: 60_000 })
  // A short 3x3 scramble is ten turns.
  await expect.poll(async () => (await sounds(page)).clicks).toBe(10)
  await page
    .locator('.cube-card')
    .getByRole('button', { name: 'Undo', exact: true })
    .click()
  await expect.poll(async () => (await sounds(page)).clicks).toBe(11)
  await soundButton(page).click()
  await scramble.click()
  await expect(scramble).toBeVisible({ timeout: 60_000 })
  await page.waitForTimeout(500)
  expect((await sounds(page)).clicks).toBe(11)
})

test('selecting a wide block plays the cue once, only with sound on', async ({
  page,
  context,
}) => {
  await countSounds(page)
  await setLayerMoves(context)
  await setSound(context, true)
  await openMainView(page)
  await drag(page, true)
  await expect(page.locator(PUZLWERK)).toHaveAttribute('data-turn', 'end')
  expect((await sounds(page)).cues).toBe(1)
  await soundButton(page).click()
  await drag(page, true)
  await expect(page.locator(PUZLWERK)).toHaveAttribute('data-turn', 'end')
  await page.waitForTimeout(300)
  expect((await sounds(page)).cues).toBe(1)
})

import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { unzipSync } from 'fflate'

const archive = 'test/fixtures/photo-identity-4x4-2026-11-16T21-28-43.zip'
const source = unzipSync(readFileSync(archive))['face-u.jpg']

declare global {
  interface Window {
    captureSHA: {
      hold: number
      pending: Array<{ resolve: () => void; reject: (error: Error) => void }>
      finished: number
      imagesStarted: number
      imagesSettled: number
    }
  }
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const state: Window['captureSHA'] = (window.captureSHA = {
      hold: 0,
      pending: [],
      finished: 0,
      imagesStarted: 0,
      imagesSettled: 0,
    })
    const digest = crypto.subtle.digest.bind(crypto.subtle)
    crypto.subtle.digest = async (algorithm, data) => {
      try {
        if (state.hold > 0) {
          state.hold--
          await new Promise<void>((resolve, reject) =>
            state.pending.push({ resolve, reject }),
          )
        }
        return await digest(algorithm, data)
      } finally {
        state.finished++
      }
    }
    // Observe actual decoding completion, without replacing image pixels or
    // changing detection. A canceled import may avoid decoding altogether.
    window.Image = new Proxy(window.Image, {
      construct(target, args) {
        const image = Reflect.construct(target, args) as HTMLImageElement
        state.imagesStarted++
        const settled = () => {
          state.imagesSettled++
        }
        image.addEventListener('load', settled, { once: true })
        image.addEventListener('error', settled, { once: true })
        return image
      },
    })
  })
})
const cube = (page: Page) =>
  page.getByRole('combobox', { name: 'Cube', exact: true })
const files = (page: Page) =>
  page.locator('.capture-alternatives input[type=file]')
async function queued(page: Page, count = 1) {
  await expect
    .poll(() => page.evaluate(() => window.captureSHA.pending.length))
    .toBe(count)
}
async function settle(page: Page, reject = false) {
  await page.evaluate((reject) => {
    const pending = window.captureSHA.pending.shift()
    if (!pending) throw new Error('No queued SHA operation')
    if (reject) pending.reject(new Error('deliberate stale read'))
    else pending.resolve()
  }, reject)
}
async function completed(page: Page, count: number) {
  await page.waitForFunction(
    (count) => window.captureSHA.finished >= count,
    count,
  )
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
  )
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.captureSHA.imagesStarted === window.captureSHA.imagesSettled,
      ),
    )
    .toBe(true)
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
  )
}
async function pendingPhoto(page: Page, hold = 1) {
  await page.goto('/')
  await cube(page).selectOption('builtin-generic-4')
  await page.getByRole('button', { name: 'Capture faces', exact: true }).click()
  const capture = page.locator('.capture-modal-content')
  await capture.getByRole('button', { name: 'Guide grid', exact: true }).click()
  await page.evaluate((hold) => {
    window.captureSHA.hold = hold
  }, hold)
  await capture.locator('.capture-import input[type=file]').setInputFiles({
    name: 'face-u.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from(source),
  })
  await queued(page)
  await capture.getByRole('button', { name: 'Close', exact: true }).click()
}

test('a delayed single-photo digest cannot enter a different cube session', async ({
  page,
}) => {
  await pendingPhoto(page)
  await cube(page).selectOption('builtin-generic-5')
  await expect(page.locator('.face-status-row img')).toHaveCount(0)
  await settle(page)
  await completed(page, 1)
  await expect(cube(page)).toHaveValue('builtin-generic-5')
  await expect(page.locator('.face-status-row img')).toHaveCount(0)
  await expect(page.locator('.face-status-row')).toContainText(
    '0 of 6 captured',
  )
  await expect(files(page)).toBeEnabled()
})

test('a delayed fixture digest cannot restore an older size and approval', async ({
  page,
}) => {
  await page.goto('/')
  await cube(page).selectOption('builtin-generic-4')
  await page.evaluate(() => {
    window.captureSHA.hold = 1
  })
  await files(page).setInputFiles(archive)
  await queued(page)
  await cube(page).selectOption('builtin-generic-5')
  await settle(page)
  await completed(page, 6)
  await expect(cube(page)).toHaveValue('builtin-generic-5')
  await expect(page.locator('.face-status-row img')).toHaveCount(0)
  await expect(page.locator('.orientation-approval')).toHaveCount(0)
  await expect(files(page)).toBeEnabled()
})

test('a same-size solved reset supersedes an older fixture read', async ({
  page,
}) => {
  await page.goto('/')
  await cube(page).selectOption('builtin-generic-4')
  await page.evaluate(() => {
    window.captureSHA.hold = 1
  })
  await files(page).setInputFiles(archive)
  await queued(page)
  await page.getByRole('button', { name: 'Solved cube', exact: true }).click()
  const notation = await page
    .getByRole('textbox', { name: 'Notation', exact: true })
    .inputValue()
  await expect(page.locator('.verdict.is-valid')).toBeVisible()
  await settle(page)
  await completed(page, 6)
  await expect(page.locator('.face-status-row img')).toHaveCount(0)
  await expect(page.locator('.orientation-approval')).toHaveCount(0)
  await expect(
    page.getByRole('textbox', { name: 'Notation', exact: true }),
  ).toHaveValue(notation)
  await expect(files(page)).toBeEnabled()
})

for (const reject of [false, true])
  test(`an older ${reject ? 'error' : 'success'} cannot finish a newer queued fixture import`, async ({
    page,
  }) => {
    await pendingPhoto(page, 2)
    await cube(page).selectOption('builtin-generic-5')
    // A file chooser may already have been opened before another callback made
    // its input busy; its queued change event still needs an operation owner.
    await files(page).setInputFiles(
      'test/fixtures/orientation-recovery-7x7.zip',
    )
    await queued(page, 2)
    await settle(page, reject)
    await completed(page, 1)
    await expect(files(page)).toBeDisabled()
    await expect(page.locator('.capture-card .capture-message')).toHaveText(
      'Loading fixture...',
    )
    await expect(page.locator('.face-status-row img')).toHaveCount(0)
    await settle(page)
    await completed(page, 7)
    await expect(cube(page)).toHaveValue('builtin-generic-7')
    await expect(
      page.getByRole('heading', {
        name: 'Does this match your cube?',
        exact: true,
      }),
    ).toBeVisible()
    await expect(files(page)).toBeEnabled()
  })

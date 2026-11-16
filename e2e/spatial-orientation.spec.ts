import { resolve } from 'node:path'
import { expect, test } from '@playwright/test'

for (const width of [1440, 390]) {
  test(`recognized net stays visible at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 })
    await page.goto('/')
    await page
      .locator('.capture-alternatives input[type="file"]')
      .setInputFiles(resolve('test/fixtures/orientation-recovery-7x7.zip'))
    await page
      .getByRole('heading', { name: 'Does this match your cube?' })
      .waitFor({ timeout: 30000 })
    await page
      .getByRole('button', {
        name: 'Adjust face orientations / assignments',
        exact: true,
      })
      .click()
    const net = page.getByRole('group', {
      name: 'Recognized cube net',
      exact: true,
    })
    await expect(net).toBeVisible()
    const faces = net.getByRole('button', { name: /^Inspect [URFDLB] face$/ })
    await expect(faces).toHaveCount(6)
    await expect(
      page.locator('.spatial-workspace .cube-3d-canvas'),
    ).toBeVisible()
    await expect(page.locator('.spatial-advanced')).not.toHaveAttribute(
      'open',
      '',
    )
    await page.screenshot({
      path: testInfo.outputPath(`spatial-${width}.png`),
    })
    for (const face of await faces.all()) {
      expect(
        await face.evaluate((el) => {
          const r = el.getBoundingClientRect()
          return (
            r.top >= 0 &&
            r.bottom <= innerHeight &&
            r.left >= 0 &&
            r.right <= innerWidth
          )
        }),
      ).toBe(true)
    }
  })
}

test('photo lookup, per-face color cancel, advanced rotation, Undo and Reset preserve spatial context', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await page
    .locator('.capture-alternatives input[type="file"]')
    .setInputFiles(resolve('test/fixtures/orientation-recovery-7x7.zip'))
  await page
    .getByRole('heading', { name: 'Does this match your cube?' })
    .waitFor({ timeout: 30000 })
  await page
    .getByRole('button', {
      name: 'Adjust face orientations / assignments',
      exact: true,
    })
    .click()
  const net = page.getByRole('group', {
    name: 'Recognized cube net',
    exact: true,
  })
  const initial = await net
    .locator('.orientation-net-sticker')
    .evaluateAll((els) =>
      els.map((el) => (el as HTMLElement).style.background).join('|'),
    )
  await page
    .getByRole('button', { name: 'Inspect F face', exact: true })
    .focus()
  const photo = page.getByRole('complementary', {
    name: 'Original photo for F face',
  })
  await expect(photo.getByRole('img')).toBeVisible()
  await photo.getByRole('button', { name: 'Correct detected colors' }).click()
  await expect(
    page.getByText('Only this photo is being corrected.', { exact: false }),
  ).toBeVisible()
  for (const face of await net.getByRole('button').all()) {
    expect(
      await face.evaluate((el) => {
        const r = el.getBoundingClientRect()
        const top = document.elementFromPoint(
          r.x + r.width / 2,
          r.y + r.height / 2,
        )
        return !!top && el.contains(top)
      }),
    ).toBe(true)
  }
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(net).toBeVisible()
  await expect(net.locator('.orientation-net-sticker')).toHaveCount(294)
  await expect(page.locator('.spatial-workspace .cube-3d-canvas')).toBeVisible()
  await page
    .getByText('Advanced recovery', {
      exact: true,
    })
    .click()
  await page
    .getByRole('button', { name: /Rotate Side 1 .* clockwise 90°/ })
    .click()
  expect(
    await net
      .locator('.orientation-net-sticker')
      .evaluateAll((els) =>
        els.map((el) => (el as HTMLElement).style.background).join('|'),
      ),
  ).not.toBe(initial)
  await page
    .getByRole('button', { name: 'Undo orientation edit', exact: true })
    .click()
  expect(
    await net
      .locator('.orientation-net-sticker')
      .evaluateAll((els) =>
        els.map((el) => (el as HTMLElement).style.background).join('|'),
      ),
  ).toBe(initial)
  await page
    .getByRole('button', { name: /Rotate Side 1 .* clockwise 90°/ })
    .click()
  await page
    .getByRole('button', { name: 'Reset orientation draft', exact: true })
    .click()
  expect(
    await net
      .locator('.orientation-net-sticker')
      .evaluateAll((els) =>
        els.map((el) => (el as HTMLElement).style.background).join('|'),
      ),
  ).toBe(initial)
  for (const face of await net.getByRole('button').all()) {
    expect(
      await face.evaluate((el) => {
        const r = el.getBoundingClientRect()
        return r.top >= 0 && r.bottom <= innerHeight
      }),
    ).toBe(true)
  }
  expect(errors).toEqual([])
})

test('front-first choices preview immediately; Back preserves drafts and exposes both earlier choices', async ({
  page,
}) => {
  await page.goto('/')
  await page
    .locator('.capture-alternatives input[type="file"]')
    .setInputFiles(resolve('test/fixtures/orientation-recovery-7x7.zip'))
  await page
    .getByRole('heading', { name: 'Does this match your cube?' })
    .waitFor({ timeout: 30000 })
  await page
    .getByRole('button', {
      name: 'Adjust face orientations / assignments',
      exact: true,
    })
    .click()
  const options = page.getByRole('button', { name: /^Choose U as/ })
  await expect(options).toHaveCount(2)
  await options.nth(1).click()
  const net = page.getByRole('group', {
    name: 'Recognized cube net',
    exact: true,
  })
  const chosen = await net.innerHTML()
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(options).toHaveCount(2)
  expect(await net.innerHTML()).toBe(chosen)
  await options.first().click()
  expect(await net.innerHTML()).not.toBe(chosen)
})

test('explicit color edits remain in the assembly draft until outer Confirm; outer Cancel rolls them back', async ({
  page,
}) => {
  await page.goto('/')
  await page
    .locator('.capture-alternatives input[type="file"]')
    .setInputFiles(resolve('test/fixtures/orientation-recovery-7x7.zip'))
  await page
    .getByRole('heading', { name: 'Does this match your cube?' })
    .waitFor({ timeout: 30000 })
  await page
    .getByRole('button', {
      name: 'Adjust face orientations / assignments',
      exact: true,
    })
    .click()
  const net = page.getByRole('group', {
    name: 'Recognized cube net',
    exact: true,
  })
  const snapshot = () =>
    net
      .locator('.orientation-net-sticker')
      .evaluateAll((els) =>
        els.map((el) => (el as HTMLElement).style.background).join('|'),
      )
  const initial = await snapshot()
  await page
    .getByRole('button', { name: 'Inspect F face', exact: true })
    .focus()
  await page
    .getByRole('button', { name: 'Correct detected colors', exact: true })
    .click()
  await page.locator('.review-detected-cell').first().click()
  await page.locator('.color-btn:not(.is-current)').first().click()
  await page.getByRole('button', { name: 'OK', exact: true }).click()
  expect(await snapshot()).not.toBe(initial)
  await page
    .getByRole('button', { name: 'Cancel changes', exact: true })
    .click()
  await page
    .getByRole('button', {
      name: 'Adjust face orientations / assignments',
      exact: true,
    })
    .click()
  expect(await snapshot()).toBe(initial)
})

test.describe('touch recovery', () => {
  test.use({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 },
  })
  test('tap opens an explicitly linked original and chooses a front orientation', async ({
    page,
  }) => {
    await page.goto('/')
    await page
      .locator('.capture-alternatives input[type="file"]')
      .setInputFiles(resolve('test/fixtures/orientation-recovery-7x7.zip'))
    await page
      .getByRole('heading', { name: 'Does this match your cube?' })
      .waitFor({ timeout: 30000 })
    await page
      .getByRole('button', {
        name: 'Adjust face orientations / assignments',
        exact: true,
      })
      .tap()
    await page
      .getByRole('button', { name: 'Inspect F face', exact: true })
      .tap()
    await expect(
      page
        .getByRole('complementary', { name: 'Original photo for F face' })
        .getByRole('img'),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Close original photo' }).tap()
    const option = page.getByRole('button', { name: /^Choose U as/ }).first()
    await option.tap()
    await page.getByRole('button', { name: 'Next', exact: true }).tap()
    await page.getByRole('button', { name: 'Back', exact: true }).tap()
    await expect(
      page.getByRole('button', { name: /^Choose U as/ }),
    ).toHaveCount(2)
    const net = page.getByRole('group', {
      name: 'Recognized cube net',
      exact: true,
    })
    for (const face of await net.getByRole('button').all())
      expect(
        await face.evaluate((el) => {
          const r = el.getBoundingClientRect()
          return r.top >= 0 && r.bottom <= innerHeight
        }),
      ).toBe(true)
  })
})

import { readFileSync } from 'node:fs'
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate'
import type { Page } from '@playwright/test'

async function openRecovery(
  page: Page,
  input: string | { name: string; mimeType: string; buffer: Buffer } = resolve(
    'test/fixtures/orientation-recovery-7x7.zip',
  ),
) {
  await page.goto('/')
  await page
    .locator('.capture-alternatives input[type="file"]')
    .setInputFiles(input)
  await page
    .getByRole('heading', { name: 'Does this match your cube?' })
    .waitFor({ timeout: 30000 })
  await page
    .getByRole('button', {
      name: 'Adjust face orientations / assignments',
      exact: true,
    })
    .click()
}
const netColors = (page: Page) =>
  page
    .getByRole('group', { name: 'Recognized cube net', exact: true })
    .locator('.orientation-net-sticker')
    .evaluateAll((els) =>
      els.map((el) => (el as HTMLElement).style.background).join('|'),
    )

test('R1 regression: Undo restores the same candidate answer and preview before Next', async ({
  page,
}) => {
  await openRecovery(page)
  const choices = page.getByRole('button', { name: /^Choose U as/ })
  await choices.nth(1).click()
  const b = await netColors(page)
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await choices.first().click()
  expect(await netColors(page)).not.toBe(b)
  await page
    .getByRole('button', { name: 'Undo orientation edit', exact: true })
    .click()
  await expect(choices.nth(1)).toHaveAttribute('aria-pressed', 'true')
  await expect(choices.first()).toHaveAttribute('aria-pressed', 'false')
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  expect(await netColors(page)).toBe(b)
})

test('R1 regression: Back retains an accessible answer and Next advances without another selection', async ({
  page,
}) => {
  await openRecovery(page)
  const choices = page.getByRole('button', { name: /^Choose U as/ })
  await choices.first().click()
  const chosen = await netColors(page)
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(choices.first()).toHaveAttribute('aria-pressed', 'true')
  await expect(
    page.getByRole('button', { name: 'Next', exact: true }),
  ).toBeEnabled()
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  expect(await netColors(page)).toBe(chosen)
})

test('R1 regression: a legal mapping outside guided constraints needs deliberate manual acknowledgement', async ({
  page,
}) => {
  const zip = unzipSync(
    readFileSync(resolve('test/fixtures/orientation-recovery-7x7.zip')),
  )
  const key = Object.keys(zip).find((value) => value.endsWith('/meta.json'))!
  const meta = JSON.parse(strFromU8(zip[key]))
  meta.gridSize = 2
  meta.colorsURFDLB = ['W', 'R', 'G', 'Y', 'O', 'B']
    .map((color) => color.repeat(4))
    .join(' ')
  meta.detectedURFDLB = meta.colorsURFDLB
  delete meta.capture.assembledURFDLB
  delete meta.capture.faceRecovery
  zip[key] = strToU8(JSON.stringify(meta))
  await openRecovery(page, {
    name: 'synthetic-incompatible-guide.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from(zipSync(zip)),
  })
  await page
    .getByLabel('Orientation preview frame', { exact: true })
    .selectOption('canonical')
  const confirm = page.getByRole('button', {
    name: 'Confirm face mapping',
    exact: true,
  })
  await expect(confirm).toBeDisabled()
  await page.locator('.spatial-advanced summary').click()
  await page
    .getByRole('checkbox', {
      name: 'Use this manual mapping despite unverified capture constraints',
    })
    .check()
  await expect(confirm).toBeEnabled()
})

test('R1 regression: embedded Escape closes only its child and rolls back color edits', async ({
  page,
}) => {
  await openRecovery(page)
  const initial = await netColors(page)
  const face = page.getByRole('button', { name: 'Inspect F face', exact: true })
  await face.focus()
  await page
    .getByRole('button', { name: 'Correct detected colors', exact: true })
    .click()
  await page.locator('.review-detected-cell').first().click()
  await page.keyboard.press('Escape')
  await expect(
    page.getByRole('heading', {
      name: 'Adjust face orientations / assignments',
    }),
  ).toBeVisible()
  await expect(page.locator('.spatial-color-picker')).toHaveCount(0)
  await expect(page.locator('.spatial-color-editor')).toBeVisible()
  await page.locator('.review-detected-cell').first().click()
  await page.locator('.color-btn:not(.is-current)').first().click()
  await page.locator('.spatial-color-editor').press('Escape')
  await expect(page.locator('.spatial-color-editor')).toHaveCount(0)
  await expect(face).toBeFocused()
  expect(await netColors(page)).toBe(initial)
})

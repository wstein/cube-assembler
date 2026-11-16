import { resolve } from 'node:path'
import { expect, test, type Page } from '@playwright/test'

// Preserve one native 60ms gesture burst even if CDP processing is slow.
// Two awaited touchscreen.tap calls can instead become separate deliberate taps.
async function doubleTouch(page: Page, x: number, y: number) {
  const cdp = await page.context().newCDPSession(page)
  const starts = page.evaluate(
    () =>
      new Promise<number[]>((resolve) => {
        const times: number[] = []
        const record = (event: TouchEvent) => {
          times.push(event.timeStamp)
          if (times.length === 2) {
            window.removeEventListener('touchstart', record)
            resolve(times)
          }
        }
        window.addEventListener('touchstart', record)
      }),
  )
  const timestamp = await page.evaluate(
    () => (performance.timeOrigin + performance.now()) / 1000,
  )
  for (const [type, delta] of [
    ['touchStart', 0],
    ['touchEnd', 0.02],
    ['touchStart', 0.06],
    ['touchEnd', 0.08],
  ] as const)
    await cdp.send('Input.dispatchTouchEvent', {
      type,
      timestamp: timestamp + delta,
      touchPoints: type === 'touchStart' ? [{ x, y, id: 1 }] : [],
    })
  const nativeStarts = await starts
  expect(nativeStarts[1] - nativeStarts[0]).toBeCloseTo(60, 0)
  await cdp.detach()
}

async function approval(page: Page) {
  await page.goto('/')
  await page
    .locator('.capture-alternatives input[type="file"]')
    .setInputFiles(resolve('test/fixtures/orientation-recovery-7x7.zip'))
  await expect(
    page.getByRole('heading', { name: 'Does this match your cube?' }),
  ).toBeVisible()
}
const approvalColors = (page: Page) =>
  page
    .locator('.orientation-approval .orientation-net-sticker')
    .evaluateAll((elements) =>
      elements.map((element) => (element as HTMLElement).style.background),
    )
async function alternatives(page: Page) {
  await page
    .getByRole('button', { name: /^Alternatives \([1-9][0-9]*\)$/ })
    .click()
  await expect(page.locator('.face-recovery')).toBeVisible()
}

test('one choice advances directly to final review without committing', async ({
  page,
}) => {
  await approval(page)
  const original = await approvalColors(page)
  await alternatives(page)
  for (const name of ['Next', 'Undo', 'Reset'])
    await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0)
  await expect(
    page.getByRole('heading', { name: 'Match your cube', exact: true }),
  ).toBeVisible()
  await page.locator('.spatial-candidate').nth(1).click()
  await expect(
    page.getByRole('button', { name: 'Use this cube', exact: true }),
  ).toBeEnabled()
  await expect(page.locator('.face-recovery')).toBeVisible()
  await expect(page.locator('.spatial-candidate')).toHaveCount(0)
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  expect(await approvalColors(page)).toEqual(original)
})

for (const exit of ['Cancel', 'Close', 'Escape'] as const)
  test(`${exit} discards colors and answers and restores the exact prior approval`, async ({
    page,
  }) => {
    await approval(page)
    const original = await approvalColors(page)
    const originalText = await page.locator('.orientation-approval').innerText()
    await alternatives(page)
    await page.locator('.spatial-candidate').nth(1).click()
    await page
      .getByRole('button', { name: 'Inspect Front face', exact: true })
      .focus()
    await page
      .getByRole('button', { name: 'Correct detected colors', exact: true })
      .click()
    await page.locator('.review-detected-cell').first().click()
    await page.locator('.color-btn:not(.is-current)').first().click()
    await page.getByRole('button', { name: 'OK', exact: true }).click()
    if (exit === 'Escape') await page.keyboard.press('Escape')
    else if (exit === 'Close')
      await page.locator('.face-recovery .modal-close').click()
    else
      await page.getByRole('button', { name: /^Cancel(?: changes)?$/ }).click()
    await expect(page.locator('.face-recovery')).toHaveCount(0)
    expect(await approvalColors(page)).toEqual(original)
    expect(await page.locator('.orientation-approval').innerText()).toEqual(
      originalText,
    )
    await alternatives(page)
    await expect(page.locator('.spatial-candidate').first()).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    await expect(
      page.getByRole('button', { name: 'Use this cube', exact: true }),
    ).toHaveCount(0)
  })

test('keyboard selection focuses review and repeated Enter cannot commit', async ({
  page,
}) => {
  await approval(page)
  await alternatives(page)
  await page.locator('.spatial-candidate').first().focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('#spatial-review-title')).toBeFocused()
  await page.keyboard.press('Enter')
  await page.keyboard.press('Space')
  await page
    .getByRole('button', { name: 'Use this cube', exact: true })
    .dispatchEvent('click', { detail: 2 })
  await expect(page.locator('.face-recovery')).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Use this cube', exact: true }),
  ).toBeEnabled()
})

for (const { touch, cpu } of [
  { touch: false, cpu: 1 },
  // Optional stress rate preserves the same native gesture and assertions.
  { touch: true, cpu: Number(process.env.AUTO_WIZARD_TOUCH_CPU ?? 1) },
  { touch: false, cpu: 6 },
])
  test(`a ${cpu > 1 ? `CPU${cpu} ` : ''}${touch ? 'touch' : 'mouse'} double activation answers only one question`, async ({
    browser,
  }) => {
    const context = await browser.newContext({ hasTouch: touch })
    const page = await context.newPage()
    if (cpu > 1) {
      const cdp = await context.newCDPSession(page)
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu })
    }
    await page.goto('/')
    await page
      .locator('.capture-alternatives input[type="file"]')
      .setInputFiles(resolve('test/fixtures/synthetic-4x4-high.zip'))
    await alternatives(page)
    await expect(
      page.getByRole('heading', { name: 'Which matches Right?', exact: true }),
    ).toBeVisible()
    await page
      .locator(
        '.spatial-candidate[data-source-slot="R"][data-quarter-turns="0"]',
      )
      .scrollIntoViewIfNeeded()
    if (touch) {
      const box = (await page
        .locator(
          '.spatial-candidate[data-source-slot="R"][data-quarter-turns="0"]',
        )
        .boundingBox())!
      await doubleTouch(page, box.x + box.width / 2, box.y + box.height / 2)
    } else
      await page
        .locator(
          '.spatial-candidate[data-source-slot="R"][data-quarter-turns="0"]',
        )
        .dblclick({ delay: 60 })
    await expect(
      page.getByRole('heading', { name: 'Which matches Up?', exact: true }),
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Use this cube', exact: true }),
    ).toHaveCount(0)
    await expect(page.locator('.spatial-candidate').first()).toBeEnabled()
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    )
    await expect(page.locator('#spatial-choice-title')).toBeFocused()
    // A separate real choice remains available when the duplicate guard ends.
    if (touch) await page.locator('.spatial-candidate').first().tap()
    else await page.locator('.spatial-candidate').first().click()
    const useCube = page.getByRole('button', {
      name: 'Use this cube',
      exact: true,
    })
    await expect(useCube).toBeEnabled()
    await expect(page.locator('.face-recovery')).toBeVisible()
    if (touch) await useCube.tap()
    else await useCube.click()
    await expect(page.locator('.face-recovery')).toHaveCount(0)
    await context.close()
  })

test('cancelling an independently opened matcher closes without inventing an approval', async ({
  page,
}) => {
  await approval(page)
  await page
    .getByRole('button', { name: 'Yes, this is my cube', exact: true })
    .click()
  const net = () =>
    page
      .locator('.cube-net .net-cell')
      .evaluateAll((elements) =>
        elements.map((element) => (element as HTMLElement).style.background),
      )
  const initial = await net()
  await alternatives(page)
  await page.locator('.spatial-candidate').nth(1).click()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.locator('.face-recovery')).toHaveCount(0)
  await expect(page.locator('.orientation-approval')).toHaveCount(0)
  expect(await net()).toEqual(initial)
})

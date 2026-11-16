import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate'

const archive = resolve('test/fixtures/orientation-recovery-7x7.zip')
async function upload(
  page: Page,
  input: string | { name: string; mimeType: string; buffer: Buffer } = archive,
) {
  await page.goto('/')
  await page
    .locator('.capture-alternatives input[type="file"]')
    .setInputFiles(input)
  await page
    .getByRole('heading', { name: 'Does this match your cube?' })
    .waitFor({ timeout: 30000 })
}
async function openRecovery(
  page: Page,
  input?: { name: string; mimeType: string; buffer: Buffer },
) {
  await upload(page, input)
  await page
    .getByRole('button', {
      name: /^Alternatives \([1-9][0-9]*\)$/,
    })
    .click()
}
const netColors = (page: Page) =>
  page
    .getByRole('group', { name: 'Recognized cube net', exact: true })
    .locator('.orientation-net-sticker')
    .evaluateAll((elements) =>
      elements.map((element) => (element as HTMLElement).style.background),
    )
async function currentMatchesNet(page: Page, selected = true) {
  const current = page.locator('.spatial-candidate').first()
  await expect(current).toHaveAttribute('aria-pressed', String(selected))
  const label = await current.locator('span').textContent()
  expect(label).toMatch(/· 0°$/)
  const target = label!.trim()[0]
  const colors = await current
    .locator('.orientation-net-sticker')
    .evaluateAll((elements) =>
      elements.map((element) => (element as HTMLElement).style.background),
    )
  expect(
    await page
      .locator(`.spatial-net-${target} .orientation-net-sticker`)
      .evaluateAll((elements) =>
        elements.map((element) => (element as HTMLElement).style.background),
      ),
  ).toEqual(colors)
}
async function allFacesVisible(page: Page, unobscured = false) {
  const faces = page
    .getByRole('group', { name: 'Recognized cube net', exact: true })
    .getByRole('button')
  await expect(faces).toHaveCount(6)
  for (const face of await faces.all())
    expect(
      await face.evaluate((element, check) => {
        const box = element.getBoundingClientRect()
        const top = document.elementFromPoint(
          box.x + box.width / 2,
          box.y + box.height / 2,
        )
        return (
          box.top >= 0 &&
          box.bottom <= innerHeight &&
          box.left >= 0 &&
          box.right <= innerWidth &&
          (!check || (!!top && element.contains(top)))
        )
      }, unobscured),
    ).toBe(true)
}
async function saved(page: Page) {
  await page
    .getByRole('button', { name: 'Save as test fixture', exact: true })
    .click()
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download zip', exact: true }).click()
  const path = await (await pending).path()
  if (!path) throw new Error('Missing download')
  const bytes = readFileSync(path)
  const zip = unzipSync(bytes)
  return {
    bytes,
    meta: JSON.parse(
      strFromU8(
        zip[Object.keys(zip).find((key) => key.endsWith('meta.json'))!],
      ),
    ),
  }
}

for (const width of [1440, 390])
  test(`recognized net stays visible at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 })
    await openRecovery(page)
    await allFacesVisible(page)
    await currentMatchesNet(page, false)
    await expect(
      page.locator('.spatial-workspace .cube-3d-canvas'),
    ).toBeVisible()
    await expect(
      page.getByText('Advanced recovery', { exact: true }),
    ).toHaveCount(0)
    await expect(page.getByText('Search details', { exact: true })).toHaveCount(
      0,
    )
    await expect(page.getByRole('button', { name: /Rotate Side/ })).toHaveCount(
      0,
    )
    await expect(
      page.getByRole('button', { name: 'Use this cube', exact: true }),
    ).toHaveCount(0)
    await page.screenshot({ path: testInfo.outputPath(`spatial-${width}.png`) })
    await expect(
      page.getByRole('button', { name: 'Next', exact: true }),
    ).toBeDisabled()
    await page.locator('.spatial-candidate').first().click()
    await page.getByRole('button', { name: 'Next', exact: true }).click()
    await allFacesVisible(page)
    await allFacesVisible(page)
    await expect(
      page.getByRole('button', { name: 'Use this cube', exact: true }),
    ).toBeEnabled()
  })

test('R1: Undo restores candidate answer and preview before Next', async ({
  page,
}) => {
  await openRecovery(page)
  await page.locator('.spatial-candidate').nth(1).click()
  const b = await netColors(page)
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await page.locator('.spatial-candidate').nth(1).click()
  expect(await netColors(page)).not.toEqual(b)
  await page
    .getByRole('button', { name: 'Undo orientation edit', exact: true })
    .click()
  await currentMatchesNet(page)
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  expect(await netColors(page)).toEqual(b)
})

test('R1: Back retains an accessible current answer; Next needs no extra click', async ({
  page,
}) => {
  await openRecovery(page)
  const initial = await netColors(page)
  await page.locator('.spatial-candidate').first().click()
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await currentMatchesNet(page)
  await expect(
    page.getByRole('button', { name: 'Next', exact: true }),
  ).toBeEnabled()
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  expect(await netColors(page)).toEqual(initial)
})

test('R1: a legal free arrangement cannot bypass missing guided candidates', async ({
  page,
}) => {
  const zip = unzipSync(readFileSync(archive))
  const key = Object.keys(zip).find((value) => value.endsWith('meta.json'))!
  const meta = JSON.parse(strFromU8(zip[key]))
  meta.gridSize = 2
  meta.colorsURFDLB = ['W', 'R', 'G', 'Y', 'O', 'B']
    .map((color) => color.repeat(4))
    .join(' ')
  meta.detectedURFDLB = meta.colorsURFDLB
  delete meta.capture.assembledURFDLB
  delete meta.capture.faceRecovery
  zip[key] = strToU8(JSON.stringify(meta))
  await upload(page, {
    name: 'incompatible-guide.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from(zipSync(zip)),
  })
  await expect(
    page.getByRole('button', { name: 'Alternatives (0)', exact: true }),
  ).toBeDisabled()
  await expect(
    page.getByRole('button', { name: 'Yes, this is my cube', exact: true }),
  ).toBeDisabled()
  await expect(page.locator('.spatial-candidate')).toHaveCount(0)
  await page
    .getByRole('button', { name: 'No, check the colors', exact: true })
    .click()
  await expect(page.locator('.webcam-modal-content')).toHaveCount(0)
})

test('R1: color picker and editor Escape keep the outer wizard and roll back edits', async ({
  page,
}) => {
  await openRecovery(page)
  const initial = await netColors(page)
  const face = page.getByRole('button', { name: 'Inspect F face', exact: true })
  await face.focus()
  await page
    .getByRole('button', { name: 'Correct detected colors', exact: true })
    .click()
  await allFacesVisible(page, true)
  await page.locator('.review-detected-cell').first().click()
  expect(
    await page
      .locator('.spatial-color-picker')
      .evaluate((element) => element.contains(document.activeElement)),
  ).toBe(true)
  await page.keyboard.press('Escape')
  await expect(page.locator('.spatial-color-picker')).toHaveCount(0)
  await expect(page.locator('.spatial-color-editor')).toBeVisible()
  await page.locator('.review-detected-cell').first().click()
  await page.locator('.color-btn:not(.is-current)').first().click()
  await expect(
    page.locator('.spatial-color-editor .review-detected-cell').first(),
  ).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.locator('.spatial-color-editor')).toHaveCount(0)
  await expect(face).toBeFocused()
  await expect(page.locator('.face-recovery')).toBeVisible()
  expect(await netColors(page)).toEqual(initial)
})

test('color corrections stay in the draft and outer Cancel discards them', async ({
  page,
}) => {
  await openRecovery(page)
  const initial = await netColors(page)
  await page
    .getByRole('button', { name: 'Inspect F face', exact: true })
    .focus()
  await page
    .getByRole('button', { name: 'Correct detected colors', exact: true })
    .click()
  await page.locator('.review-detected-cell').first().click()
  await page.locator('.color-btn:not(.is-current)').first().click()
  await page.getByRole('button', { name: 'OK', exact: true }).click()
  expect(await netColors(page)).not.toEqual(initial)
  await page
    .getByRole('button', { name: 'Cancel changes', exact: true })
    .click()
  await page
    .getByRole('button', {
      name: /^Alternatives \([1-9][0-9]*\)$/,
    })
    .click()
  expect(await netColors(page)).toEqual(initial)
})

test('canonical relative options preserve absolute chosen turns through roundtrip', async ({
  page,
}) => {
  await upload(page)
  await page
    .getByRole('button', { name: 'Yes, this is my cube', exact: true })
    .click()
  const baseline = await saved(page)
  await openRecovery(page)
  await page.locator('.spatial-candidate').first().click()
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await currentMatchesNet(page)
  await page.locator('.spatial-candidate').nth(1).click()
  await currentMatchesNet(page)
  const chosen = await netColors(page)
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await page.getByRole('button', { name: 'Use this cube', exact: true }).click()
  const final = await saved(page)
  expect(
    final.meta.capture.faceRecovery.mapping.find(
      (entry: { slot: string }) => entry.slot === 'U',
    ).quarterTurns,
  ).toBe(
    (baseline.meta.capture.faceRecovery.mapping.find(
      (entry: { slot: string }) => entry.slot === 'U',
    ).quarterTurns +
      2) %
      4,
  )
  expect(final.meta.capture.faceRecovery.view).toBe('canonical')
  expect(final.meta.capture.faceRecovery.captureFrame.confirmed).toBe(false)
  await upload(page, {
    name: 'chosen.zip',
    mimeType: 'application/zip',
    buffer: final.bytes,
  })
  expect(
    await page
      .locator('.approval-detected .orientation-net-sticker')
      .evaluateAll((elements) =>
        elements.map((element) => (element as HTMLElement).style.background),
      ),
  ).toEqual(chosen)
  await page
    .getByRole('button', { name: 'Yes, this is my cube', exact: true })
    .click()
  expect((await saved(page)).meta.capture.faceRecovery).toEqual(
    final.meta.capture.faceRecovery,
  )
})

test.describe('touch recovery', () => {
  test.use({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 },
  })
  test('tap opens source photo and current-first choices stay synchronized across Back', async ({
    page,
  }) => {
    await openRecovery(page)
    await currentMatchesNet(page, false)
    await page
      .getByRole('button', { name: 'Inspect F face', exact: true })
      .tap()
    await expect(
      page
        .getByRole('complementary', { name: 'Original photo for F face' })
        .getByRole('img'),
    ).toBeVisible()
    await page
      .getByRole('button', { name: 'Close original photo', exact: true })
      .tap()
    await page.locator('.spatial-candidate').nth(1).tap()
    await currentMatchesNet(page)
    await page.getByRole('button', { name: 'Next', exact: true }).tap()
    await page.getByRole('button', { name: 'Back', exact: true }).tap()
    await currentMatchesNet(page)
    await allFacesVisible(page)
  })
})

for (const size of [7, 5])
  test(`R2: a kept ${size}x${size} color draft cannot change committed approval`, async ({
    page,
  }) => {
    await upload(
      page,
      resolve(`test/fixtures/orientation-recovery-${size}x${size}.zip`),
    )
    const approvalColors = () =>
      page
        .locator('.orientation-approval .orientation-net-sticker')
        .evaluateAll((elements) =>
          elements.map((element) => (element as HTMLElement).style.background),
        )
    const initial = await approvalColors()
    const alternatives = page.getByRole('button', {
      name: /^Alternatives \([1-9][0-9]*\)$/,
    })
    const initialCount = await alternatives.textContent()
    const yes = page.getByRole('button', {
      name: 'Yes, this is my cube',
      exact: true,
    })
    await expect(yes).toBeEnabled()
    await alternatives.click()
    await page
      .getByRole('button', { name: 'Inspect F face', exact: true })
      .focus()
    await page
      .getByRole('button', { name: 'Correct detected colors', exact: true })
      .click()
    await page.locator('.review-detected-cell').first().click()
    await page.locator('.color-btn:not(.is-current)').first().click()
    await page.getByRole('button', { name: 'OK', exact: true }).click()
    await page
      .getByRole('button', {
        name: 'Close and keep orientation draft',
        exact: true,
      })
      .click()
    await page.getByRole('button', { name: 'Edit colors', exact: true }).click()
    await expect(
      page.getByRole('heading', { name: 'Does this match your cube?' }),
    ).toBeVisible()
    await expect(page.locator('.face-recovery')).toHaveCount(0)
    expect(await approvalColors()).toEqual(initial)
    await expect(yes).toBeEnabled()
    await expect(alternatives).toHaveText(initialCount!)
    await yes.click()
    await expect(page.locator('.face-recovery')).toHaveCount(0)
    const confirmed = await saved(page)
    const zip = unzipSync(
      readFileSync(
        resolve(`test/fixtures/orientation-recovery-${size}x${size}.zip`),
      ),
    )
    const key = Object.keys(zip).find((key) => key.endsWith('meta.json'))!
    const original = JSON.parse(strFromU8(zip[key]))
    expect(confirmed.meta.colorsURFDLB).toBe(original.colorsURFDLB)
    if (size === 5)
      expect(confirmed.meta.capture.faceRecovery.mapping).toEqual(
        original.capture.faceRecovery.mapping,
      )
  })

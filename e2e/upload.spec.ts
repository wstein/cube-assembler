import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test, type Page } from '@playwright/test'

const fixture = resolve('test/fixtures/cube-3x3-2026-09-27T09-00-11')
const faceKeys = ['u', 'r', 'f', 'd', 'l', 'b'] as const
const faceLabels = ['Side 1', 'Side 2', 'Side 3', 'Side 4', 'Top', 'Bottom']
const photos = faceKeys.map((face) => resolve(fixture, `face-${face}.jpg`))
const metadata = JSON.parse(
  readFileSync(resolve(fixture, 'meta.json'), 'utf8'),
) as { colorsURFDLB: string }
const colorNames: Record<string, string> = {
  W: 'White',
  O: 'Orange',
  G: 'Green',
  R: 'Red',
  B: 'Blue',
  Y: 'Yellow',
}

// The sticker color review: "No, check the colors" in the cube check, which
// opens by itself after a valid capture or from Edit colors.
async function openColorReview(page: Page) {
  await expect(page.getByText('All 6 captured', { exact: true })).toBeVisible()
  const review = page.locator('.review-modal-content')
  const toColors = page.getByRole('button', {
    name: /No, check the colors|Back to the colors/,
  })
  await expect
    .poll(async () => {
      if (await review.isVisible()) return true
      if (await toColors.isVisible()) {
        await toColors.click()
        return await review.isVisible()
      }
      const edit = page.getByRole('button', { name: 'Edit colors' })
      // A dialog may open under the click; the next round handles it.
      if (await edit.isVisible())
        await edit.click({ timeout: 1000 }).catch(() => {})
      return false
    })
    .toBe(true)
  return review
}

async function reviewFaces(page: Page): Promise<string[]> {
  const review = await openColorReview(page)
  const grids: string[] = []
  for (const label of faceLabels) {
    await review
      .getByRole('group', { name: 'Faces' })
      .getByRole('button', {
        // Named by net face with the capture slot in parentheses.
        name: new RegExp(`^${label}$|\\(${label}\\)$`),
      })
      .click()
    await expect(review.locator('.review-face-image')).toBeVisible()
    const cells = review.locator('.review-detected-cell')
    await expect(cells).toHaveCount(9)
    const titles = await cells.evaluateAll((items) =>
      items.map((item) => item.getAttribute('title') ?? ''),
    )
    grids.push(
      titles
        .map((title) => {
          const color = Object.entries(colorNames).find(([, name]) =>
            title.includes(`: ${name}`),
          )?.[0]
          if (!color) throw new Error(`Missing color in ${title}`)
          return color
        })
        .join(''),
    )
  }
  return grids
}

test('uploads six cropped photos without metadata and shows six detected faces', async ({
  page,
}) => {
  await page.goto('/')
  await page
    .locator('.capture-alternatives input[type="file"]')
    .setInputFiles(photos)
  const preview = page.getByLabel('Photo upload order')
  await expect(preview).toBeVisible()
  await expect(preview.locator('.photo-upload-item')).toHaveCount(6)
  await preview.getByRole('button', { name: 'Read six photos' }).click()
  const grids = await reviewFaces(page)
  expect(grids).toEqual(metadata.colorsURFDLB.split(' '))
})

test('explains Auto framing with readable spacing', async ({ page }) => {
  await page.goto('/')
  await page
    .locator('.capture-alternatives input[type="file"]')
    .setInputFiles(photos)
  const hint = await page
    .getByLabel('Photo upload order')
    .locator('p')
    .first()
    .textContent()
  expect(hint).toMatch(/face crops directly and finds the face/)
})

test('uploads the same photos with meta.json and preserves all saved face colors', async ({
  page,
}) => {
  await page.goto('/')
  await page
    .locator('.capture-alternatives input[type="file"]')
    .setInputFiles([...photos, resolve(fixture, 'meta.json')])
  await expect(page.getByLabel('Photo upload order')).toHaveCount(0)
  const grids = await reviewFaces(page)
  expect(grids).toEqual(metadata.colorsURFDLB.split(' '))
})

test('goes straight to how the faces fit after uploading a fixture with meta.json', async ({
  page,
}) => {
  await page.goto('/')
  await page
    .locator('.capture-alternatives input[type="file"]')
    .setInputFiles([...photos, resolve(fixture, 'meta.json')])
  // Its colors and orientation were saved, so the only question is whether
  // the cube is the user's.
  await expect(
    page.getByRole('heading', { name: 'Does this match your cube?' }),
  ).toBeVisible()
  await expect(page.locator('.orientation-picker')).toHaveCount(0)
  await expect(page.locator('.review-modal-content')).toHaveCount(0)
})

test('edits one sticker in the review color picker', async ({ page }) => {
  await page.goto('/')
  await page
    .locator('.capture-alternatives input[type="file"]')
    .setInputFiles([...photos, resolve(fixture, 'meta.json')])
  const review = await openColorReview(page)
  const firstCell = review.locator('.review-detected-cell').first()
  await firstCell.click()
  const picker = page.locator('.color-picker-content')
  await expect(picker).toBeVisible()
  const alternative = picker.locator('.color-btn:not(.is-current)').first()
  const chosen = await alternative.locator('.color-btn-name').textContent()
  await alternative.click()
  await expect(picker).toHaveCount(0)
  await expect(firstCell).toHaveAttribute('title', new RegExp(`: ${chosen}`))
})

test('shows the fixture contents before downloading and closes with Escape', async ({
  page,
}) => {
  await page.goto('/')
  await page
    .locator('.capture-alternatives input[type="file"]')
    .setInputFiles([...photos, resolve(fixture, 'meta.json')])
  await page.getByRole('button', { name: 'Yes, this is my cube' }).click()
  await expect(
    page.getByRole('status').filter({ hasText: 'Valid cube' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Save as test fixture' }).click()
  const dialog = page.getByRole('dialog', { name: 'Save as test fixture' })
  await expect(
    dialog.getByRole('list', { name: 'Photos in the zip' }).locator('li'),
  ).toHaveCount(6)
  await expect(
    dialog.getByRole('button', { name: 'Download zip' }),
  ).toBeVisible()
  await dialog.press('Escape')
  await expect(dialog).toHaveCount(0)
})

test('opens sticker review from a face in the orientation approval', async ({
  page,
}) => {
  await page.goto('/')
  await page
    .locator('.capture-alternatives input[type="file"]')
    .setInputFiles([...photos, resolve(fixture, 'meta.json')])
  const review = await openColorReview(page)
  await review.locator('.review-detected-cell').first().click()
  await page
    .locator('.color-picker-content .color-btn:not(.is-current)')
    .first()
    .click()
  for (let side = 0; side < 5; side++)
    await review
      .getByRole('button', { name: 'Looks right — next side' })
      .click()
  await review
    .getByRole('button', { name: 'Looks right — put the cube together' })
    .click()

  const approval = page.locator('.orientation-approval')
  await expect(approval).toBeVisible()
  await approval
    .getByRole('button', { name: 'Check colors for U face' })
    .click()
  await expect(review).toBeVisible()
})

test('the cube check shows the detected net and swaps in a photo on hover', async ({
  page,
}) => {
  await page.goto('/')
  await page
    .locator('.capture-alternatives input[type="file"]')
    .setInputFiles([...photos, resolve(fixture, 'meta.json')])
  const dialog = page.getByRole('dialog', {
    name: 'Does this match your cube?',
  })
  await expect(dialog).toBeVisible()
  await expect(
    dialog.locator('.approval-detected .orientation-net'),
  ).toBeVisible()
  await expect(dialog.locator('.approval-photos')).toHaveCount(0)
  const face = dialog.getByRole('button', { name: 'Check colors for F face' })
  const photo = face.locator('.orientation-net-photo')
  await expect(photo).toHaveCount(1)
  await expect(photo).toHaveCSS('opacity', '0')
  await face.hover()
  await expect(photo).toHaveCSS('opacity', '1')
  await expect(dialog.locator('.approval-stats')).toContainText(
    /Left \d+% · Front \d+% · Right \d+% · Back \d+% · Up \d+% · Down \d+%/,
  )
})

test('a capture that cannot be put together shows an error, not silence', async ({
  page,
}) => {
  const repeated = resolve('test/fixtures/cube-5x5-2026-10-26T00-18-58')
  await page.goto('/')
  await page
    .getByRole('combobox', { name: 'Cube' })
    .selectOption('builtin-generic-5')
  await page
    .locator('.capture-alternatives input[type="file"]')
    .setInputFiles([
      ...faceKeys.map((face) => resolve(repeated, `face-${face}.jpg`)),
      resolve(repeated, 'meta.json'),
    ])
  const dialog = page.getByRole('dialog', { name: 'Error detected' })
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('.orientation-net-photo')).toHaveCount(6)
  await expect(dialog.locator('.approval-stats')).toContainText(
    'Side 4 and Top',
  )
  await expect(dialog).toContainText('shot twice')
})

test('the color review follows the cube net: Left, Front, Right, Back, Up, Down', async ({
  page,
}) => {
  const dir = resolve('test/fixtures/cube-5x5-2026-10-25T23-50-58')
  await page.goto('/')
  await page
    .getByRole('combobox', { name: 'Cube' })
    .selectOption('builtin-generic-5')
  await page
    .locator('.capture-alternatives input[type="file"]')
    .setInputFiles([
      ...faceKeys.map((face) => resolve(dir, `face-${face}.jpg`)),
      resolve(dir, 'meta.json'),
    ])
  await page.getByRole('button', { name: 'No, check the colors' }).click()
  const review = page.locator('.review-modal-content')
  const net = review.getByRole('group', { name: 'Faces' })
  await expect(net.locator('.orientation-net-face')).toHaveCount(6)
  await expect(net.locator('.progress-dot')).toHaveCount(0)
  // The picker is the net; the review starts at Left and walks L F R B U D.
  for (const [i, name] of [
    'Left',
    'Front',
    'Right',
    'Back',
    'Up',
    'Down',
  ].entries()) {
    await expect(review.getByRole('heading', { name })).toBeVisible()
    await expect(review).toContainText(`${i + 1} of 6`)
    await expect(net.locator('[aria-current="step"]')).toHaveCount(1)
    if (i < 5) await review.getByRole('button', { name: /next side/ }).click()
  }
  // The net picks a face directly.
  await net.getByRole('button', { name: /^Front/ }).click()
  await expect(review.getByRole('heading', { name: 'Front' })).toBeVisible()
})

test('the capture card shows the captured faces as a net with hover photos', async ({
  page,
}) => {
  await page.goto('/')
  const net = page.locator('.capture-card').getByRole('group', {
    name: 'Captured faces',
  })
  await expect(net.locator('.orientation-net-face')).toHaveCount(6)
  await expect(net.locator('.orientation-net-photo')).toHaveCount(0)
  await page
    .locator('.capture-alternatives input[type="file"]')
    .setInputFiles([...photos, resolve(fixture, 'meta.json')])
  await page.getByRole('button', { name: 'Yes, this is my cube' }).click()
  await expect(net.getByRole('button', { name: /^Left \(/ })).toBeVisible()
  const photo = net
    .getByRole('button', { name: /^Front \(/ })
    .locator('.orientation-net-photo')
  await expect(photo).toHaveCSS('opacity', '0')
  await net.getByRole('button', { name: /^Front \(/ }).hover()
  await expect(photo).toHaveCSS('opacity', '1')
})

test('palettes live on the profiles page: no color text on the first screen', async ({
  page,
}) => {
  await page.goto('/')
  await page
    .locator('.capture-alternatives input[type="file"]')
    .setInputFiles([...photos, resolve(fixture, 'meta.json')])
  await page.getByRole('button', { name: 'Yes, this is my cube' }).click()
  const card = page.locator('.capture-card')
  await expect(card).toContainText('Cube:')
  await expect(card).not.toContainText('Colors:')
  await expect(card).not.toContainText('Compare backdrop')
  await expect(
    page.getByRole('button', { name: /Create sticker color profile/ }),
  ).toHaveCount(0)

  await page.goto('/#profiles')
  await expect(
    page.getByRole('button', { name: /Create sticker color profile/ }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Analyze colors' }).click()
  const dialog = page.getByRole('dialog', { name: 'Color analysis' })
  await expect(dialog.locator('.hue-scatter')).toBeVisible()
  await dialog.getByRole('button', { name: 'Final colors' }).click()
  await expect(dialog.locator('.color-analysis-table tbody tr')).toHaveCount(6)
  await expect(dialog.locator('.color-analysis-table thead')).toContainText(
    /Standard.*Read with.*Final.*Delta/,
  )
  await expect(dialog.locator('.color-analysis-table')).not.toContainText(
    'Learned',
  )
  await dialog.getByRole('button', { name: 'Backdrop' }).click()
  await dialog.press('Escape')
  await expect(dialog).toHaveCount(0)
})

test('the hue scatter names a dot on hover and links it with the net', async ({
  page,
}) => {
  const dir = resolve('test/fixtures/cube-5x5-2026-10-26T00-04-11')
  await page.goto('/')
  await page
    .locator('.capture-alternatives input[type="file"]')
    .setInputFiles([
      ...faceKeys.map((face) => resolve(dir, `face-${face}.jpg`)),
      resolve(dir, 'meta.json'),
    ])
  await page.getByRole('button', { name: 'Yes, this is my cube' }).click()
  await page.goto('/#profiles')
  await page.getByRole('button', { name: 'Analyze colors' }).click()
  const dialog = page.getByRole('dialog', { name: 'Color analysis' })
  const info = dialog.locator('.hue-scatter-info')
  // Both panels are cut at 330 degrees, so each edge is the 330 tick: every
  // 30 degrees on the main panel, every 90 on the small gray one . Lightness ticks every 0.1, a thin grid for each, and a
  // color bar along each axis.
  const hueTicks = Array.from(
    { length: 13 },
    (_, i) => `${(i * 30 + 330) % 360}°`,
  )
  await expect(dialog.locator('.hue-scatter-hue-tick')).toHaveText([
    ...hueTicks,
    '330°',
    '60°',
    '150°',
    '240°',
    '330°',
  ])
  await expect(dialog.locator('rect.hue-scatter-hue-bar')).toHaveCount(2)
  await expect(dialog.locator('rect.hue-scatter-l-bar')).toHaveCount(1)
  await expect(dialog.locator('.hue-scatter-l-tick')).toHaveText([
    '1',
    '0.9',
    '0.8',
    '0.7',
    '0.6',
    '0.5',
    '0.4',
    '0.3',
  ])
  await expect(dialog.locator('line.hue-scatter-hue-grid')).toHaveCount(18)
  await expect(dialog.locator('line.hue-scatter-grid')).toHaveCount(16)
  await expect(info).toContainText('Point at a dot')
  // A valid cube has the same count of every color: no warning.
  await expect(dialog.locator('.hue-scatter-counts')).toHaveCount(0)
  // A lens magnifies the chart around the pointer, like a color picker.
  await expect(dialog.locator('.hue-scatter-lens')).toHaveCount(0)
  await dialog.locator('.hue-scatter').hover({ position: { x: 200, y: 60 } })
  await expect(dialog.locator('.hue-scatter-lens')).toHaveCount(1)
  // The wheel (or a pinch) sets the magnification, 5 times to start.
  const scale = async () =>
    Number(
      (
        await dialog
          .locator('.hue-scatter-lens g[clip-path] > g')
          .getAttribute('transform')
      )?.match(/scale\(([\d.]+)\)/)?.[1],
    )
  expect(await scale()).toBe(5)
  await page.mouse.wheel(0, -100)
  await expect.poll(scale).toBeGreaterThan(5)
  await page.mouse.wheel(0, 400)
  await expect.poll(scale).toBeLessThan(5)
  await dialog.locator('.hue-scatter-dot').first().hover({ force: true })
  await expect(info).toContainText(
    /row \d+, column \d+: \w+ \(L [\d.]+, C [\d.]+, h \d+°\)$/,
  )
  // A dot lights its sticker in the net, and a sticker its dot.
  await expect(dialog.locator('.orientation-net-sticker-hover')).toHaveCount(1)
  await dialog
    .locator('.analysis-net .orientation-net-sticker')
    .nth(30)
    .hover({ force: true })
  await expect(dialog.locator('.hue-scatter-hovered')).toHaveCount(1)
  await expect(info).toContainText(/row \d+, column \d+/)
  // The face's photo shows, ringed at the sticker.
  await expect(dialog.locator('.orientation-net-photo-mark')).toHaveCount(1)
  await expect(
    dialog.locator('.orientation-net-photo-shown .orientation-net-photo'),
  ).toHaveCSS('opacity', '1')
})

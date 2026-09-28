import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test, type Page } from '@playwright/test'

declare global {
  interface Window {
    setTestCameraFace(index: number): Promise<void>
  }
}

const fixture = resolve('test/fixtures/cube-3x3-2026-09-27T09-00-11')
const faceKeys = ['u', 'r', 'f', 'd', 'l', 'b']
const photos = faceKeys.map((face) =>
  readFileSync(resolve(fixture, `face-${face}.jpg`)).toString('base64'),
)

async function installStubCamera(page: Page) {
  await page.addInitScript(
    ({ frames }) => {
      const canvas = document.createElement('canvas')
      canvas.width = 960
      canvas.height = 720
      const context = canvas.getContext('2d')!
      const images = frames.map((base64) => {
        const image = new Image()
        image.src = `data:image/jpeg;base64,${base64}`
        return image
      })
      const setFace = async (index: number) => {
        const image = images[index]
        await image.decode()
        context.fillStyle = '#777777'
        context.fillRect(0, 0, canvas.width, canvas.height)
        context.drawImage(image, 264, 144, 432, 432)
      }
      const stream = canvas.captureStream(10)
      Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
        configurable: true,
        value: async () => {
          await setFace(0)
          return stream
        },
      })
      window.setTestCameraFace = setFace
    },
    { frames: photos },
  )
}

test('captures and re-detects a face from a live camera stream', async ({
  page,
}) => {
  test.setTimeout(120_000)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await installStubCamera(page)

  await page.goto('/')
  await page.getByRole('button', { name: 'Capture faces' }).click()
  const capture = page.locator('.capture-modal-content')
  await expect(capture.locator('video')).toHaveJSProperty('videoWidth', 960)
  await expect(capture.locator('.capture-live-badge')).toContainText('Live')
  await expect(capture.locator('.capture-live-badge')).toContainText(
    'color match',
  )
  await capture.getByRole('button', { name: 'Capture side 1' }).click()
  await expect(capture.locator('.capture-net [data-slot="U"]')).toHaveAttribute(
    'aria-label',
    /captured/,
  )
  const previewColors = () =>
    capture
      .locator('.capture-sample-zone')
      .evaluateAll((zones) =>
        zones.map((zone) => (zone as HTMLElement).style.borderColor).join(','),
      )
  const firstPreview = await previewColors()
  await page.evaluate(() => window.setTestCameraFace(1))
  await expect.poll(previewColors).not.toBe(firstPreview)
  await page.evaluate(() => window.setTestCameraFace(0))
  await expect(capture.locator('.capture-live-badge')).toContainText(
    'Looks like Side 1',
  )
  await capture.locator('.capture-net [data-slot="U"]').click()
  await expect(capture).toContainText('Step 1 of 6')
  await capture.getByRole('button', { name: 'Capture side 1' }).click()
  for (let index = 1; index < photos.length; index++) {
    await page.evaluate((face) => window.setTestCameraFace(face), index)
    await capture
      .getByRole('button', { name: /^Capture (side|top|bottom)/i })
      .click()
    await expect(page.locator('.capture-card')).toContainText(
      index === 5 ? 'All 6 captured' : `${index + 1} of 6 captured`,
    )
  }
  await expect(page.getByText('All 6 captured', { exact: true })).toBeVisible()
  const review = page.locator('.review-modal-content')
  if (!(await review.isVisible())) {
    const backToColors = page.getByRole('button', {
      name: 'Back to the colors',
    })
    if (await backToColors.isVisible()) await backToColors.click()
    else {
      const dialog = page.getByRole('dialog')
      if (await dialog.isVisible())
        await dialog.getByRole('button', { name: 'Close' }).click()
      await page.getByRole('button', { name: 'Edit colors' }).click()
    }
  }
  await expect(review.locator('.review-face-image')).toBeVisible()
  const savedPhoto = await review
    .locator('.review-face-image')
    .evaluate((image) => {
      const photo = image as HTMLImageElement
      return {
        width: photo.naturalWidth,
        height: photo.naturalHeight,
        src: photo.src,
      }
    })
  expect(savedPhoto.src).toMatch(/^data:image\/jpeg;base64,/)
  expect(savedPhoto.width).toBeGreaterThan(200)
  expect(savedPhoto.width).toBeLessThan(960)
  expect(savedPhoto.height).toBeLessThan(720)
})

test('auto capture advances after five stable live frames', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await installStubCamera(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Capture faces' }).click()
  const capture = page.locator('.capture-modal-content')
  await expect(capture.locator('video')).toHaveJSProperty('videoWidth', 960)
  await capture.getByRole('checkbox', { name: /Auto capture/ }).check()
  await expect(capture.locator('.capture-net [data-slot="U"]')).toHaveAttribute(
    'aria-label',
    /captured/,
  )
})

test('reads a photo file for the current capture step', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await page.getByRole('button', { name: 'Capture faces' }).click()
  const capture = page.locator('.capture-modal-content')
  await capture.getByRole('button', { name: 'Guide grid' }).click()
  await capture
    .locator('.capture-import input[type="file"]')
    .setInputFiles(resolve(fixture, 'face-u.jpg'))
  await expect(capture.locator('.capture-net [data-slot="U"]')).toHaveAttribute(
    'aria-label',
    /captured/,
  )
})

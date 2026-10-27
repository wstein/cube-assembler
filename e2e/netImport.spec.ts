import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { netPng } from './netPicture'

// One picture of a cube net, pasted, dropped or uploaded, is cut into six face
// pictures and read like six photos; pasted or dropped fixture files load like
// the Upload files button's.

const fixture = resolve('test/fixtures/cube-3x3-2026-09-27T09-00-11')
const meta = JSON.parse(
  readFileSync(resolve(fixture, 'meta.json'), 'utf8'),
) as {
  capture: { assembledURFDLB: string }
}
const NET = meta.capture.assembledURFDLB
const faceKeys = ['u', 'r', 'f', 'd', 'l', 'b']

interface Sent {
  name: string
  type: string
  base64: string
}

const sent = (name: string, type: string, data: Buffer): Sent => ({
  name,
  type,
  base64: data.toString('base64'),
})

// Fires a paste or a drop carrying files, as the browser does.
async function send(page: Page, kind: 'paste' | 'drop', files: Sent[]) {
  await page.evaluate(
    ({ kind, files }) => {
      const transfer = new DataTransfer()
      for (const file of files) {
        const bytes = Uint8Array.from(atob(file.base64), (c) => c.charCodeAt(0))
        transfer.items.add(new File([bytes], file.name, { type: file.type }))
      }
      const target = document.body
      if (kind === 'paste')
        target.dispatchEvent(
          new ClipboardEvent('paste', {
            clipboardData: transfer,
            bubbles: true,
            cancelable: true,
          }),
        )
      else {
        target.dispatchEvent(
          new DragEvent('dragover', {
            dataTransfer: transfer,
            bubbles: true,
            cancelable: true,
          }),
        )
        target.dispatchEvent(
          new DragEvent('drop', {
            dataTransfer: transfer,
            bubbles: true,
            cancelable: true,
          }),
        )
      }
    },
    { kind, files },
  )
}

async function readSixAndCheck(page: Page) {
  const preview = page.getByLabel('Photo upload order')
  await expect(preview.locator('.photo-upload-item')).toHaveCount(6)
  await preview.getByRole('button', { name: 'Read six photos' }).click()
  await page.getByRole('button', { name: 'Yes, this is my cube' }).click()
  await expect(
    page.getByRole('status').filter({ hasText: 'Valid cube' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Colors (WRG)' }).click()
  await expect(page.getByRole('textbox', { name: 'Notation' })).toHaveValue(NET)
}

test('uploads one net picture and reads the cube it shows', async ({
  page,
}) => {
  await page.goto('/')
  await page.locator('.capture-alternatives input[type="file"]').setInputFiles({
    name: 'net.png',
    mimeType: 'image/png',
    buffer: netPng(NET),
  })
  await readSixAndCheck(page)
})

test('pastes a net picture', async ({ page }) => {
  await page.goto('/')
  await send(page, 'paste', [sent('image.png', 'image/png', netPng(NET))])
  await readSixAndCheck(page)
})

test('drops a net picture', async ({ page }) => {
  await page.goto('/')
  await send(page, 'drop', [sent('net.png', 'image/png', netPng(NET))])
  await readSixAndCheck(page)
})

test('pastes a fixture: its six photos with meta.json', async ({ page }) => {
  await page.goto('/')
  const files = [
    ...faceKeys.map((face) =>
      sent(
        `face-${face}.jpg`,
        'image/jpeg',
        readFileSync(resolve(fixture, `face-${face}.jpg`)),
      ),
    ),
    sent(
      'meta.json',
      'application/json',
      readFileSync(resolve(fixture, 'meta.json')),
    ),
  ]
  await send(page, 'paste', files)
  await page.getByRole('button', { name: 'Yes, this is my cube' }).click()
  await expect(
    page.getByRole('status').filter({ hasText: 'Valid cube' }),
  ).toBeVisible()
})

test('says so when a picture is no net', async ({ page }) => {
  await page.goto('/')
  await send(page, 'paste', [
    sent(
      'face-u.jpg',
      'image/jpeg',
      readFileSync(resolve(fixture, 'face-u.jpg')),
    ),
  ])
  await expect(page.getByText(/no cube net|Found \d+ stickers/i)).toBeVisible()
})

test('pasted facelets open the typed input', async ({ page }) => {
  await page.goto('/')
  const facelets = ['U', 'R', 'F', 'D', 'L', 'B']
    .map((face) => face.repeat(9))
    .join(' ')
  await page.evaluate((text) => {
    const transfer = new DataTransfer()
    transfer.setData('text/plain', text)
    document.body.dispatchEvent(
      new ClipboardEvent('paste', {
        clipboardData: transfer,
        bubbles: true,
        cancelable: true,
      }),
    )
  }, facelets)
  await expect(page.getByRole('textbox', { name: /facelets/i })).toHaveValue(
    facelets,
  )
})

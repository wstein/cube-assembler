import { resolve } from 'node:path'
import { expect, test } from '@playwright/test'

test.use({ hasTouch: true })

for (const width of [1280, 390]) {
  test(`net original photo fills one square face at ${width}px without covering faces`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/')
    await page
      .locator('.capture-alternatives input[type="file"]')
      .setInputFiles(resolve('test/fixtures/orientation-recovery-7x7.zip'))
    await page
      .getByRole('button', { name: 'Yes, this is my cube', exact: true })
      .click()
    const poseConfirmation = page.getByLabel(
      'I confirm this front and top match how I held the cube.',
    )
    if (await poseConfirmation.isVisible()) {
      await poseConfirmation.check()
      await page
        .getByRole('button', { name: 'Confirm face mapping', exact: true })
        .click()
    }
    const net = page.locator('.cube-net').first()
    await net.locator('.net-b .net-cell').nth(24).hover()
    const photo = net.locator('.net-info-photo')
    await expect(photo).toBeVisible()
    await page.screenshot({
      path: test.info().outputPath('net-photo-inspector.png'),
    })
    await expect(photo).toHaveAttribute(
      'alt',
      /^Photo of the Back face \(source photo [URFDLB]\)$/,
    )
    await expect(net.locator('.net-info-title')).toHaveText(
      'Back · Photo',
    )
    await expect(net.locator('.net-info-title')).toHaveCSS(
      'background-color',
      'rgb(51, 51, 51)',
    )
    await expect(net.locator('.net-info-title')).toHaveCSS(
      'color',
      'rgb(255, 255, 255)',
    )
    await expect(photo).toHaveCSS('object-fit', 'contain')
    await expect(net.locator('.net-info')).not.toContainText('center piece', {
      timeout: 1000,
    })
    const bounds = await photo.boundingBox()
    const referenceFace = await net
      .locator('.net-u .net-face-grid')
      .boundingBox()
    expect(bounds).not.toBeNull()
    expect(referenceFace).not.toBeNull()
    expect(Math.abs(bounds!.width - referenceFace!.width)).toBeLessThanOrEqual(
      1,
    )
    expect(Math.abs(bounds!.height - referenceFace!.width)).toBeLessThanOrEqual(
      1,
    )
    if (
      !(await net
        .locator('.net-info')
        .evaluate((element) => element.classList.contains('net-info-below')))
    ) {
      expect(Math.abs(bounds!.y - referenceFace!.y)).toBeLessThanOrEqual(1)
    }
    for (const face of await net.locator('.net-face-grid').all()) {
      const box = (await face.boundingBox())!
      const x = box.x + box.width / 2
      const y = box.y + box.height / 2
      expect(
        x < bounds!.x ||
          x > bounds!.x + bounds!.width ||
          y < bounds!.y ||
          y > bounds!.y + bounds!.height,
      ).toBe(true)
    }
    for (const [face, name] of [
      ['u', 'Top'],
      ['r', 'Right'],
      ['f', 'Front'],
      ['d', 'Bottom'],
      ['l', 'Left'],
      ['b', 'Back'],
    ]) {
      await net.locator(`.net-${face} .net-face-grid`).focus()
      await expect(net.locator('.net-info-title')).toHaveText(
        `${name} · Photo`,
      )
      const image = (await photo.boundingBox())!
      const header = (await net.locator('.net-info-title').boundingBox())!
      expect(Math.abs(image.width - referenceFace!.width)).toBeLessThanOrEqual(
        1,
      )
      expect(
        Math.abs(image.height - referenceFace!.height),
      ).toBeLessThanOrEqual(1)
      for (const otherFace of await net.locator('.net-face-grid').all()) {
        const other = (await otherFace.boundingBox())!
        for (const box of [image, header]) {
          const overlapWidth =
            Math.min(box.x + box.width, other.x + other.width) -
            Math.max(box.x, other.x)
          const overlapHeight =
            Math.min(box.y + box.height, other.y + other.height) -
            Math.max(box.y, other.y)
          expect(overlapWidth <= 1 || overlapHeight <= 1).toBe(true)
        }
      }
      const scrollbars = await net.locator('.net-info').evaluate((element) => ({
        horizontal: element.scrollWidth - element.clientWidth,
        vertical: element.scrollHeight - element.clientHeight,
      }))
      expect(scrollbars.horizontal).toBeLessThanOrEqual(1)
      expect(scrollbars.vertical).toBeLessThanOrEqual(1)
    }
    await net.locator('.net-f .net-face-grid').tap()
    await expect(net.locator('.net-info-title')).toHaveText(
      'Front · Photo',
    )
  })
}

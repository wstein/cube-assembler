import { resolve } from 'node:path'
import { expect, test } from '@playwright/test'

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
    await expect(photo).toHaveAttribute('alt', 'Photo of the Back face')
    await expect(net.locator('.net-info')).not.toContainText('center piece', {
      timeout: 1000,
    })
    const bounds = await photo.boundingBox()
    const face = await net.locator('.net-u .net-face-grid').boundingBox()
    expect(bounds).not.toBeNull()
    expect(face).not.toBeNull()
    expect(Math.abs(bounds!.width - face!.width)).toBeLessThanOrEqual(1)
    expect(Math.abs(bounds!.height - face!.width)).toBeLessThanOrEqual(1)
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
  })
}

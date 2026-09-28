import { expect, test } from '@playwright/test'

test('Shift selects a wide turn immediately', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Solved cube' }).click()
  await page.getByRole('button', { name: '3D View' }).click()
  const bounds = await page.locator('.cube-3d-canvas').boundingBox()
  if (!bounds) throw new Error('No canvas')
  await page.mouse.move(
    bounds.x + bounds.width / 2 - 38,
    bounds.y + bounds.height / 2,
  )
  await page.keyboard.down('Shift')
  await page.mouse.down()
  await expect(page.locator('.cube-3d-press-mode')).toHaveText(/Wide turn/)
  await page.mouse.up()
  await page.keyboard.up('Shift')
})

test('Reset all settings restores the defaults', async ({ page }) => {
  await page.goto('/#settings')
  const sound = page.getByRole('switch', { name: 'Turn sound' })
  await sound.check()
  await page.getByRole('button', { name: 'Reset all settings' }).click()
  await expect(sound).not.toBeChecked()
  expect(await page.evaluate(() => document.cookie)).not.toContain(
    'cube-assembler-turn-sound',
  )
})

test('3D help can be turned off and remembered', async ({ page }) => {
  await page.goto('/#settings')
  const help = page.getByRole('switch', { name: 'Show 3D help' })
  await expect(help).toBeChecked()
  await help.uncheck()
  await expect
    .poll(() => page.evaluate(() => document.cookie))
    .toContain('cube-assembler-view-help=0')
  await page.getByRole('button', { name: '← Back to the scanner' }).click()
  await page.getByRole('button', { name: '3D View' }).click()
  await expect(page.locator('.cube-3d-hint')).toHaveCount(0)
  await page.reload()
  await expect(page.locator('.cube-3d-hint')).toHaveCount(0)
  await page.goto('/#settings')
  await expect(help).not.toBeChecked()
  await page.getByRole('button', { name: 'Reset all settings' }).click()
  await expect(help).toBeChecked()
})

test('capture switches on the settings page reach the scanner', async ({
  page,
}) => {
  await page.goto('/#settings')
  const auto = page.getByRole('switch', { name: /Auto capture/ })
  await expect(auto).not.toBeChecked()
  await auto.check()
  await page.getByRole('switch', { name: /Mirror the camera preview/ }).check()
  await expect
    .poll(() => page.evaluate(() => document.cookie))
    .toContain('cube-assembler-auto-capture=1')
  await page.getByRole('button', { name: '← Back to the scanner' }).click()
  await page.getByRole('button', { name: 'Capture faces' }).click()
  await expect(
    page.getByRole('checkbox', { name: /Auto capture/ }),
  ).toBeChecked()
})

test('the notation format is remembered, and the settings page sets it', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Faces (URF)' }).click()
  await expect
    .poll(() => page.evaluate(() => document.cookie))
    .toContain('cube-assembler-notation=urf')
  await page.reload()
  await expect(
    page.getByRole('button', { name: 'Faces (URF)' }),
  ).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('link', { name: 'Settings' }).click()
  const format = page.getByRole('combobox', { name: 'Write the cube as' })
  await expect(format).toHaveValue('urf')
  await format.selectOption('wrg')
  await page.getByRole('button', { name: '← Back to the scanner' }).click()
  await expect(
    page.getByRole('button', { name: 'Colors (WRG)' }),
  ).toHaveAttribute('aria-pressed', 'true')
})

test('the fixture server address only accepts this computer', async ({
  page,
}) => {
  await page.goto('/#settings')
  const address = page.getByRole('textbox', { name: /Fixture server address/ })
  await expect(address).toHaveValue('http://127.0.0.1:7100')
  await address.fill('https://example.com')
  await address.press('Enter')
  await expect(page.getByRole('alert')).toHaveText(/Use this computer/)
  await address.fill('http://localhost:7200/')
  await address.press('Enter')
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(address).toHaveValue('http://localhost:7200')
  await expect
    .poll(() => page.evaluate(() => document.cookie))
    .toContain(
      'cube-assembler-fixture-server-url=http%3A%2F%2Flocalhost%3A7200',
    )
})

test('the theme can override the system color scheme', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/#settings')
  const html = page.locator('html')
  const background = () =>
    page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  const dark = await background()
  const theme = page.getByRole('combobox', { name: 'Theme' })
  await expect(theme).toHaveValue('system')
  await theme.selectOption('light')
  await expect(html).toHaveAttribute('data-theme', 'light')
  expect(await background()).not.toBe(dark)
  await page.reload()
  await expect(html).toHaveAttribute('data-theme', 'light')
  await page.getByRole('button', { name: 'Reset all settings' }).click()
  await expect(html).not.toHaveAttribute('data-theme', /./)
  expect(await background()).toBe(dark)
})

test('a wide turn vibrates for the set length, 50 ms by default', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const calls: unknown[] = []
    ;(window as unknown as { vibrations: unknown[] }).vibrations = calls
    navigator.vibrate = ((pattern: VibratePattern) => {
      calls.push(pattern)
      return true
    }) as typeof navigator.vibrate
  })
  const wide = async () => {
    await page.getByRole('button', { name: 'Solved cube' }).click()
    await page.getByRole('button', { name: '3D View' }).click()
    const bounds = await page.locator('.cube-3d-canvas').boundingBox()
    if (!bounds) throw new Error('No canvas')
    await page.mouse.move(
      bounds.x + bounds.width / 2 - 38,
      bounds.y + bounds.height / 2,
    )
    await page.keyboard.down('Shift')
    await page.mouse.down()
    await expect(page.locator('.cube-3d-press-mode')).toHaveText(/Wide turn/)
    await page.mouse.up()
    await page.keyboard.up('Shift')
    return page.evaluate(
      () => (window as unknown as { vibrations: unknown[] }).vibrations,
    )
  }
  await page.goto('/#settings')
  const length = page.getByRole('slider', { name: /Vibration length/ })
  await expect(length).toHaveValue('50')
  await page.getByRole('button', { name: '← Back to the scanner' }).click()
  expect(await wide()).toEqual([50])

  await page.goto('/#settings')
  await length.fill('120')
  await expect
    .poll(() => page.evaluate(() => document.cookie))
    .toContain('cube-assembler-vibration-ms=120')
  await page.getByRole('button', { name: '← Back to the scanner' }).click()
  // The same page, so the first wide turn's call is still recorded.
  expect(await wide()).toEqual([50, 120])
})

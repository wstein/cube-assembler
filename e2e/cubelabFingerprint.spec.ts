import { expect, test } from '@playwright/test'

test('the CubeLab marker and moves block follow the Moves line', async ({
  page,
}) => {
  await page.goto('/')
  const marker = page.locator('meta[name="cubelab-fingerprint"]')
  await expect(marker).toHaveAttribute(
    'content',
    /^spec=1;app=cube-assembler@\d+\.\d+\.\d+\S*$/,
  )
  await page
    .getByRole('combobox', { name: 'Cube' })
    .selectOption({ label: '3×3' })
  await page.getByRole('button', { name: 'Solved cube' }).click()
  await page.getByRole('button', { name: '3D View' }).click()

  const history = page.getByRole('status', { name: 'Move history' })
  const block = async () =>
    JSON.parse(
      (await page.locator('script#cubelab-moves').textContent()) ?? 'null',
    )
  const shown = async () =>
    ((await history.textContent()) ?? '').replace(/^Moves:\s*/, '')

  expect(await block()).toEqual({
    size: 3,
    moves: '',
    format: 'layer-prefix/v1',
  })
  await expect(history).toHaveText('Moves: None')

  await page.getByRole('button', { name: 'Scramble', exact: true }).click()
  await expect(history).not.toHaveText('Moves: None')
  await page.getByRole('button', { name: 'Stop', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Scramble', exact: true }),
  ).toBeVisible()
  await expect.poll(async () => (await block()).moves).toBe(await shown())
  expect((await block()).moves).not.toBe('')
  expect((await block()).size).toBe(3)

  const undo = page.getByRole('button', { name: 'Undo', exact: true })
  await expect(undo).toBeEnabled()
  await undo.click()
  await expect.poll(async () => (await block()).moves).toBe(await shown())

  await page.getByRole('button', { name: 'Reset', exact: true }).click()
  await expect(history).toHaveText('Moves: None')
  expect((await block()).moves).toBe('')
})

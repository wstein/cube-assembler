import { resolve } from 'node:path'
import { expect, test } from '@playwright/test'

const archive = resolve('test/fixtures/orientation-recovery-7x7.zip')

test('correct 7x7 photos can be adjusted after rejecting a valid suggestion', async ({
  page,
}) => {
  await page.goto('/')
  await page
    .locator('.capture-alternatives input[type="file"]')
    .setInputFiles(archive)
  await expect(
    page.getByRole('heading', { name: 'Does this match your cube?' }),
  ).toBeVisible({ timeout: 30000 })
  await page
    .getByRole('button', {
      name: 'Adjust face orientations / assignments',
      exact: true,
    })
    .click()
  await expect(
    page.getByRole('heading', {
      name: 'Adjust face orientations / assignments',
    }),
  ).toBeVisible()
  await page
    .getByText('Advanced manual orientation / assignment recovery', {
      exact: true,
    })
    .click()
  await expect(
    page.getByRole('button', {
      name: /Rotate Side 1 \(B face\) clockwise 90°/,
    }),
  ).toBeVisible()
  await expect(page.locator('.webcam-modal-content')).toHaveCount(0)
})

import { readFileSync } from 'node:fs'
import { unzipSync, strFromU8 } from 'fflate'
import { encode as encodeJpeg } from 'jpeg-js'
import type { Page } from '@playwright/test'

async function openArchive(
  page: Page,
  input: string | Array<{ name: string; mimeType: string; buffer: Buffer }>,
) {
  await page.goto('/')
  await page
    .locator('.capture-alternatives input[type="file"]')
    .setInputFiles(input)
  await expect(
    page.getByRole('heading', {
      name: /Does this match your cube|Error detected/,
    }),
  ).toBeVisible({ timeout: 30000 })
  await page
    .getByRole('button', {
      name: 'Adjust face orientations / assignments',
      exact: true,
    })
    .click()
  await page
    .getByText('Advanced manual orientation / assignment recovery', {
      exact: true,
    })
    .click()
}
async function saveFixture(page: Page) {
  await page
    .getByRole('button', { name: 'Save as test fixture', exact: true })
    .click()
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download zip', exact: true }).click()
  const download = await pending
  const path = await download.path()
  if (!path) throw new Error('Fixture download did not produce a file')
  const bytes = readFileSync(path)
  const zip = unzipSync(bytes)
  const meta = JSON.parse(
    strFromU8(zip[Object.keys(zip).find((k) => k.endsWith('/meta.json'))!]),
  )
  return { bytes, meta }
}

test('7x7 manual rotations, confirmed capture pose and original bytes survive export and reimport', async ({
  page,
}) => {
  await openArchive(page, archive)
  const choices = [1, 3, 1, 3, 2, 0]
  const cards = page.locator('.face-recovery-photo')
  for (let i = 0; i < 6; i++) {
    const value =
      Number(
        (await cards.nth(i).locator('span').last().textContent())!.match(
          /(\d+)°/,
        )![1],
      ) / 90
    const delta = (choices[i] - value + 4) % 4
    for (let j = 0; j < delta; j++)
      await cards
        .nth(i)
        .getByRole('button', { name: /clockwise 90°/ })
        .filter({ hasText: '+90°' })
        .click()
  }
  await page.getByLabel('Capture top photo', { exact: true }).selectOption('B')
  await page
    .getByLabel('I confirm this front and top match how I held the cube.')
    .check()
  await page
    .getByRole('button', { name: 'Close and keep orientation draft' })
    .click()
  await page
    .getByRole('button', {
      name: 'Adjust face orientations / assignments',
      exact: true,
    })
    .click()
  await expect(
    page.getByLabel('Capture top photo', { exact: true }),
  ).toHaveValue('B')
  await expect(
    page.getByLabel('I confirm this front and top match how I held the cube.'),
  ).toBeChecked()
  await expect(
    page.getByRole('button', { name: 'Confirm face mapping' }),
  ).toBeEnabled()
  await page.getByRole('button', { name: 'Confirm face mapping' }).click()
  await expect(
    page.getByRole('status').filter({ hasText: /Available checks passed/ }),
  ).toBeVisible()
  const saved = await saveFixture(page)
  expect(
    saved.meta.capture.faceRecovery.mapping.map(
      (p: { quarterTurns: number }) => p.quarterTurns,
    ),
  ).toEqual(choices)
  expect(saved.meta.capture.faceRecovery.captureFrame.mirrored).toBe(true)
  expect(saved.meta.capture.faceRecovery.captureFrame.frontSlot).toBe('U')
  expect(saved.meta.capture.faceRecovery.captureFrame.upSlot).toBe('B')
  const original = unzipSync(readFileSync(archive))
  const originalMeta = JSON.parse(
    strFromU8(
      original[Object.keys(original).find((k) => k.endsWith('/meta.json'))!],
    ),
  )
  expect(saved.meta.colorsURFDLB).toBe(originalMeta.colorsURFDLB)
  const savedZip = unzipSync(saved.bytes)
  for (const f of ['u', 'r', 'f', 'd', 'l', 'b']) {
    expect(
      savedZip[
        Object.keys(savedZip).find((k) => k.endsWith(`/face-${f}.jpg`))!
      ],
    ).toEqual(
      original[
        Object.keys(original).find((k) => k.endsWith(`/face-${f}.jpg`))!
      ],
    )
  }
  await openArchive(page, [
    { name: 'manual.zip', mimeType: 'application/zip', buffer: saved.bytes },
  ])
  for (let i = 0; i < 6; i++)
    await expect(
      page.locator('.face-recovery-photo').nth(i).locator('span').last(),
    ).toContainText(`${choices[i] * 90}°`)
  await expect(
    page.getByLabel('Capture top photo', { exact: true }),
  ).toHaveValue('B')
})

// Generated solid-color photographs are supplementary synthetic cases, never a
// substitute for the mandatory original patterned 7x7 archive above.
function solidFiles(n: number) {
  const keys = ['u', 'r', 'f', 'd', 'l', 'b']
  const rgb = [
    [242, 242, 232],
    [214, 44, 44],
    [23, 155, 87],
    [242, 210, 27],
    [241, 139, 35],
    [36, 89, 214],
  ]
  const letters = ['W', 'R', 'G', 'Y', 'O', 'B']
  const files = keys.map((face, i) => {
    const data = Buffer.alloc(128 * 128 * 4)
    for (let p = 0; p < 128 * 128; p++) {
      data[p * 4] = rgb[i][0]
      data[p * 4 + 1] = rgb[i][1]
      data[p * 4 + 2] = rgb[i][2]
      data[p * 4 + 3] = 255
    }
    return {
      name: `face-${face}.jpg`,
      mimeType: 'image/jpeg',
      buffer: encodeJpeg({ width: 128, height: 128, data }, 100).data,
    }
  })
  const meta = {
    gridSize: n,
    colorsURFDLB: letters.map((c) => c.repeat(n * n)).join(' '),
    faces: Object.fromEntries(keys.map((f) => [f, { photo: `face-${f}.jpg` }])),
    capture: { mirrored: false },
  }
  return [
    ...files,
    {
      name: 'meta.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(meta)),
    },
  ]
}
for (const n of [2, 4, 6, 8])
  test(`even ${n}x${n} assignments are editable and duplicate drafts can be corrected`, async ({
    page,
  }) => {
    await openArchive(page, solidFiles(n))
    const top = page.getByLabel('Assign Side 1 to face')
    const right = page.getByLabel('Assign Side 2 to face')
    await expect(top).toBeEnabled()
    const original = await top.inputValue()
    await top.selectOption(await right.inputValue())
    await expect(
      page.getByRole('button', { name: 'Confirm face mapping' }),
    ).toBeDisabled()
    await expect(
      page.locator('.face-recovery [role="alert"]').first(),
    ).toBeVisible()
    await top.selectOption(original)
    const reassigned = ['U', 'F', 'L', 'D', 'B', 'R']
    for (let i = 0; i < 6; i++)
      await page
        .locator('.face-recovery-photo')
        .nth(i)
        .locator('select')
        .selectOption(reassigned[i])
    await page.getByLabel('Orientation preview frame').selectOption('canonical')
    await page
      .getByRole('button', {
        name: 'Rotate Side 1 (U face) clockwise 90°',
        exact: true,
      })
      .click()
    await expect(
      page.getByRole('button', { name: 'Confirm face mapping' }),
    ).toBeEnabled()
    await page.getByRole('button', { name: 'Confirm face mapping' }).click()
    const saved = await saveFixture(page)
    expect(saved.meta.gridSize).toBe(n)
    expect(saved.meta.capture.faceRecovery.mapping[0].quarterTurns).toBe(1)
    expect(
      saved.meta.capture.faceRecovery.mapping.map(
        (p: { target: string }) => p.target,
      ),
    ).toEqual(reassigned)
    await openArchive(page, [
      {
        name: 'roundtrip.zip',
        mimeType: 'application/zip',
        buffer: saved.bytes,
      },
    ])
    await expect(
      page.locator('.face-recovery-photo').first().locator('span').last(),
    ).toContainText('90°')
    for (let i = 0; i < 6; i++)
      await expect(
        page.locator('.face-recovery-photo').nth(i).locator('select'),
      ).toHaveValue(reassigned[i])
  })
for (const n of [3, 5])
  test(`odd ${n}x${n} rotations are editable with fixed assignments`, async ({
    page,
  }) => {
    await openArchive(page, solidFiles(n))
    await expect(page.getByLabel('Assign Side 1 to face')).toBeDisabled()
    await page
      .getByRole('button', {
        name: 'Rotate Side 1 (U face) clockwise 90°',
        exact: true,
      })
      .click()
    await page.getByLabel('Orientation preview frame').selectOption('canonical')
    await page.getByRole('button', { name: 'Confirm face mapping' }).click()
    const saved = await saveFixture(page)
    expect(saved.meta.capture.faceRecovery.mapping[0].quarterTurns).toBe(1)
  })

test('local viewer turns warn before photo reconstruction and Cancel preserves public history', async ({
  page,
  context,
}) => {
  const { setLayerMoves, swipeFrontFace, waitForCubeIdle } = await import(
    './cubeView3DHelpers'
  )
  await setLayerMoves(context)
  await openArchive(page, solidFiles(3))
  await page
    .getByLabel('Capture front photo', { exact: true })
    .selectOption('R')
  await page.getByLabel('Capture top photo', { exact: true }).selectOption('U')
  await page
    .getByLabel('I confirm this front and top match how I held the cube.')
    .check()
  await page.getByRole('button', { name: 'Confirm face mapping' }).click()
  await page.getByRole('button', { name: '3D View', exact: true }).click()
  await waitForCubeIdle(page)
  await swipeFrontFace(page)
  await waitForCubeIdle(page)
  const payload = await page.locator('#cubelab-moves').textContent()
  expect(JSON.parse(payload!).moves).not.toBe('')
  await page
    .getByRole('button', {
      name: 'Adjust face orientations / assignments',
      exact: true,
    })
    .click()
  await expect(
    page.getByText(
      /Confirming orientation edits reconstructs the original captured/,
    ),
  ).toBeVisible()
  await page
    .getByRole('button', { name: 'Cancel changes', exact: true })
    .click()
  await expect
    .poll(() => page.locator('#cubelab-moves').textContent())
    .toBe(payload)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await waitForCubeIdle(page)
  await expect
    .poll(
      async () =>
        JSON.parse((await page.locator('#cubelab-moves').textContent())!).moves,
    )
    .toBe('')
  await page
    .getByRole('button', {
      name: 'Adjust face orientations / assignments',
      exact: true,
    })
    .click()
  await expect(
    page.getByText(
      /Confirming orientation edits reconstructs the original captured/,
    ),
  ).toHaveCount(0)
})

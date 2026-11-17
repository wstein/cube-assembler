import { createHash } from 'node:crypto'
import { unzipSync, strFromU8 } from 'fflate'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test } from '@playwright/test'

test('a rejected valid guided cube can explicitly search without retaking photos', async ({
  page,
}) => {
  await page.goto('/')
  await page.locator('.capture-alternatives input[type="file"]').setInputFiles({
    name: 'source-identities.zip',
    mimeType: 'application/zip',
    buffer: readFileSync(
      resolve('test/fixtures/photo-identity-4x4-2026-11-16T21-28-43.zip'),
    ),
  })
  await expect(
    page.getByRole('heading', { name: 'Does this match your cube?' }),
  ).toBeVisible()
  await page
    .getByRole('button', { name: 'Find a matching cube', exact: true })
    .click()
  await expect(
    page.getByRole('heading', { name: 'Match your cube', exact: true }),
  ).toBeVisible()
  await expect(page.locator('.capture-modal-content')).toHaveCount(0)
  await expect(
    page
      .getByRole('group', { name: 'Recognized cube net', exact: true })
      .getByRole('button'),
  ).toHaveCount(6)
})

const approvalColors = (page: import('@playwright/test').Page) =>
  page
    .locator('.approval-detected .orientation-net-sticker')
    .evaluateAll((elements) =>
      elements.map((element) => (element as HTMLElement).style.background),
    )

test('cancel restores the exact previous approval without committing the search', async ({
  page,
}) => {
  await page.goto('/')
  await page
    .locator('.capture-alternatives input[type="file"]')
    .setInputFiles(
      resolve('test/fixtures/photo-identity-4x4-2026-11-16T21-28-43.zip'),
    )
  await expect(
    page.getByRole('heading', { name: 'Does this match your cube?' }),
  ).toBeVisible()
  const before = await approvalColors(page)
  await page
    .getByRole('button', { name: 'Find a matching cube', exact: true })
    .click()
  await page.locator('.spatial-candidate').first().click()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Does this match your cube?' }),
  ).toBeVisible()
  expect(await approvalColors(page)).toEqual(before)
  await expect(
    page.getByRole('button', { name: 'Yes, this is my cube', exact: true }),
  ).toBeEnabled()
})

test('search choices update the net and only explicit Use commits their exact projection', async ({
  page,
}) => {
  await page.goto('/')
  await page
    .locator('.capture-alternatives input[type="file"]')
    .setInputFiles(
      resolve('test/fixtures/photo-identity-4x4-2026-11-16T21-28-43.zip'),
    )
  await page
    .getByRole('button', { name: 'Find a matching cube', exact: true })
    .click()
  for (
    let question = 0;
    question < 6 && (await page.locator('.spatial-candidate').count());
    question++
  ) {
    const choice = page.locator('.spatial-candidate').first()
    await expect(choice).toBeEnabled()
    await choice.click()
  }
  await expect(
    page.getByRole('button', { name: 'Use this cube', exact: true }),
  ).toBeVisible()
  const chosen = await page
    .getByRole('group', { name: 'Recognized cube net', exact: true })
    .locator('.orientation-net-sticker')
    .evaluateAll((elements) =>
      elements.map((element) => (element as HTMLElement).style.background),
    )
  const sources: Record<
    string,
    { slot: string; hash: string; turns: string | null }
  > = {}
  for (const face of ['Up', 'Right', 'Front', 'Down', 'Left', 'Back']) {
    await page
      .getByRole('button', { name: `Inspect ${face} face`, exact: true })
      .focus()
    const image = page.locator('.spatial-photo img')
    const src = await image.getAttribute('src')
    const alt = await image.getAttribute('alt')
    sources[face] = {
      slot: alt!.match(/Captured photo ([URFDLB])/)![1],
      hash: createHash('sha256')
        .update(Buffer.from(src!.split(',')[1], 'base64'))
        .digest('hex'),
      turns: await image.getAttribute('style'),
    }
  }
  expect(
    new Set(Object.values(sources).map((source) => source.hash)).size,
  ).toBe(6)
  await expect(page.locator('.orientation-approval')).toHaveCount(0)
  await page.getByRole('button', { name: 'Use this cube', exact: true }).click()
  await expect(page.locator('.face-recovery')).toHaveCount(0)
  expect(
    await page.locator('.cube-net .net-cell').evaluateAll((elements) =>
      elements.map((element) => {
        const background = (element as HTMLElement).style.background
        // The main net additionally marks reviewed-vs-detected differences
        // with a diagonal split; its first color is the displayed cube.
        return background.match(/rgb\([^)]+\)/)?.[0] ?? background
      }),
    ),
  ).toEqual(chosen)
  await page
    .getByRole('button', { name: 'Save as test fixture', exact: true })
    .click()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download zip', exact: true }).click()
  const path = await (await download).path()
  if (!path) throw new Error('Missing fixture export')
  const files = unzipSync(readFileSync(path))
  const meta = JSON.parse(
    strFromU8(
      files[Object.keys(files).find((name) => name.endsWith('meta.json'))!],
    ),
  )
  expect(meta.capture.faceRecovery.mapping).toHaveLength(6)
  const targets: Record<string, string> = {
    U: 'Up',
    R: 'Right',
    F: 'Front',
    D: 'Down',
    L: 'Left',
    B: 'Back',
  }
  for (const mapping of meta.capture.faceRecovery.mapping as {
    target: string
    slot: string
    quarterTurns: number
  }[]) {
    const source = sources[targets[mapping.target]]
    expect(mapping.slot).toBe(source.slot)
    expect(source.turns).toContain(`rotate(${mapping.quarterTurns * 90}deg)`)
    expect(
      meta.faces[mapping.slot.toLowerCase()].photoIdentity.sourceHash,
    ).toBe(source.hash)
  }
  const original = unzipSync(
    readFileSync(
      resolve('test/fixtures/photo-identity-4x4-2026-11-16T21-28-43.zip'),
    ),
  )
  for (const slot of ['u', 'r', 'f', 'd', 'l', 'b']) {
    const photo =
      files[
        Object.keys(files).find((name) => name.endsWith(`face-${slot}.jpg`))!
      ]
    expect(createHash('sha256').update(photo).digest('hex')).toBe(
      createHash('sha256').update(original[`face-${slot}.jpg`]).digest('hex'),
    )
  }
  await page.goto('/')
  await page.locator('.capture-alternatives input[type="file"]').setInputFiles({
    name: 'selected.zip',
    mimeType: 'application/zip',
    buffer: readFileSync(path),
  })
  await expect(
    page.getByRole('heading', { name: 'Does this match your cube?' }),
  ).toBeVisible()
  expect(await approvalColors(page)).toEqual(chosen)
  await page
    .getByRole('button', { name: 'Yes, this is my cube', exact: true })
    .click()
  await page
    .getByRole('button', { name: 'Save as test fixture', exact: true })
    .click()
  const secondDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download zip', exact: true }).click()
  const secondPath = await (await secondDownload).path()
  if (!secondPath) throw new Error('Missing reimport export')
  const secondFiles = unzipSync(readFileSync(secondPath))
  const restored = JSON.parse(
    strFromU8(
      secondFiles[
        Object.keys(secondFiles).find((name) => name.endsWith('meta.json'))!
      ],
    ),
  )
  expect(restored.capture.faceRecovery).toEqual(meta.capture.faceRecovery)
  expect(restored.capture.assembledURFDLB).toBe(meta.capture.assembledURFDLB)
  expect(
    Object.values(restored.faces).map(
      (face) => (face as { photoIdentity: unknown }).photoIdentity,
    ),
  ).toEqual(
    Object.values(meta.faces).map(
      (face) => (face as { photoIdentity: unknown }).photoIdentity,
    ),
  )
})

test('a guide conflict searches only after explicit request and Cancel restores the conflict', async ({
  page,
}) => {
  await page.goto('/')
  await page
    .locator('.capture-alternatives input[type="file"]')
    .setInputFiles(
      resolve('test/fixtures/capture-conflict-4x4-2026-11-16T19-08-19.zip'),
    )
  await expect(
    page.getByRole('heading', { name: 'Match your cube', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText('Capture conflicts with the physical guide.', {
      exact: false,
    }),
  ).toBeVisible()
  await expect(page.locator('.spatial-candidate')).toHaveCount(0)
  await page
    .getByRole('button', { name: 'Find a matching cube', exact: true })
    .click()
  await expect(page.locator('.spatial-candidate').first()).toBeVisible()
  await expect(
    page
      .getByRole('group', { name: 'Recognized cube net', exact: true })
      .getByRole('button'),
  ).toHaveCount(6)
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(
    page.getByText('Capture conflicts with the physical guide.', {
      exact: false,
    }),
  ).toBeVisible()
  await expect(page.locator('.spatial-candidate')).toHaveCount(0)
})

test('single-face color review returns through Core resume and outer Cancel keeps the original approval', async ({
  page,
}) => {
  await page.goto('/')
  await page
    .locator('.capture-alternatives input[type="file"]')
    .setInputFiles(
      resolve('test/fixtures/photo-identity-4x4-2026-11-16T21-28-43.zip'),
    )
  await expect(
    page.getByRole('heading', { name: 'Does this match your cube?' }),
  ).toBeVisible()
  const before = await approvalColors(page)
  await page
    .getByRole('button', { name: 'Find a matching cube', exact: true })
    .click()
  await page.locator('.spatial-candidate').first().click()
  const question = await page.locator('#explicit-choice-title').textContent()
  await page
    .getByRole('button', { name: 'Inspect Front face', exact: true })
    .focus()
  const sourceBefore = await page
    .locator('.spatial-photo img')
    .getAttribute('src')
  await page
    .getByRole('button', { name: 'Correct detected colors', exact: true })
    .click()
  await expect(
    page
      .getByRole('group', { name: 'Recognized cube net', exact: true })
      .getByRole('button'),
  ).toHaveCount(6)
  const originalCell = await page
    .locator('.review-detected-cell')
    .first()
    .getAttribute('style')
  await page.locator('.review-detected-cell').first().click()
  const originalColor = await page
    .locator('.color-btn.is-current .color-btn-name')
    .textContent()
  await page.locator('.color-btn:not(.is-current)').first().click()
  await page.getByRole('button', { name: 'OK', exact: true }).click()
  await expect(page.locator('.spatial-color-editor')).toHaveCount(0)
  await expect(page.locator('.face-recovery')).toBeVisible()
  await page
    .getByRole('button', { name: 'Inspect Front face', exact: true })
    .focus()
  expect(await page.locator('.spatial-photo img').getAttribute('src')).toBe(
    sourceBefore,
  )
  await page
    .getByRole('button', { name: 'Correct detected colors', exact: true })
    .click()
  expect(
    await page.locator('.review-detected-cell').first().getAttribute('style'),
  ).not.toBe(originalCell)
  await page.locator('.review-detected-cell').first().click()
  await page.locator('.color-btn').filter({ hasText: originalColor! }).click()
  await page.getByRole('button', { name: 'OK', exact: true }).click()
  await expect(page.locator('#explicit-choice-title')).toHaveText(question!)
  await expect(
    page.getByRole('button', { name: 'Back', exact: true }),
  ).toBeEnabled()
  // Restoring the reviewed color retains the earlier explicit answer; the
  // outer Cancel still discards the complete search transaction.
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Does this match your cube?' }),
  ).toBeVisible()
  expect(await approvalColors(page)).toEqual(before)
})

function driverCapture() {
  const files = unzipSync(
    readFileSync(
      resolve('test/fixtures/photo-identity-4x4-2026-11-16T21-28-43.zip'),
    ),
  )
  const metadata = JSON.parse(strFromU8(files['meta.json']))
  const colors = metadata.colorsURFDLB.split(' ') as string[]
  const captured = Object.fromEntries(
    ['U', 'R', 'F', 'D', 'L', 'B'].map((slot, index) => {
      const grid = Array.from({ length: 4 }, (_, row) =>
        colors[index].slice(row * 4, row * 4 + 4).split(''),
      )
      return [
        slot,
        {
          colors: grid,
          confidence: 1,
          timestamp: 0,
          croppedImage: `data:image/jpeg;base64,${Buffer.from(files[`face-${slot.toLowerCase()}.jpg`]).toString('base64')}`,
          photoIdentity: {
            photoId: `original-${slot}`,
            sourceHash: createHash('sha256')
              .update(files[`face-${slot.toLowerCase()}.jpg`])
              .digest('hex'),
            sourceGrid: grid,
          },
        },
      ]
    }),
  )
  return captured
}

for (const retake of [false, true])
  test(`one Core confirmation installs the external assembly only once under a repeated callback, retake=${retake}`, async ({
    page,
  }) => {
    const captured = driverCapture()
    await page.goto('/')
    await page.evaluate(
      async ({ faces, retake }) => {
        const path = '/e2e/support/explicitRecoveryDriver.ts'
        const { recoveryDriver } = (await import(
          path
        )) as typeof import('./support/explicitRecoveryDriver')
        Object.assign(window, {
          recoveryDriver: recoveryDriver(faces, { retake }),
        })
      },
      { faces: captured, retake },
    )
    await page.evaluate(() =>
      (
        window as unknown as { recoveryDriver: { find: () => void } }
      ).recoveryDriver.find(),
    )
    for (let i = 0; i < 6; i++) {
      const chosen = await page.evaluate(() =>
        (
          window as unknown as { recoveryDriver: { choose: () => boolean } }
        ).recoveryDriver.choose(),
      )
      if (!chosen) break
    }
    expect(
      await page.evaluate(() =>
        (
          window as unknown as { recoveryDriver: { useTwice: () => number } }
        ).recoveryDriver.useTwice(),
      ),
    ).toBe(1)
    await page.evaluate(() =>
      (
        window as unknown as { recoveryDriver: { dispose: () => void } }
      ).recoveryDriver.dispose(),
    )
  })

test('an initial capped empty prefix retains neutral photo slots, color review, and a real larger search', async ({
  page,
}) => {
  await page.goto('/')
  await page.evaluate(async (faces) => {
    const path = '/e2e/support/explicitRecoveryDriver.ts'
    const { recoveryDriver } = (await import(
      path
    )) as typeof import('./support/explicitRecoveryDriver')
    const driver = recoveryDriver(faces, { budget: 1000, dialog: true })
    Object.assign(window, { recoveryDriver: driver })
    driver.find()
  }, driverCapture())
  await expect(
    page.getByText('Search capped; more matches may exist.', { exact: true }),
  ).toBeVisible()
  await expect(page.locator('.spatial-candidate')).toHaveCount(0)
  const slots = page
    .locator('.face-recovery')
    .getByRole('group', { name: 'Captured faces', exact: true })
  await expect(slots.getByRole('button')).toHaveCount(6)
  await expect(
    page.getByRole('button', { name: 'Use this cube', exact: true }),
  ).toHaveCount(0)
  await slots.locator('[data-slot="U"]').click()
  await expect(page.locator('.spatial-color-editor')).toBeVisible()
  await page
    .locator('.spatial-color-editor')
    .getByRole('button', { name: 'Cancel', exact: true })
    .click()
  await page
    .getByRole('button', { name: 'Search further', exact: true })
    .click()
  await expect(page.locator('.spatial-candidate').first()).toBeVisible()
  await expect(
    page
      .getByRole('group', { name: 'Recognized cube net', exact: true })
      .getByRole('button'),
  ).toHaveCount(6)
})

test('a rejected external install keeps the dialog open and never commits an assembly', async ({
  page,
}) => {
  await page.goto('/')
  await page.evaluate(async (faces) => {
    const path = '/e2e/support/explicitRecoveryDriver.ts'
    const { recoveryDriver } = (await import(
      path
    )) as typeof import('./support/explicitRecoveryDriver')
    const driver = recoveryDriver(faces, { dialog: true, rejectInstall: true })
    Object.assign(window, { recoveryDriver: driver })
    driver.find()
  }, driverCapture())
  for (
    let i = 0;
    i < 6 && (await page.locator('.spatial-candidate').count());
    i++
  )
    await page.locator('.spatial-candidate').first().click()
  await page.getByRole('button', { name: 'Use this cube', exact: true }).click()
  await expect(page.locator('.face-recovery')).toBeVisible()
  await expect(page.getByRole('alert')).toHaveText(
    'Capture changed. Cancel and start a new search.',
  )
  await expect(
    page.getByRole('button', { name: 'Use this cube', exact: true }),
  ).toHaveCount(0)
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { recoveryDriver: { committed: unknown[] } })
          .recoveryDriver.committed.length,
    ),
  ).toBe(0)
})

for (const profile of [
  { name: 'desktop', viewport: { width: 1440, height: 1000 }, hasTouch: false },
  { name: 'touch', viewport: { width: 390, height: 844 }, hasTouch: true },
])
  test.describe(profile.name, () => {
    test.use({ viewport: profile.viewport, hasTouch: profile.hasTouch })
    test('the entire recognized net and final controls remain visible during matching', async ({
      page,
    }, testInfo) => {
      await page.goto('/')
      await page
        .locator('.capture-alternatives input[type="file"]')
        .setInputFiles(
          resolve('test/fixtures/photo-identity-4x4-2026-11-16T21-28-43.zip'),
        )
      await expect(
        page.getByRole('heading', { name: 'Does this match your cube?' }),
      ).toBeVisible()
      await page.screenshot({
        path: testInfo.outputPath(`${profile.name}-before.png`),
      })
      await page
        .getByRole('button', { name: 'Find a matching cube', exact: true })
        .click()
      const faces = page
        .getByRole('group', { name: 'Recognized cube net', exact: true })
        .getByRole('button')
      await expect(faces).toHaveCount(6)
      for (const face of await faces.all())
        expect(
          await face.evaluate((element) => {
            const box = element.getBoundingClientRect(),
              hit = document.elementFromPoint(
                box.x + box.width / 2,
                box.y + box.height / 2,
              )
            return (
              box.x >= 0 &&
              box.y >= 0 &&
              box.right <= innerWidth &&
              box.bottom <= innerHeight &&
              !!hit &&
              (element === hit || element.contains(hit))
            )
          }),
        ).toBe(true)
      await expect(page.locator('.spatial-workspace canvas')).toBeVisible()
      await expect(
        page.getByRole('button', { name: 'Cancel', exact: true }),
      ).toBeInViewport()
      await page.screenshot({
        path: testInfo.outputPath(`${profile.name}-after.png`),
      })
    })
  })

test('a saved Use callback cannot install an old search after the current capture is reset', async ({
  page,
}) => {
  await page.goto('/')
  await page.evaluate(async (faces) => {
    const path = '/e2e/support/explicitRecoveryDriver.ts'
    const { recoveryDriver } = (await import(
      path
    )) as typeof import('./support/explicitRecoveryDriver')
    Object.assign(window, { recoveryDriver: recoveryDriver(faces) })
  }, driverCapture())
  await page.evaluate(() =>
    (
      window as unknown as { recoveryDriver: { find: () => void } }
    ).recoveryDriver.find(),
  )
  for (let i = 0; i < 6; i++) {
    const chosen = await page.evaluate(() =>
      (
        window as unknown as { recoveryDriver: { choose: () => boolean } }
      ).recoveryDriver.choose(),
    )
    if (!chosen) break
  }
  await page.evaluate(() =>
    (
      window as unknown as { recoveryDriver: { rememberUse: () => void } }
    ).recoveryDriver.rememberUse(),
  )
  await page.evaluate(() =>
    (
      window as unknown as { recoveryDriver: { resetCaptured: () => void } }
    ).recoveryDriver.resetCaptured(),
  )
  const outcome = await page.evaluate(() =>
    (
      window as unknown as {
        recoveryDriver: { lateUse: () => { active: boolean; commits: number } }
      }
    ).recoveryDriver.lateUse(),
  )
  expect(outcome.active).toBe(false)
  expect(outcome.commits).toBe(0)
})

test('the neutral zero-candidate source editor retains its Photo 1 accessible name', async ({
  page,
}) => {
  await page.goto('/')
  await page.evaluate(async (faces) => {
    const path = '/e2e/support/explicitRecoveryDriver.ts'
    const { recoveryDriver } = (await import(
      path
    )) as typeof import('./support/explicitRecoveryDriver')
    const driver = recoveryDriver(faces, { budget: 1000, dialog: true })
    Object.assign(window, { recoveryDriver: driver })
    driver.find()
  }, driverCapture())
  await page.locator('.face-recovery [data-slot="U"]').click()
  await expect(page.locator('.spatial-color-editor')).toBeVisible()
  await expect(page.locator('.spatial-color-editor #review-title')).toHaveText(
    'Photo 1',
  )
  await expect(
    page.locator('.spatial-color-editor [role=dialog]'),
  ).toHaveAccessibleName('Photo 1')
  await expect(
    page.locator('.spatial-color-editor .review-face-image'),
  ).toHaveAttribute('alt', 'Captured photo of Photo 1')
})

test('an old Use callback cannot approve a different search session over the same capture', async ({
  page,
}) => {
  await page.goto('/')
  await page.evaluate(async (faces) => {
    const path = '/e2e/support/explicitRecoveryDriver.ts'
    const { recoveryDriver } = (await import(
      path
    )) as typeof import('./support/explicitRecoveryDriver')
    Object.assign(window, { recoveryDriver: recoveryDriver(faces) })
  }, driverCapture())
  const act = async (method: string) =>
    page.evaluate((method) => {
      const d = (
        window as unknown as { recoveryDriver: Record<string, () => unknown> }
      ).recoveryDriver
      return d[method]()
    }, method)
  await act('find')
  for (let i = 0; i < 6; i++) if (!(await act('choose'))) break
  await act('rememberUse')
  await act('cancel')
  await act('find')
  for (let i = 0; i < 6; i++) if (!(await act('choose'))) break
  const result = (await act('lateUse')) as { active: boolean; commits: number }
  expect(result.active).toBe(true)
  expect(result.commits).toBe(0)
  expect(await act('useTwice')).toBe(1)
})

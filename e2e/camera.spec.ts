import type * as FrameSampling from '../src/core/vision/FaceSampling.gen'
import {
  readFixtureColors,
  readFixtureAssembled,
} from '../src/client/fixtures/fixtureFormat'
import { rotateCube, rotateGrid, type Faces } from '../src/cube/cubeGeometry'
import { findCaptureForOrientedFace } from '../src/cube/capturedFaceMatching'
import {
  seedForProtocol,
  mirroredProtocol,
} from '../src/client/capture/guidedCaptureProtocol'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test, type Page } from '@playwright/test'

declare global {
  interface Window {
    setTestCameraFace(index: number): Promise<number>
    readTestCameraFrame(): number | null
    cameraFrameChangeFinished: boolean
    cameraFrameChangeId: number
    testCameraSourceRegionUnchanged: boolean
    testCameraSourceCanvas: HTMLCanvasElement
  }
}

const fixture = resolve('test/fixtures/cube-3x3-2026-09-27T09-00-11')
const faceKeys = ['u', 'r', 'f', 'd', 'l', 'b']
const photos = faceKeys.map((face) =>
  readFileSync(resolve(fixture, `face-${face}.jpg`)).toString('base64'),
)

async function installStubCamera(
  page: Page,
  frames = photos,
  turns = frames.map(() => 0),
  startupDelayMs = 0,
) {
  const cpu = Number(process.env.CAMERA_TEST_CPU ?? 1)
  if (cpu > 1) {
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu })
  }
  // Hands-free capture starts on; these tests press the capture buttons.
  await page.addInitScript(() => {
    if (!document.cookie.includes('cube-assembler-auto-capture='))
      document.cookie = 'cube-assembler-auto-capture=0; Path=/'
  })
  await page.addInitScript(
    ({ frames, turns, startupDelayMs }) => {
      const canvas = document.createElement('canvas')
      canvas.width = 960
      canvas.height = 720
      const context = canvas.getContext('2d')!
      window.testCameraSourceCanvas = canvas
      const images = frames.map((base64) => {
        const image = new Image()
        image.src = `data:image/jpeg;base64,${base64}`
        return image
      })
      let generation = 0
      const setFace = async (index: number) => {
        const image = images[index]
        await image.decode()
        context.fillStyle = '#777777'
        context.fillRect(0, 0, canvas.width, canvas.height)
        context.save()
        context.translate(480, 360)
        context.rotate((turns[index] * Math.PI) / 2)
        context.drawImage(image, -216, -216, 432, 432)
        context.restore()
        // The eight-bit marker lives entirely outside the unchanged JPEG and
        // camera sampling square. It identifies the video frame, not puzzle data.
        const before =
          generation === 0
            ? context.getImageData(264, 144, 432, 432).data
            : null
        generation = (generation + 1) % 256
        for (let bit = 0; bit < 8; bit++) {
          context.fillStyle = generation & (1 << bit) ? '#fff' : '#000'
          context.fillRect(bit * 8, 0, 8, 8)
        }
        if (before) {
          const after = context.getImageData(264, 144, 432, 432).data
          window.testCameraSourceRegionUnchanged = before.every(
            (value, index) => value === after[index],
          )
        }
        // Canvas streams may otherwise coalesce a rapid redraw at their FPS
        // boundary. Request this frame without waiting for a later redraw.
        ;(
          stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack
        ).requestFrame()
        return generation
      }
      const stream = canvas.captureStream(10)
      Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
        configurable: true,
        value: async () => {
          if (startupDelayMs)
            await new Promise((resolve) => setTimeout(resolve, startupDelayMs))
          await setFace(0)
          return stream
        },
      })
      window.setTestCameraFace = setFace
      const sample = document.createElement('canvas')
      sample.width = 64
      sample.height = 8
      const sampling = sample.getContext('2d')!
      window.readTestCameraFrame = () => {
        const video = document.querySelector('video')
        if (!video || video.readyState < 2) return null
        sampling.drawImage(video, 0, 0, 64, 8, 0, 0, 64, 8)
        const pixels = sampling.getImageData(0, 0, 64, 8).data
        let frame = 0
        for (let bit = 0; bit < 8; bit++)
          if (pixels[(4 * 64 + bit * 8 + 4) * 4] > 128) frame |= 1 << bit
        return frame
      }
    },
    { frames, turns, startupDelayMs },
  )
}

async function setCameraFace(page: Page, index: number) {
  // The static Live badge precedes stream startup. Wait for the actual video
  // before a manual draw can race with getUserMedia's initial frame.
  await expect(page.locator('.capture-modal-content video')).toHaveJSProperty(
    'videoWidth',
    960,
  )
  const expected = await page.evaluate(
    (face) => window.setTestCameraFace(face),
    index,
  )
  await expect
    .poll(() => page.evaluate(() => window.readTestCameraFrame()))
    .toBe(expected)
}

// Reuse the original JPEGs and their saved assembled state, not a chosen
// solver output. Geometry supplies the v3 view; only JPEG order/rotation changes.
function physicalCameraFrames() {
  const meta = JSON.parse(readFileSync(resolve(fixture, 'meta.json'), 'utf8'))
  const raw = readFixtureColors(meta)!.colors
  const approved = readFixtureAssembled(meta)! as Faces
  let held = rotateCube(approved, 'y', 1)
  const grids: Record<string, string[][]> = {}
  const transforms = faceKeys.map((slot, step) => {
    if (step > 0 && step < 4) held = rotateCube(held, 'y', 1)
    if (step === 4) held = rotateCube(held, 'x', -1)
    if (step === 5) held = rotateCube(held, 'x', 2)
    grids[slot.toUpperCase()] = held.F
    const found = findCaptureForOrientedFace(
      faceKeys.map((key) => raw[key.toUpperCase()]),
      held.F,
    )
    if (!found) throw new Error('Saved physical view has no source JPEG')
    expect(
      rotateGrid(raw[faceKeys[found.slot].toUpperCase()], found.turns),
    ).toEqual(held.F)
    return found
  })
  expect(seedForProtocol(grids, 3, mirroredProtocol).validation.valid).toBe(
    true,
  )
  expect(transforms).toEqual([
    { slot: 3, turns: 1 },
    { slot: 5, turns: 1 },
    { slot: 1, turns: 3 },
    { slot: 4, turns: 1 },
    { slot: 0, turns: 0 },
    { slot: 2, turns: 2 },
  ])
  return {
    frames: transforms.map((found) => photos[found.slot]),
    turns: transforms.map((found) => found.turns),
  }
}

test('captures and re-detects a face from a live camera stream', async ({
  page,
}) => {
  test.setTimeout(120_000)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const physical = physicalCameraFrames()
  await installStubCamera(page, physical.frames, physical.turns)

  await page.goto('/')
  await page.getByRole('button', { name: 'Capture faces' }).click()
  const capture = page.locator('.capture-modal-content')
  await expect(capture.locator('video')).toHaveJSProperty('videoWidth', 960)
  await expect(capture.locator('.capture-live-badge')).toContainText('Live')
  await expect(capture.locator('.capture-live-badge')).toContainText(
    'color match',
  )
  await capture.getByRole('button', { name: 'Capture photo 1' }).click()
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
  await setCameraFace(page, 1)
  await expect.poll(previewColors).not.toBe(firstPreview)
  await setCameraFace(page, 0)
  // The live view never compares the cube with faces already captured.
  await expect(capture.locator('.capture-live-badge')).not.toContainText(
    'Looks like',
  )
  await capture.locator('.capture-net [data-slot="U"]').click()
  await expect(capture).toContainText('Step 1 of 6')
  await capture.getByRole('button', { name: 'Capture photo 1' }).click()
  // Retaking the only original shot leaves no original protocol observation.
  // The next source stays actionable under its neutral photo name.
  await expect(
    capture.getByRole('button', { name: 'Capture photo 2', exact: true }),
  ).toBeEnabled()
  for (let index = 1; index < photos.length; index++) {
    await setCameraFace(page, index)
    await capture
      .getByRole('button', {
        name: /^Capture (?:side [1-4]|top|bottom|up|down|photo [1-6])$/i,
      })
      .click()
    await expect(page.locator('.capture-card')).toContainText(
      index === 5 ? 'All 6 captured' : `${index + 1} of 6 captured`,
    )
  }
  await expect(page.getByText('All 6 captured', { exact: true })).toBeVisible()
  await expect(capture).not.toBeVisible()
  const review = page.locator('.review-modal-content')
  await expect
    .poll(async () => {
      if (await review.isVisible()) return true
      const backToColors = page.getByRole('button', {
        name: /Back to the colors|No, check the colors/,
      })
      if (await backToColors.isVisible()) {
        await backToColors.click()
        return await review.isVisible()
      }
      const dialog = page.getByRole('dialog')
      if (await dialog.isVisible()) {
        await dialog.getByRole('button', { name: 'Close' }).click()
      }
      const editColors = page.getByRole('button', { name: 'Edit colors' })
      if (await editColors.isVisible()) {
        await editColors.click()
        return false
      }
      return false
    })
    .toBe(true)
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
  await capture.getByRole('checkbox', { name: /Hands-free capture/ }).check()
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

test('net thumbnails stay unflipped in mirror mode, also after the fly-in', async ({
  page,
}) => {
  await installStubCamera(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Capture faces' }).click()
  const capture = page.locator('.capture-modal-content')
  await expect(capture.locator('.capture-live-badge')).toContainText('Live')
  await capture.getByLabel('Mirror').check()
  await capture.getByRole('button', { name: 'Capture photo 1' }).click()
  const face = capture.locator(
    '.capture-net [data-slot="U"] .orientation-net-face',
  )
  const flipped = () =>
    face.evaluate((el) => {
      const transform = getComputedStyle(el).transform
      return transform !== 'none' && new DOMMatrix(transform).a < 0
    })
  // During the fly-in and once it has settled.
  expect(await flipped()).toBe(false)
  await face.evaluate((el) =>
    Promise.all(el.getAnimations().map((animation) => animation.finished)),
  )
  expect(await flipped()).toBe(false)
})

test('the turn cue is never flipped in mirror mode', async ({ page }) => {
  await installStubCamera(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Capture faces' }).click()
  const capture = page.locator('.capture-modal-content')
  await expect(capture.locator('.capture-live-badge')).toContainText('Live')
  await capture.getByLabel('Mirror').check()
  await capture.getByRole('button', { name: 'Capture photo 1' }).click()
  await expect(capture.locator('.capture-turn-overlay')).toBeVisible()
  await expect(capture.locator('.turn-hint')).toBeVisible()
  const flipped = (selector: string) =>
    capture.locator(selector).evaluate((el) => {
      const transform = getComputedStyle(el).transform
      return transform !== 'none' && new DOMMatrix(transform).a < 0
    })
  expect(await flipped('.capture-turn-scene')).toBe(false)
  expect(await flipped('.turn-hint')).toBe(false)
})

test('the turn cue shows the arrow and Continue, no instruction text', async ({
  page,
}) => {
  await installStubCamera(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Capture faces' }).click()
  const capture = page.locator('.capture-modal-content')
  await expect(capture.locator('.capture-live-badge')).toContainText('Live')
  await capture.getByRole('button', { name: 'Capture photo 1' }).click()
  const cue = capture.locator('.capture-turn-overlay')
  await expect(cue).toBeVisible()
  await expect(cue.locator('.capture-turn-direction').first()).toBeVisible()
  await expect(cue.getByRole('button', { name: 'Continue' })).toBeVisible()
  await expect(cue).toHaveText(/^\s*Continue\s*$/)
})

test('the turn cue draws the selected cube size', async ({ page }) => {
  const folder = resolve('test/fixtures/cube-5x5-2026-10-25T23-50-58')
  const frames = faceKeys.map((face) =>
    readFileSync(resolve(folder, `face-${face}.jpg`)).toString('base64'),
  )
  await installStubCamera(page, frames)
  await page.goto('/')
  await page
    .getByRole('combobox', { name: 'Cube' })
    .selectOption('builtin-generic-5')
  await page.getByRole('button', { name: 'Capture faces' }).click()
  const capture = page.locator('.capture-modal-content')
  await expect(capture.locator('.capture-live-badge')).toContainText('Live')
  await capture.getByRole('button', { name: /^Capture photo 1/i }).click()
  await expect(capture.locator('.capture-turn-overlay')).toBeVisible()
  const face = capture.locator('.capture-turn-front .capture-turn-sticker')
  await expect(face).toHaveCount(25)
})

test('the turn cue shows after each of the first five captures', async ({
  page,
}) => {
  test.setTimeout(120_000)
  await installStubCamera(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Capture faces' }).click()
  const capture = page.locator('.capture-modal-content')
  await expect(capture.locator('.capture-live-badge')).toContainText('Live')
  const kinds = ['side', 'side', 'side', 'top', 'bottom']
  for (let index = 0; index < kinds.length; index++) {
    await setCameraFace(page, index)
    await capture
      .getByRole('button', {
        name: /^Capture (?:side [1-4]|top|bottom|up|down|photo [1-6])$/i,
      })
      .click()
    await expect(
      capture.locator(`.capture-turn-overlay.capture-turn-${kinds[index]}`),
    ).toBeVisible()
    await capture.getByRole('button', { name: 'Continue' }).click()
    await expect(capture.locator('.capture-turn-overlay')).toHaveCount(0)
  }
})

test('a valid cube never starts the color review after the last capture', async ({
  page,
}) => {
  test.setTimeout(120_000)
  const physical = physicalCameraFrames()
  await installStubCamera(page, physical.frames, physical.turns)
  await page.goto('/')
  await page.getByRole('button', { name: 'Capture faces' }).click()
  const capture = page.locator('.capture-modal-content')
  await expect(capture.locator('.capture-live-badge')).toContainText('Live')
  for (let index = 0; index < photos.length; index++) {
    await setCameraFace(page, index)
    await capture
      .getByRole('button', {
        name: /^Capture (?:side [1-4]|top|bottom|up|down|photo [1-6])$/i,
      })
      .click()
  }
  await expect(capture).not.toBeVisible()
  await expect(
    page
      .getByRole('heading', { name: 'Does this match your cube?' })
      .or(page.getByRole('status').filter({ hasText: 'Valid cube' })),
  ).toBeVisible()
  await expect(page.locator('.review-modal-content')).toHaveCount(0)
})

test('a mirrored 5x5 capture asks only whether it is your cube', async ({
  page,
}) => {
  test.setTimeout(120_000)
  const folder = resolve('test/fixtures/cube-5x5-2026-10-25T23-50-58')
  const frames = faceKeys.map((face) =>
    readFileSync(resolve(folder, `face-${face}.jpg`)).toString('base64'),
  )
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await installStubCamera(page, frames)
  await page.goto('/')
  await page
    .getByRole('combobox', { name: 'Cube' })
    .selectOption('builtin-generic-5')
  await page.getByRole('button', { name: 'Capture faces' }).click()
  const capture = page.locator('.capture-modal-content')
  await expect(capture.locator('.capture-live-badge')).toContainText('Live')
  await capture.getByLabel('Mirror').check()
  for (let index = 0; index < frames.length; index++) {
    await setCameraFace(page, index)
    await capture
      .getByRole('button', {
        name: /^Capture (?:side [1-4]|top|bottom|up|down|photo [1-6])$/i,
      })
      .click()
  }
  await expect(capture).not.toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Does this match your cube?' }),
  ).toBeVisible()
  await expect(page.locator('.review-modal-content')).toHaveCount(0)
  // "No" starts the color review.
  await page.getByRole('button', { name: 'No, check the colors' }).click()
  await expect(page.locator('.review-modal-content')).toBeVisible()
})

for (const mirrored of [true, false])
  test(`numbered live slots stay fixed while ${mirrored ? 'mirrored' : 'unmirrored'} cap cues use the accepted pitch`, async ({
    page,
  }) => {
    await installStubCamera(page)
    await page.goto('/')
    await page.getByRole('button', { name: 'Capture faces' }).click()
    const capture = page.locator('.capture-modal-content')
    const mirror = capture.getByRole('checkbox', { name: 'Mirror' })
    await mirror.setChecked(mirrored)
    const slots = ['U', 'R', 'F', 'D', 'L', 'B']
    const areas = ['2 / 1', '2 / 2', '2 / 3', '2 / 4', '1 / 2', '3 / 2']
    for (const [i, slot] of slots.entries()) {
      const cell = capture.locator(`.capture-net [data-slot="${slot}"]`)
      await expect(cell).toHaveCSS('grid-area', areas[i])
      await expect(cell.locator('.capture-net-label')).toHaveText(String(i + 1))
    }
    for (let step = 0; step < 5; step++) {
      await setCameraFace(page, step)
      await capture
        .getByRole('button', { name: /^Capture (?:photo [1-6]|up|down)$/i })
        .click()
      const cue = capture.locator('.capture-turn-overlay')
      await expect(cue).toBeVisible()
      const matrix = await cue
        .locator('.capture-turn-cube')
        .evaluate((element) => {
          for (const animation of element.getAnimations()) animation.finish()
          const m = new DOMMatrix(getComputedStyle(element).transform)
          return {
            xx: m.m11,
            xz: m.m13,
            yy: m.m22,
            yz: m.m23,
            zy: m.m32,
            zz: m.m33,
          }
        })
      if (step < 3) {
        expect(matrix.xx).toBeCloseTo(0)
        expect(matrix.xz).toBeCloseTo(1)
      } else if (step === 3) {
        expect(matrix.yz).toBeCloseTo(mirrored ? 1 : -1)
        expect(matrix.zy).toBeCloseTo(mirrored ? -1 : 1)
      } else {
        expect(matrix.yy).toBeCloseTo(-1)
        expect(matrix.zz).toBeCloseTo(-1)
      }
      await cue.getByRole('button', { name: 'Continue' }).click()
    }
  })

test('a presented camera frame stays usable when no later video callback arrives', async ({
  page,
}) => {
  await installStubCamera(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Capture faces' }).click()
  await expect(page.locator('.capture-modal-content video')).toHaveJSProperty(
    'videoWidth',
    960,
  )
  await page.evaluate(() => {
    const video = document.querySelector('video')!
    // Model late registration after a one-shot canvas frame was presented:
    // there is no following callback, although the video remains usable.
    video.requestVideoFrameCallback = () => 0
    window.cameraFrameChangeFinished = false
    void window.setTestCameraFace(1).then((id) => {
      window.cameraFrameChangeId = id
      window.cameraFrameChangeFinished = true
    })
  })
  await expect
    .poll(() => page.evaluate(() => window.cameraFrameChangeFinished))
    .toBe(true)
  expect(
    await page.evaluate(() => window.testCameraSourceRegionUnchanged),
  ).toBe(true)
  await expect
    .poll(() => page.evaluate(() => window.readTestCameraFrame()))
    .toBe(await page.evaluate(() => window.cameraFrameChangeId))
  const padding = await page.evaluate(async () => {
    // Use the actual production background sampler: the marker must not change
    // its reference color either, despite living outside the sticker samples.
    const path = '/src/core/vision/FaceSampling.res.mjs'
    const core = (await import(path)) as typeof FrameSampling
    const source = window.testCameraSourceCanvas
    const clean = document.createElement('canvas')
    clean.width = source.width
    clean.height = source.height
    const context = clean.getContext('2d')!
    context.drawImage(source, 0, 0)
    context.fillStyle = '#777777'
    context.fillRect(0, 0, 64, 8)
    const bounds = core.guideBounds(
      source.width,
      source.height,
      core.sampleFaceFraction,
    )
    return {
      outside: bounds.startX >= 64 && bounds.startY >= 8,
      before: core.extractBackgroundColorFromPixels(
        context.getImageData(0, 0, source.width, source.height).data,
        source.width,
        source.height,
        bounds,
      ),
      after: core.extractBackgroundColorFromPixels(
        source.getContext('2d')!.getImageData(0, 0, source.width, source.height)
          .data,
        source.width,
        source.height,
        bounds,
      ),
    }
  })
  expect(padding.outside).toBe(true)
  expect(padding.after).toEqual(padding.before)
})

test('manual camera frames follow a delayed stream initialization', async ({
  page,
}) => {
  await installStubCamera(page, photos, undefined, 200)
  await page.goto('/')
  await page.getByRole('button', { name: 'Capture faces' }).click()
  // The static badge deliberately does not imply getUserMedia has returned.
  await expect(page.locator('.capture-live-badge')).toContainText('Live')
  await setCameraFace(page, 1)
  expect(await page.evaluate(() => window.readTestCameraFrame())).toBe(2)
})

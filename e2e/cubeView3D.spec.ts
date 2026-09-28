import { expect, test, type Page } from '@playwright/test'

async function swipeFrontFace(page: Page, dx = -38) {
  const bounds = await page.locator('.cube-3d-canvas').boundingBox()
  expect(bounds).not.toBeNull()
  if (!bounds) return
  const x = bounds.x + bounds.width / 2 + dx
  const y = bounds.y + bounds.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x, y - 70, { steps: 5 })
  await page.mouse.up()
}

test('move history and Undo survive a view switch, then Reset clears them', async ({
  page,
}) => {
  await page.goto('/')
  await page
    .getByRole('combobox', { name: 'Cube' })
    .selectOption({ label: '5×5' })
  await page.getByRole('button', { name: 'Solved cube' }).click()
  const notation = page.getByRole('textbox', { name: 'Notation' })
  const solved = await notation.inputValue()
  await page.getByRole('button', { name: '3D View' }).click()
  await page.getByRole('button', { name: 'Front (F)' }).click()
  const undo = page.getByRole('button', { name: 'Undo', exact: true })
  const history = page.getByRole('status', { name: 'Move history' })
  await expect(undo).toBeDisabled()

  await swipeFrontFace(page)
  await expect(history).toHaveText("Moves: 2L'")
  const afterFirst = await notation.inputValue()
  expect(afterFirst).not.toBe(solved)
  await swipeFrontFace(page, 38)
  await expect(history).toHaveText("Moves: 2L' 2R")
  await expect(notation).not.toHaveValue(afterFirst)

  await page.getByRole('button', { name: '2D Net' }).click()
  await page.getByRole('button', { name: '3D View' }).click()
  await expect(history).toHaveText("Moves: 2L' 2R")
  await undo.click()
  await expect(notation).toHaveValue(afterFirst)
  await expect(history).toHaveText("Moves: 2L'")
  await page.getByRole('button', { name: 'Reset', exact: true }).click()
  await expect(notation).toHaveValue(solved)
  await expect(history).toHaveText('Moves: None')
  await expect(undo).toBeDisabled()
})

test('consecutive same-layer turns accumulate in move history', async ({
  page,
}) => {
  await page.goto('/')
  await page
    .getByRole('combobox', { name: 'Cube' })
    .selectOption({ label: '5×5' })
  await page.getByRole('button', { name: 'Solved cube' }).click()
  await page.getByRole('button', { name: '3D View' }).click()
  await page.getByRole('button', { name: 'Front (F)' }).click()
  const history = page.getByRole('status', { name: 'Move history' })

  await swipeFrontFace(page)
  await expect(history).toHaveText("Moves: 2L'")
  await swipeFrontFace(page)
  await expect(history).toHaveText('Moves: 2L2')
  await swipeFrontFace(page)
  await expect(history).toHaveText('Moves: 2L')
  await swipeFrontFace(page)
  await expect(history).toHaveText('Moves: None')
})

test('a sticker drag turns the layer live and settles on whole turns', async ({
  page,
}) => {
  await page.goto('/')
  await page
    .getByRole('combobox', { name: 'Cube' })
    .selectOption({ label: '5×5' })
  await page.getByRole('button', { name: 'Solved cube' }).click()
  const notation = page.getByRole('textbox', { name: 'Notation' })
  const solved = await notation.inputValue()
  await page.getByRole('button', { name: '3D View' }).click()
  await page.getByRole('button', { name: 'Front (F)' }).click()
  const history = page.getByRole('status', { name: 'Move history' })
  const canvas = page.locator('.cube-3d-canvas')
  const bounds = await canvas.boundingBox()
  expect(bounds).not.toBeNull()
  if (!bounds) return
  const x = bounds.x + bounds.width / 2 - 38
  const cy = bounds.y + bounds.height / 2
  // Facing the front of a 5x5, a quarter turn of a column is a drag of
  // about half the canvas height.
  const quarter = bounds.height / 2
  const drag = async (from: number, to: number) => {
    await page.mouse.move(x, from)
    await page.mouse.down()
    await page.mouse.move(x, to, { steps: 12 })
    // Holding still before lifting throws nothing.
    await page.waitForTimeout(150)
  }
  await page.waitForTimeout(300)
  const still = await canvas.screenshot()

  // The layer follows a short drag and springs back when released.
  await drag(cy, cy - 0.2 * quarter)
  expect((await canvas.screenshot()).equals(still)).toBe(false)
  await page.mouse.up()
  await page.waitForTimeout(400)
  await expect(history).toHaveText('Moves: None')
  expect((await canvas.screenshot()).equals(still)).toBe(true)

  // Dragging on past the first quarter turn turns the layer twice.
  await drag(cy + 0.55 * quarter, cy - 0.95 * quarter)
  await page.mouse.up()
  await expect(history).toHaveText('Moves: 2L2')
  await expect(notation).not.toHaveValue(solved)

  // Dragging it back undoes the turn.
  await drag(cy - 0.55 * quarter, cy + 0.95 * quarter)
  await page.mouse.up()
  await expect(history).toHaveText('Moves: None')
  await expect(notation).toHaveValue(solved)
})

test('scramble records completed turns that can be undone', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Solved cube' }).click()
  await page.getByRole('button', { name: '3D View' }).click()
  const history = page.getByRole('status', { name: 'Move history' })
  await page.getByRole('button', { name: 'Scramble', exact: true }).click()
  await expect
    .poll(async () => (await history.textContent())?.trim().split(/\s+/).length)
    .toBe(21)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect
    .poll(async () => (await history.textContent())?.trim().split(/\s+/).length)
    .toBe(20)
})

test('keeps scramble and history controls without layer turn buttons', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Solved cube' }).click()
  await page.getByRole('button', { name: '3D View' }).click()
  await expect(page.getByText('Layer Turns:')).toHaveCount(0)
  await expect(page.getByTitle('Turn U clockwise')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Scramble' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible()
})

test('swiping a sticker turns its inner slice on a 5x5 cube', async ({
  page,
}) => {
  await page.goto('/')
  await page
    .getByRole('combobox', { name: 'Cube' })
    .selectOption({ label: '5×5' })
  await page.getByRole('button', { name: 'Solved cube' }).click()
  await page.getByRole('button', { name: '3D View' }).click()
  await page.getByRole('button', { name: 'Front (F)' }).click()
  const notation = page.getByRole('textbox', { name: 'Notation' })
  const solved = (await notation.inputValue()).split(' ')
  const bounds = await page.locator('.cube-3d-canvas').boundingBox()
  expect(bounds).not.toBeNull()
  if (!bounds) return
  const x = bounds.x + bounds.width / 2 - 38
  const y = bounds.y + bounds.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x, y - 70, { steps: 5 })
  await page.mouse.up()
  await expect(notation).not.toHaveValue(solved.join(' '))
  const turned = (await notation.inputValue()).split(' ')
  expect(turned[1]).toBe(solved[1])
  expect(turned[4]).toBe(solved[4])
  await expect(page.getByRole('status', { name: 'Move history' })).toHaveText(
    "Moves: 2L'",
  )
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(notation).toHaveValue(solved.join(' '))
})

test('lists face presets in URFDLB order', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Solved cube' }).click()
  await page.getByRole('button', { name: '3D View' }).click()
  const section = page.locator('.cube-3d-section').first()
  await expect(section).toBeVisible()
  const labels = await section.locator('button').allTextContents()
  expect(labels.map((label) => label.trim())).toEqual([
    'Up (U)',
    'Right (R)',
    'Front (F)',
    'Down (D)',
    'Left (L)',
    'Back (B)',
    'Isometric',
    'Iso-back',
  ])
})

test('Iso-back shows the cube from behind, and Isometric turns it back', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Solved cube' }).click()
  await page.getByRole('button', { name: '3D View' }).click()
  const canvas = page.locator('.cube-3d-canvas')
  await page.getByRole('button', { name: 'Isometric' }).click()
  await page.waitForTimeout(100)
  const front = await canvas.screenshot()
  await page.getByRole('button', { name: 'Iso-back' }).click()
  await page.waitForTimeout(100)
  expect((await canvas.screenshot()).equals(front)).toBe(false)
  await page.getByRole('button', { name: 'Isometric' }).click()
  await page.waitForTimeout(100)
  expect((await canvas.screenshot()).equals(front)).toBe(true)
})

test('Iso-back reveals the Down face', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Solved cube' }).click()
  await page.getByRole('button', { name: '3D View' }).click()
  await page.getByRole('button', { name: 'Iso-back' }).click()
  const screenshot = await page.locator('.cube-3d-canvas').screenshot()
  const yellowPixels = await page.evaluate(async (base64) => {
    const image = new Image()
    image.src = `data:image/png;base64,${base64}`
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = image.width
    canvas.height = image.height
    const context = canvas.getContext('2d')!
    context.drawImage(image, 0, 0)
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
    let count = 0
    for (let i = 0; i < pixels.length; i += 4) {
      const red = pixels[i]
      const green = pixels[i + 1]
      const blue = pixels[i + 2]
      // Matte yellow is lime leaning, unlike the older orange-yellow display color.
      if (red > 60 && green > red * 1.05 && blue < red * 0.5) count++
    }
    return count
  }, screenshot.toString('base64'))
  expect(yellowPixels).toBeGreaterThan(1_000)
})

test('shows the slate backdrop through a transparent WebGL canvas', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Solved cube' }).click()
  await page.getByRole('button', { name: '3D View' }).click()
  const backdrop = await page
    .locator('.cube-3d-canvas-wrap')
    .evaluate((wrap) => {
      const canvas = wrap.querySelector('canvas')
      const gl = canvas?.getContext('webgl2') ?? canvas?.getContext('webgl')
      return {
        alpha: gl?.getContextAttributes()?.alpha,
        background: getComputedStyle(wrap).backgroundImage,
      }
    })
  expect(backdrop.alpha).toBe(true)
  expect(backdrop.background.match(/radial-gradient/g)).toHaveLength(2)
})

for (const size of [2, 5]) {
  test(`${size}x${size} turning cut keeps solid rounded plastic`, async ({
    page,
  }) => {
    await page.goto('/')
    await page
      .getByRole('combobox', { name: 'Cube' })
      .selectOption({ label: `${size}×${size}` })
    await page.getByRole('button', { name: 'Solved cube' }).click()
    await page.getByRole('button', { name: '3D View' }).click()
    const canvas = page.locator('.cube-3d-canvas')
    await expect(canvas).toBeVisible()
    await page.locator('.cube-3d-hint').evaluate((hint) => {
      ;(hint as HTMLElement).style.visibility = 'hidden'
    })
    await page.getByRole('button', { name: 'Front (F)' }).click()
    const bounds = await canvas.boundingBox()
    expect(bounds).not.toBeNull()
    if (!bounds) return
    // Hold the column 40% of a quarter turn into the drag. Facing the
    // front, the sticker moves half the cube width per radian, seen from the
    // default camera distance to the face.
    const half = size / 2
    const focal = bounds.height / (2 * Math.tan(Math.PI / 8))
    const quarter = ((Math.PI / 2) * focal * half) / (3 + size * 1.8 - half)
    const x = bounds.x + bounds.width / 2 - 38
    const y = bounds.y + bounds.height / 2
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x, y - 0.4 * quarter, { steps: 5 })
    await expect(canvas).toHaveScreenshot(`cube-${size}x${size}-mid-turn.png`, {
      maxDiffPixelRatio: 0.03,
    })
    await page.mouse.up()
  })
}

test('a dragged cube keeps turning briefly after release', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Solved cube' }).click()
  await page.getByRole('button', { name: '3D View' }).click()
  const canvas = page.locator('.cube-3d-canvas')
  await expect(canvas).toBeVisible()
  const bounds = await canvas.boundingBox()
  expect(bounds).not.toBeNull()
  if (!bounds) return

  const x = bounds.x + bounds.width * 0.12
  const y = bounds.y + bounds.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + 100, y + 35, { steps: 5 })
  await page.mouse.up()
  const released = await canvas.screenshot()
  await page.waitForTimeout(150)
  const coasting = await canvas.screenshot()
  expect(coasting.equals(released)).toBe(false)
})

test('auto-rotate pauses for a drag and resumes without changing its setting', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Solved cube' }).click()
  await page.getByRole('button', { name: '3D View' }).click()
  await page.getByRole('button', { name: 'Auto-rotate' }).click()
  const canvas = page.locator('.cube-3d-canvas')
  const bounds = await canvas.boundingBox()
  expect(bounds).not.toBeNull()
  if (!bounds) return

  const x = bounds.x + bounds.width * 0.12
  const y = bounds.y + bounds.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + 90, y + 20)
  await page.waitForTimeout(100)
  const held = await canvas.screenshot()
  await page.waitForTimeout(150)
  expect((await canvas.screenshot()).equals(held)).toBe(true)

  await page.mouse.up()
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible()
  await expect
    .poll(async () => page.evaluate(() => document.cookie))
    .toContain('cube-assembler-auto-rotate=1')
  await page.waitForTimeout(250)
  const idle = await canvas.screenshot()
  await page.waitForTimeout(150)
  expect((await canvas.screenshot()).equals(idle)).toBe(true)
  await page.waitForTimeout(1350)
  const resumed = await canvas.screenshot()
  await page.waitForTimeout(150)
  expect((await canvas.screenshot()).equals(resumed)).toBe(false)
})

for (const control of ['Front (F)', 'Isometric', 'Iso-back']) {
  test(`${control} pauses auto-rotate so its view can be inspected`, async ({
    page,
  }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Solved cube' }).click()
    await page.getByRole('button', { name: '3D View' }).click()
    await page.getByRole('button', { name: 'Auto-rotate' }).click()
    await page.getByRole('button', { name: control }).click()
    const canvas = page.locator('.cube-3d-canvas')
    await page.waitForTimeout(100)
    const held = await canvas.screenshot()
    await page.waitForTimeout(150)
    expect((await canvas.screenshot()).equals(held)).toBe(true)
    await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible()
  })
}

test('on touch, one finger turns a layer and two fingers rotate the view', async ({
  page,
}) => {
  await page.goto('/')
  await page
    .getByRole('combobox', { name: 'Cube' })
    .selectOption({ label: '5×5' })
  await page.getByRole('button', { name: 'Solved cube' }).click()
  await page.getByRole('button', { name: '3D View' }).click()
  await page.getByRole('button', { name: 'Front (F)' }).click()
  const notation = page.getByRole('textbox', { name: 'Notation' })
  const history = page.getByRole('status', { name: 'Move history' })
  const canvas = page.locator('.cube-3d-canvas')
  const bounds = await canvas.boundingBox()
  expect(bounds).not.toBeNull()
  if (!bounds) return
  const touch = (type: string, id: number, x: number, y: number) =>
    canvas.dispatchEvent(type, {
      pointerId: id,
      pointerType: 'touch',
      isPrimary: id === 1,
      clientX: x,
      clientY: y,
      bubbles: true,
    })
  const swipe = async (id: number, from: [number, number], dy: number) => {
    await touch('pointerdown', id, ...from)
    for (let step = 1; step <= 5; step++)
      await touch('pointermove', id, from[0], from[1] + (dy * step) / 5)
    await touch('pointerup', id, from[0], from[1] + dy)
  }
  await page.waitForTimeout(300)
  const still = await canvas.screenshot()

  // One finger on the background neither turns nor tilts.
  await swipe(1, [bounds.x + 20, bounds.y + 20], 80)
  await page.waitForTimeout(300)
  expect((await canvas.screenshot()).equals(still)).toBe(true)
  await expect(history).toHaveText('Moves: None')

  // One finger on a sticker turns its layer.
  const solved = await notation.inputValue()
  const cx = bounds.x + bounds.width / 2
  const cy = bounds.y + bounds.height / 2
  await swipe(2, [cx - 38, cy], -70)
  await expect(history).toHaveText("Moves: 2L'")
  await expect(notation).not.toHaveValue(solved)
  const turned = await notation.inputValue()
  await page.waitForTimeout(600)
  const afterTurn = await canvas.screenshot()

  // Two fingers rotate the view without changing the cube state.
  await touch('pointerdown', 3, cx - 40, cy)
  await touch('pointerdown', 4, cx + 40, cy)
  for (let step = 1; step <= 5; step++) {
    await touch('pointermove', 3, cx - 40 + step * 12, cy + step * 6)
    await touch('pointermove', 4, cx + 40 + step * 12, cy + step * 6)
  }
  await touch('pointerup', 3, cx + 20, cy + 30)
  await touch('pointerup', 4, cx + 100, cy + 30)
  await page.waitForTimeout(300)
  expect((await canvas.screenshot()).equals(afterTurn)).toBe(false)
  await expect(history).toHaveText("Moves: 2L'")
  await expect(notation).toHaveValue(turned)
})

test('a quick two-finger flick rotates the view without recording a move', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Solved cube' }).click()
  await page.getByRole('button', { name: '3D View' }).click()
  await page.getByRole('button', { name: 'Front (F)' }).click()
  const bounds = await page.locator('.cube-3d-canvas').boundingBox()
  if (!bounds) throw new Error('No canvas')
  const x = bounds.x + bounds.width / 2
  const y = bounds.y + bounds.height / 2
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setTouchEmulationEnabled', {
    enabled: true,
    maxTouchPoints: 2,
  })
  const points = (dy: number) => [
    { x: x - 35, y: y + dy, id: 1 },
    { x: x + 35, y: y + dy, id: 2 },
  ]
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: points(0),
  })
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: points(-35),
  })
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  })
  await expect(page.getByRole('status', { name: 'Move history' })).toHaveText(
    'Moves: None',
  )
})

test('a two-finger touchpad swipe tilts the cube instead of zooming', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Solved cube' }).click()
  await page.getByRole('button', { name: '3D View' }).click()
  await page.getByRole('button', { name: 'Front (F)' }).click()
  const canvas = page.locator('.cube-3d-canvas')
  const bounds = await canvas.boundingBox()
  expect(bounds).not.toBeNull()
  if (!bounds) return
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + 30)
  await page.waitForTimeout(300)
  const front = await canvas.screenshot()
  // Fractional, sideways deltas are what touchpads send for a swipe.
  for (let i = 0; i < 6; i++) await page.mouse.wheel(7.5, 0)
  await page.waitForTimeout(300)
  const swiped = await canvas.screenshot()
  expect(swiped.equals(front)).toBe(false)
  // The Front preset still points the same way, so the swipe turned the view.
  await page.getByRole('button', { name: 'Front (F)' }).click()
  await page.waitForTimeout(300)
  expect((await canvas.screenshot()).equals(front)).toBe(true)
})

test('two fingers zoom only once they clearly pinch', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Solved cube' }).click()
  await page.getByRole('button', { name: '3D View' }).click()
  await page.getByRole('button', { name: 'Front (F)' }).click()
  const canvas = page.locator('.cube-3d-canvas')
  const bounds = await canvas.boundingBox()
  expect(bounds).not.toBeNull()
  if (!bounds) return
  const cx = bounds.x + bounds.width / 2
  const cy = bounds.y + bounds.height / 2
  const touch = (type: string, id: number, x: number) =>
    canvas.dispatchEvent(type, {
      pointerId: id,
      pointerType: 'touch',
      isPrimary: id === 1,
      clientX: x,
      clientY: cy,
      bubbles: true,
    })
  // Fingers 100 px apart spread symmetrically to `half` px each side.
  const spread = async (half: number) => {
    await touch('pointerdown', 1, cx - 50)
    await touch('pointerdown', 2, cx + 50)
    for (let step = 1; step <= 5; step++) {
      const h = 50 + ((half - 50) * step) / 5
      await touch('pointermove', 1, cx - h)
      await touch('pointermove', 2, cx + h)
    }
    // Each finger moves in its own event, so the midpoint wobbles by half a
    // pixel; resting before lifting leaves no coasting from that wobble.
    await page.waitForTimeout(200)
    await touch('pointerup', 1, cx - half)
    await touch('pointerup', 2, cx + half)
    await page.waitForTimeout(300)
  }
  await page.waitForTimeout(300)
  const before = await canvas.screenshot()
  // A 10% drift, as while tilting, keeps the zoom.
  await spread(55)
  expect((await canvas.screenshot()).equals(before)).toBe(true)
  // A 60% pinch-out zooms in.
  await spread(80)
  expect((await canvas.screenshot()).equals(before)).toBe(false)
})

const SOUND_CASES: Array<{
  title: string
  cookies: { capture: string; turn?: string }
  sound: boolean
}> = [
  { title: 'clicks with Sound on', cookies: { capture: '1' }, sound: true },
  {
    title: 'stays silent with Sound off',
    cookies: { capture: '0' },
    sound: false,
  },
  {
    title: 'clicks with the turn sound on and capture sound off',
    cookies: { capture: '0', turn: '1' },
    sound: true,
  },
  {
    title: 'stays silent with the turn sound off and capture sound on',
    cookies: { capture: '1', turn: '0' },
    sound: false,
  },
]
for (const { title, cookies, sound } of SOUND_CASES)
  test(`a finished turn ${title}`, async ({ page, context }) => {
    const url = `http://127.0.0.1:${process.env.E2E_PORT ?? '4174'}`
    await context.addCookies([
      { name: 'cube-assembler-capture-sound', value: cookies.capture, url },
      ...(cookies.turn === undefined
        ? []
        : [{ name: 'cube-assembler-turn-sound', value: cookies.turn, url }]),
    ])
    await page.addInitScript(() => {
      const created: unknown[] = []
      ;(window as unknown as { audioContexts: unknown[] }).audioContexts =
        created
      const Original = window.AudioContext
      window.AudioContext = class extends Original {
        constructor(...args: ConstructorParameters<typeof AudioContext>) {
          super(...args)
          created.push(this)
        }
      }
    })
    await page.goto('/')
    await page.getByRole('button', { name: 'Solved cube' }).click()
    await page.getByRole('button', { name: '3D View' }).click()
    await page.getByRole('button', { name: 'Front (F)' }).click()
    await swipeFrontFace(page)
    await expect(
      page.getByRole('status', { name: 'Move history' }),
    ).not.toHaveText('Moves: None')
    const contexts = await page.evaluate(
      () =>
        (window as unknown as { audioContexts: unknown[] }).audioContexts
          .length,
    )
    expect(contexts).toBe(sound ? 1 : 0)
  })

test('a two-finger tilt with close, drifting fingers never zooms', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Solved cube' }).click()
  await page.getByRole('button', { name: '3D View' }).click()
  const front = page.getByRole('button', { name: 'Front (F)' })
  await front.click()
  const canvas = page.locator('.cube-3d-canvas')
  const bounds = await canvas.boundingBox()
  expect(bounds).not.toBeNull()
  if (!bounds) return
  const cx = bounds.x + bounds.width / 2
  const cy = bounds.y + bounds.height / 2
  const touch = (type: string, id: number, x: number, y: number) =>
    canvas.dispatchEvent(type, {
      pointerId: id,
      pointerType: 'touch',
      isPrimary: id === 1,
      clientX: x,
      clientY: y,
      bubbles: true,
    })
  await page.waitForTimeout(300)
  const before = await canvas.screenshot()

  // Fingers 60 px apart swipe down 150 px and drift 15 px apart (25%), as
  // real fingers do. That used to switch zoom on for the rest of the swipe.
  await touch('pointerdown', 1, cx - 30, cy - 75)
  await touch('pointerdown', 2, cx + 30, cy - 75)
  for (let step = 1; step <= 10; step++) {
    const drift = 1.5 * step
    await touch('pointermove', 1, cx - 30 - drift / 2, cy - 75 + step * 15)
    await touch('pointermove', 2, cx + 30 + drift / 2, cy - 75 + step * 15)
  }
  await page.waitForTimeout(200)
  await touch('pointerup', 1, cx - 37.5, cy + 75)
  await touch('pointerup', 2, cx + 37.5, cy + 75)
  await page.waitForTimeout(300)
  expect((await canvas.screenshot()).equals(before)).toBe(false)

  // Front resets the orientation but keeps the zoom: same picture, no zoom.
  await front.click()
  await page.waitForTimeout(300)
  expect((await canvas.screenshot()).equals(before)).toBe(true)
})

test.describe('held sticker drags', () => {
  // Facing the front of a 5x5: columns are about an eighth of the canvas
  // height apart, and a quarter turn is a drag of about half of it.
  const setUp = async (page: Page) => {
    await page.goto('/')
    await page
      .getByRole('combobox', { name: 'Cube' })
      .selectOption({ label: '5×5' })
    await page.getByRole('button', { name: 'Solved cube' }).click()
    await page.getByRole('button', { name: '3D View' }).click()
    await page.getByRole('button', { name: 'Front (F)' }).click()
    const bounds = await page.locator('.cube-3d-canvas').boundingBox()
    if (!bounds) throw new Error('No canvas')
    return {
      x: bounds.x + bounds.width / 2 - 38,
      y: bounds.y + bounds.height / 2,
      column: bounds.height * 0.127,
      quarter: bounds.height / 2,
    }
  }
  const history = (page: Page) =>
    page.getByRole('status', { name: 'Move history' })
  const badge = (page: Page) => page.locator('.cube-3d-press-mode')

  test('a 300 ms hold turns a standard wide move directly', async ({
    page,
  }) => {
    const { x, y, quarter } = await setUp(page)
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.waitForTimeout(450)
    await expect(badge(page)).toHaveText(/Wide turn/)
    await page.mouse.move(x, y - 1.1 * quarter, { steps: 12 })
    await page.waitForTimeout(150)
    await page.mouse.up()
    await expect(history(page)).toHaveText("Moves: Lw'")
    await expect(badge(page)).toHaveCount(0)
  })

  test('Shift turns a standard wide move at once', async ({ page }) => {
    const { x, y, quarter } = await setUp(page)
    await page.keyboard.down('Shift')
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x, y - 1.1 * quarter, { steps: 12 })
    await page.waitForTimeout(150)
    await page.mouse.up()
    await page.keyboard.up('Shift')
    await expect(history(page)).toHaveText("Moves: Lw'")
  })

  test('a long hold stays a wide move', async ({ page }) => {
    const { x, y, quarter } = await setUp(page)
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.waitForTimeout(1000)
    await expect(badge(page)).toHaveText(/Wide turn/)
    await page.mouse.move(x, y - 1.1 * quarter, { steps: 12 })
    await page.waitForTimeout(150)
    await page.mouse.up()
    await expect(history(page)).toHaveText("Moves: Lw'")
  })

  test('Alt turns the whole cube at once', async ({ page }) => {
    const { x, y, quarter } = await setUp(page)
    await page.keyboard.down('Alt')
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x, y + 1.1 * quarter, { steps: 12 })
    await page.waitForTimeout(150)
    await page.mouse.up()
    await page.keyboard.up('Alt')
    await expect(history(page)).toHaveText("Moves: x'")
  })

  test('a held finger on a touch screen turns a wide layer', async ({
    page,
  }) => {
    const { x, y, quarter } = await setUp(page)
    const canvas = page.locator('.cube-3d-canvas')
    const touch = (type: string, clientY: number) =>
      canvas.dispatchEvent(type, {
        pointerId: 7,
        pointerType: 'touch',
        isPrimary: true,
        clientX: x,
        clientY,
        bubbles: true,
      })
    await touch('pointerdown', y)
    await page.waitForTimeout(450)
    await expect(badge(page)).toHaveText(/Wide turn/)
    for (let step = 1; step <= 10; step++)
      await touch('pointermove', y - (1.1 * quarter * step) / 10)
    await page.waitForTimeout(150)
    await touch('pointerup', y - 1.1 * quarter)
    await expect(history(page)).toHaveText("Moves: Lw'")
  })

  test('a long touch hold stays a wide turn', async ({ page }) => {
    const { x, y, quarter } = await setUp(page)
    const canvas = page.locator('.cube-3d-canvas')
    const touch = (type: string, clientY: number) =>
      canvas.dispatchEvent(type, {
        pointerId: 8,
        pointerType: 'touch',
        isPrimary: true,
        clientX: x,
        clientY,
        bubbles: true,
      })
    await touch('pointerdown', y)
    await page.waitForTimeout(950)
    await expect(badge(page)).toHaveText(/Wide turn/)
    for (let step = 1; step <= 10; step++)
      await touch('pointermove', y - (1.1 * quarter * step) / 10)
    await page.waitForTimeout(150)
    await touch('pointerup', y - 1.1 * quarter)
    await expect(history(page)).toHaveText("Moves: Lw'")
  })

  for (const sound of [true, false])
    test(`holding ${sound ? 'sounds' : 'stays silent with the turn sound off'} for a wide turn`, async ({
      page,
      context,
    }) => {
      await context.addCookies([
        {
          name: 'cube-assembler-turn-sound',
          value: sound ? '1' : '0',
          url: `http://127.0.0.1:${process.env.E2E_PORT ?? '4174'}`,
        },
      ])
      await page.addInitScript(() => {
        const tones: number[] = []
        ;(window as unknown as { tones: number[] }).tones = tones
        const Original = window.AudioContext
        window.AudioContext = class extends Original {
          createOscillator() {
            tones.push(0)
            return super.createOscillator()
          }
        }
      })
      const { x, y } = await setUp(page)
      const tones = () =>
        page.evaluate(
          () => (window as unknown as { tones: number[] }).tones.length,
        )
      await page.mouse.move(x, y)
      await page.mouse.down()
      await page.waitForTimeout(450)
      expect(await tones()).toBe(sound ? 1 : 0)
      // No second cue: a longer hold stays a wide turn.
      await page.waitForTimeout(650)
      expect(await tones()).toBe(sound ? 1 : 0)
      await page.mouse.up()
    })

  test('a hold released without a drag turns nothing', async ({ page }) => {
    const { x, y } = await setUp(page)
    const canvas = page.locator('.cube-3d-canvas')
    await page.waitForTimeout(300)
    const still = await canvas.screenshot()
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.waitForTimeout(650)
    await page.mouse.up()
    await page.waitForTimeout(400)
    await expect(history(page)).toHaveText('Moves: None')
    expect((await canvas.screenshot()).equals(still)).toBe(true)
  })
})

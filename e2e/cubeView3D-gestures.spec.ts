// Turning the 3D cube by hand: sticker swipes, wide seam swipes, two
// fingers, the touchpad, pinch zoom, lost pointer capture and turn sounds.
import { expect, test, type Page } from '@playwright/test'
import { swipeFrontFace } from './cubeView3DHelpers'

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

test('on touch, two fingers turn the whole cube on it and rotate the view beside it', async ({
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

  // Two fingers beside the cube rotate the view without changing it.
  const left = bounds.x + 20
  const top = bounds.y + 20
  await touch('pointerdown', 3, left, top)
  await touch('pointerdown', 4, left + 60, top)
  for (let step = 1; step <= 5; step++) {
    await touch('pointermove', 3, left, top + step * 16)
    await touch('pointermove', 4, left + 60, top + step * 16)
  }
  await touch('pointerup', 3, left, top + 80)
  await touch('pointerup', 4, left + 60, top + 80)
  await page.waitForTimeout(300)
  expect((await canvas.screenshot()).equals(afterTurn)).toBe(false)
  await expect(history).toHaveText("Moves: 2L'")
  await expect(notation).toHaveValue(turned)

  // Two fingers on the cube turn the whole cube and record x, y or z.
  await page.getByRole('button', { name: 'Front (F)' }).click()
  await page.waitForTimeout(300)
  await touch('pointerdown', 5, cx - 40, cy)
  await touch('pointerdown', 6, cx + 40, cy)
  for (let step = 1; step <= 8; step++) {
    await touch('pointermove', 5, cx - 40 + step * 15, cy)
    await touch('pointermove', 6, cx + 40 + step * 15, cy)
  }
  await page.waitForTimeout(150)
  await touch('pointerup', 5, cx + 80, cy)
  await touch('pointerup', 6, cx + 160, cy)
  await expect(history).toHaveText(/^Moves: 2L' y'?$/)
  await expect(notation).not.toHaveValue(turned)
})

test('losing touch capture cancels a partial whole-cube turn', async ({
  page,
}) => {
  await page.goto('/')
  await page
    .getByRole('combobox', { name: 'Cube' })
    .selectOption({ label: '5×5' })
  await page.getByRole('button', { name: 'Solved cube' }).click()
  await page.getByRole('button', { name: '3D View' }).click()
  await page.getByRole('button', { name: 'Front (F)' }).click()
  const canvas = page.locator('.cube-3d-canvas')
  const bounds = await canvas.boundingBox()
  if (!bounds) throw new Error('No canvas')
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
  await touch('pointerdown', 1, cx - 30, cy)
  await touch('pointerdown', 2, cx + 30, cy)
  for (let step = 1; step <= 10; step++) {
    await touch('pointermove', 1, cx - 30, cy - step * 10)
    await touch('pointermove', 2, cx + 30, cy - step * 10)
  }
  await page.waitForTimeout(100)
  expect((await canvas.screenshot()).equals(before)).toBe(false)
  await touch('lostpointercapture', 2, cx + 30, cy - 100)
  await touch('lostpointercapture', 1, cx - 30, cy - 100)
  await page.waitForTimeout(500)
  await expect(page.getByRole('status', { name: 'Move history' })).toHaveText(
    'Moves: None',
  )
  expect((await canvas.screenshot()).equals(before)).toBe(true)
})

test('losing mouse capture cancels a partial layer turn', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Solved cube' }).click()
  await page.getByRole('button', { name: '3D View' }).click()
  await page.getByRole('button', { name: 'Front (F)' }).click()
  const canvas = page.locator('.cube-3d-canvas')
  const bounds = await canvas.boundingBox()
  if (!bounds) throw new Error('No canvas')
  await page.waitForTimeout(300)
  const before = await canvas.screenshot()
  const x = bounds.x + bounds.width / 2 - 38
  const y = bounds.y + bounds.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x, y - 40, { steps: 5 })
  await canvas.dispatchEvent('lostpointercapture', {
    pointerId: 1,
    pointerType: 'mouse',
    clientX: x,
    clientY: y - 40,
    bubbles: true,
  })
  await page.waitForTimeout(500)
  await expect(page.getByRole('status', { name: 'Move history' })).toHaveText(
    'Moves: None',
  )
  expect((await canvas.screenshot()).equals(before)).toBe(true)
  await page.mouse.up()
})

test('a quick two-finger flick on the cube turns it once', async ({ page }) => {
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
    /^Moves: x'?$/,
  )
})

test('a two-finger touchpad swipe over the cube turns the whole cube', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Solved cube' }).click()
  const notation = page.getByRole('textbox', { name: 'Notation' })
  const solved = await notation.inputValue()
  await page.getByRole('button', { name: '3D View' }).click()
  await page.getByRole('button', { name: 'Front (F)' }).click()
  const history = page.getByRole('status', { name: 'Move history' })
  const bounds = await page.locator('.cube-3d-canvas').boundingBox()
  if (!bounds) throw new Error('No canvas')
  await page.mouse.move(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
  )
  // A nudge springs back once the swipe ends.
  for (let i = 0; i < 2; i++) await page.mouse.wheel(3, 0)
  await page.waitForTimeout(500)
  await expect(history).toHaveText('Moves: None')
  // A touchpad sends a swipe as pixel wheel deltas: the fingers going left
  // send positive deltaX, and the front goes left with them - y.
  for (let i = 0; i < 12; i++) await page.mouse.wheel(10, 0)
  await expect(history).toHaveText('Moves: y')
  await expect(notation).not.toHaveValue(solved)
})

test("a touchpad swipe's momentum after the fingers lift turns nothing more", async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Solved cube' }).click()
  await page.getByRole('button', { name: '3D View' }).click()
  await page.getByRole('button', { name: 'Front (F)' }).click()
  const history = page.getByRole('status', { name: 'Move history' })
  const bounds = await page.locator('.cube-3d-canvas').boundingBox()
  if (!bounds) throw new Error('No canvas')
  await page.mouse.move(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
  )
  // The fingers move about three quarters of a quarter turn...
  for (const delta of [10, 13, 12, 14, 12, 13, 11, 12, 13, 12, 14, 12])
    await page.mouse.wheel(delta, 0)
  // ...then the touchpad coasts on, a long way if it all counted.
  let delta = 13
  for (let i = 0; i < 30; i++) {
    delta *= 0.92
    await page.mouse.wheel(delta, 0)
  }
  await page.waitForTimeout(600)
  await expect(history).toHaveText('Moves: y')
})

test('a two-finger touchpad swipe beside the cube tilts the view instead of zooming', async ({
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
  // Beside the cube, where two fingers rotate the view.
  const x0 = bounds.x + 60
  await touch('pointerdown', 1, x0 - 30, cy - 75)
  await touch('pointerdown', 2, x0 + 30, cy - 75)
  for (let step = 1; step <= 10; step++) {
    const drift = 1.5 * step
    await touch('pointermove', 1, x0 - 30 - drift / 2, cy - 75 + step * 15)
    await touch('pointermove', 2, x0 + 30 + drift / 2, cy - 75 + step * 15)
  }
  await page.waitForTimeout(200)
  await touch('pointerup', 1, x0 - 37.5, cy + 75)
  await touch('pointerup', 2, x0 + 37.5, cy + 75)
  await page.waitForTimeout(300)
  expect((await canvas.screenshot()).equals(before)).toBe(false)

  // Front resets the orientation but keeps the zoom: same picture, no zoom.
  await front.click()
  await page.waitForTimeout(300)
  expect((await canvas.screenshot()).equals(before)).toBe(true)
})

test.describe('wide sticker drags', () => {
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

  // Starting on the seam between the third and fourth U rows and swiping
  // left: leaning up turns 4Uw, leaning down 3Dw'.
  for (const [lean, move] of [
    [-1, '4Uw'],
    [1, "3Dw'"],
  ] as const)
    test(`a seam swipe leaning ${lean < 0 ? 'up' : 'down'} turns ${move} on a 5x5`, async ({
      page,
    }) => {
      const { x, y, column, quarter } = await setUp(page)
      const startY = y + 0.5 * column
      await page.mouse.move(x, startY)
      await page.mouse.down()
      await page.mouse.move(x - 1.1 * quarter, startY + lean * 0.2 * quarter, {
        steps: 20,
      })
      await expect(badge(page)).toHaveText(/Wide turn/)
      await page.waitForTimeout(150)
      await page.mouse.up()
      await expect(history(page)).toHaveText(`Moves: ${move}`)
    })

  test('a seam swipe reads its lean past the first wobble', async ({
    page,
  }) => {
    const { x, y, column, quarter } = await setUp(page)
    const startY = y + 0.5 * column
    await page.mouse.move(x, startY)
    await page.mouse.down()
    // The hand first drifts down a little, then leans up.
    await page.mouse.move(x - 10, startY + 2, { steps: 2 })
    const lean = Math.tan((12 * Math.PI) / 180)
    for (let step = 1; step <= 20; step++) {
      const dx = ((1.1 * quarter - 10) * step) / 20
      await page.mouse.move(x - 10 - dx, startY + 2 - lean * dx)
    }
    await expect(badge(page)).toHaveText(/Wide turn/)
    await page.waitForTimeout(150)
    await page.mouse.up()
    await expect(history(page)).toHaveText('Moves: 4Uw')
  })

  test("a seam swipe can switch from 4Uw to 3Dw' before it locks", async ({
    page,
  }) => {
    const { x, y, column, quarter } = await setUp(page)
    const startY = y + 0.5 * column
    await page.mouse.move(x, startY)
    await page.mouse.down()
    await page.mouse.move(x - 25, startY - 6, { steps: 3 })
    await expect(badge(page)).toHaveText(/Wide turn/)
    await page.mouse.move(x - 35, startY + 6, { steps: 2 })
    await page.mouse.move(x - 1.1 * quarter, startY + 0.2 * quarter, {
      steps: 20,
    })
    await page.waitForTimeout(150)
    await page.mouse.up()
    await expect(history(page)).toHaveText("Moves: 3Dw'")
  })

  test('a quick second swipe turns its layer too', async ({ page }) => {
    const { x, y, column, quarter } = await setUp(page)
    for (const startY of [y - column, y + column]) {
      await page.mouse.move(x, startY)
      await page.mouse.down()
      for (let step = 1; step <= 10; step++) {
        await page.mouse.move(x - 0.09 * quarter * step, startY)
        await page.waitForTimeout(16)
      }
      await page.waitForTimeout(100)
      await page.mouse.up()
    }
    await expect(history(page)).toHaveText("Moves: 2U 2D'")
  })

  test('a swipe from the middle of a sticker still turns one layer', async ({
    page,
  }) => {
    const { x, y, quarter } = await setUp(page)
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x - 1.1 * quarter, y - 0.1 * quarter, { steps: 20 })
    await page.waitForTimeout(150)
    await page.mouse.up()
    await expect(history(page)).toHaveText('Moves: 3U')
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

  test('a seam swipe on a touch screen turns a wide layer', async ({
    page,
  }) => {
    const { x, y, column, quarter } = await setUp(page)
    const canvas = page.locator('.cube-3d-canvas')
    const startY = y + 0.5 * column
    const touch = (type: string, clientX: number, clientY: number) =>
      canvas.dispatchEvent(type, {
        pointerId: 7,
        pointerType: 'touch',
        isPrimary: true,
        clientX,
        clientY,
        bubbles: true,
      })
    await touch('pointerdown', x, startY)
    for (let step = 1; step <= 20; step++)
      await touch(
        'pointermove',
        x - (1.1 * quarter * step) / 20,
        startY - (0.2 * quarter * step) / 20,
      )
    await expect(badge(page)).toHaveText(/Wide turn/)
    await page.waitForTimeout(150)
    await touch('pointerup', x - 1.1 * quarter, startY - 0.2 * quarter)
    await expect(history(page)).toHaveText('Moves: 4Uw')
  })

  for (const sound of [true, false])
    test(`Shift wide turn ${sound ? 'sounds' : 'stays silent with sound off'}`, async ({
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
      await page.keyboard.down('Shift')
      await page.mouse.move(x, y)
      await page.mouse.down()
      expect(await tones()).toBe(sound ? 1 : 0)
      await page.mouse.up()
      await page.keyboard.up('Shift')
    })

  test('a stationary press does not select a wide turn or move the cube', async ({
    page,
  }) => {
    const { x, y } = await setUp(page)
    const canvas = page.locator('.cube-3d-canvas')
    await page.waitForTimeout(300)
    const still = await canvas.screenshot()
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.waitForTimeout(650)
    await expect(badge(page)).toHaveCount(0)
    await page.mouse.up()
    await page.waitForTimeout(400)
    await expect(history(page)).toHaveText('Moves: None')
    expect((await canvas.screenshot()).equals(still)).toBe(true)
  })
})

// Shared by the 3D view's specs.
import { expect, type Page } from '@playwright/test'

// Drags a sticker left of the front face's middle up by 70 px.
export async function swipeFrontFace(page: Page, dx = -38) {
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

// The renderer sets this after drawing each frame, once turns, camera inertia,
// and auto-rotation have stopped.
export async function waitForCubeIdle(page: Page) {
  const canvas = page.locator('.cube-3d-canvas')
  await canvas.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      }),
  )
  await expect(canvas).toHaveAttribute('data-idle', 'true')
}

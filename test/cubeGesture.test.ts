import { describe, expect, it } from 'vitest'
import { getSwipeLayerTurn, pickCubeSurface } from '../src/client/cubeGesture'

const camera = { width: 600, height: 600, zoom: 12, pitch: 0, yaw: 0, size: 5 }

describe('cube sticker drag', () => {
  it('picks a visible sticker and ignores the background', () => {
    expect(pickCubeSurface(300, 300, camera)?.face).toBe('F')
    expect(
      pickCubeSurface(300, 300, { ...camera, yaw: -Math.PI / 2 })?.face,
    ).toBe('R')
    expect(pickCubeSurface(10, 10, camera)).toBeNull()
  })

  it('turns the inner column touched on a 5x5 face', () => {
    const hit = pickCubeSurface(240, 300, camera)
    expect(hit).not.toBeNull()
    const turn = getSwipeLayerTurn(hit!, 0, -80, camera)
    expect(turn).toMatchObject({ face: 'L', depth: 2, turns: -1 })
  })

  it('turns the row touched on the front face', () => {
    const hit = pickCubeSurface(300, 300, camera)
    const turn = getSwipeLayerTurn(hit!, 80, 0, camera)
    expect(turn).toMatchObject({ face: 'U', depth: 3, turns: -1 })
    expect(getSwipeLayerTurn(hit!, 1, 1, camera)).toBeNull()
  })
})

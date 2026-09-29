import { describe, expect, it } from 'vitest'
import { createSolvedCube } from '../src/cube/cubeAssembly'
import { finishReview } from '../src/client/capture/captureFinalization'
import { solvedCaptureFaces } from '../src/client/capture/captureFlow'
import { STICKER_COLORS } from '../src/client/vision/stickerColorGeometry'
import type { ColorProfile } from '../src/client/profiles/profileSettings'

describe('finishing a reviewed capture', () => {
  const cube = createSolvedCube(3)
  // Six camera photos, every sticker as detection read it.
  const faces = Object.fromEntries(
    Object.entries(solvedCaptureFaces(3)).map(([face, data]) => [
      face,
      { ...data, source: 'camera' as const, detectedColors: data.colors },
    ]),
  )
  const palette = {
    colors: STICKER_COLORS,
    confidentFraction: 0.9,
    recalibrated: true,
  }
  const saved: ColorProfile = {
    id: 'mine',
    name: 'Mine',
    colors: STICKER_COLORS,
    captures: 3,
  }
  const base = {
    cube,
    size: 3,
    faces,
    palette,
    automatic: false,
    autoProfiles: [saved],
    resolvedId: null,
    profiles: [saved],
    selectedId: 'mine',
  }

  it('offers the learned colors and the selected profile to update', () => {
    // Automatic's last preview is known but not in use.
    const outcome = finishReview({ ...base, resolvedId: 'mine' })
    expect(outcome.offer).toMatchObject({
      colors: STICKER_COLORS,
      matchedProfileId: 'mine',
      evidence: { reviewedValid: true, cameraOnly: true, recalibrated: true },
    })
    // Only Automatic records a match.
    expect(outcome.autoMatchId).toBeNull()
  })

  it('lets Automatic record the saved profile it resolved to', () => {
    const outcome = finishReview({
      ...base,
      automatic: true,
      resolvedId: 'mine',
      selectedId: 'other',
    })
    expect(outcome.autoMatchId).toBe('mine')
    expect(outcome.offer?.matchedProfileId).toBe('mine')
  })

  it('learns nothing from a cube that fails its parity check', () => {
    const broken = { ...cube, u: [...cube.u], r: [...cube.r] }
    ;[broken.u[0], broken.r[0]] = [broken.r[0], broken.u[0]]
    const outcome = finishReview({
      ...base,
      cube: broken,
      automatic: true,
      resolvedId: 'mine',
    })
    expect(outcome).toEqual({ offer: null, autoMatchId: null })
  })

  it('learns nothing from faces that did not all come from the camera', () => {
    const outcome = finishReview({
      ...base,
      faces: { ...faces, U: { ...faces.U, source: 'fixture' } },
      automatic: true,
      resolvedId: 'mine',
    })
    expect(outcome).toEqual({ offer: null, autoMatchId: null })
  })
})

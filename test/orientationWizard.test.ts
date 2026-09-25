import { describe, expect, it } from 'vitest'
import { orientationFreeSignature, solveFaceOrientations, type FaceKey, type OrientedCandidate } from '../src/client/cubeAssembly'
import { faceContentKey, groupWizardOptions, pickWizardFace } from '../src/client/orientationWizard'

const grid = (rows: string) => rows.split('/').map((row) => row.trim().split(' '))

// Answers every question the way `truth` looks, as a customer would.
function answer(remaining: OrientedCandidate[], truth: Record<FaceKey, string[][]>) {
  const asked: FaceKey[] = []
  for (let face = pickWizardFace(remaining); face; face = pickWizardFace(remaining)) {
    asked.push(face)
    const option = groupWizardOptions(remaining, face).find((o) => faceContentKey(o.grid) === faceContentKey(truth[face]))
    if (!option) return { asked, result: null }
    remaining = option.candidates
  }
  return { asked, result: remaining[0] }
}

describe('orientation wizard', () => {
  // A pattern cube whose back face (four white corners) fits either way
  // up: both are legal cubes, so the photos cannot tell - only asking can.
  const shown = {
    U: grid('G W G / O W O / B Y B'), L: grid('O B R / W O Y / O B R'), F: grid('Y G Y / O G O / Y G Y'),
    R: grid('O G R / W R Y / O G R'), B: grid('W R W / B B B / W R W'), D: grid('G W G / R Y R / B Y B'),
  } as Record<FaceKey, string[][]>
  const truth = { ...shown, B: grid('W B W / R B R / W B W') }
  const alternatives = solveFaceOrientations(shown)!.alternatives

  it('asks about a face that fits either way and ends on the real cube', () => {
    const { asked, result } = answer(alternatives, truth)
    expect(asked).toContain('B')
    expect(faceContentKey(result!.faces.B)).toBe(faceContentKey(truth.B))
  })

  it('would fill that face in wrongly without the turned-down suggestion', () => {
    // Why "No, let me choose each side" keeps every arrangement.
    const withoutSuggestion = alternatives.filter((c) => orientationFreeSignature(c.faces) !== orientationFreeSignature(truth))
    const { asked, result } = answer(withoutSuggestion, truth)
    expect(asked).not.toContain('B')
    expect(faceContentKey(result!.faces.B)).not.toBe(faceContentKey(truth.B))
  })
})

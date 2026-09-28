import { describe, expect, it } from 'vitest'
import {
  CAPTURE_STEPS,
  FACE_DISPLAY_LABEL,
  FACE_ORDER,
  FACE_SHORT_LABEL,
  captureInstruction,
  describeCenterIssue,
  glareFacesToWarn,
} from '../src/client/captureSteps'
import { GLARE_WARNING_STICKERS } from '../src/client/imageProcessing'

describe('capture steps', () => {
  it('labels each capture slot with its step', () => {
    expect(FACE_ORDER.map((face) => FACE_DISPLAY_LABEL[face])).toEqual(
      CAPTURE_STEPS.map((step) => step.label),
    )
    expect(FACE_SHORT_LABEL.D).toBe('4')
    expect(FACE_DISPLAY_LABEL.B).toBe('Bottom')
  })

  it('turns the other way and swaps top and bottom in a mirrored view', () => {
    expect(captureInstruction(0, true)).toBe(CAPTURE_STEPS[0].instruction)
    expect(captureInstruction(1, false)).toBe(CAPTURE_STEPS[1].instruction)
    expect(captureInstruction(1, true)).toContain('counterclockwise')
    expect(captureInstruction(4, true)).toContain('shows the bottom face')
    expect(captureInstruction(5, true)).toContain('shows the top face')
  })

  it('describes center issues by step name', () => {
    expect(describeCenterIssue({ kind: 'same-center', photos: [0, 2] })).toBe(
      'Side 1 and Side 3 show the same center - the same face photographed twice?',
    )
    expect(describeCenterIssue({ kind: 'turned-twice', photo: 2 })).toContain(
      'Side 3 shows the face opposite Side 2',
    )
  })

  it('warns about glare only once enough stickers are washed out', () => {
    const few = Array.from({ length: GLARE_WARNING_STICKERS - 1 }, () => ({
      face: 'R',
    }))
    expect(glareFacesToWarn(few)).toEqual([])
    expect(glareFacesToWarn([...few, { face: 'U' }])).toEqual(['U', 'R'])
  })
})

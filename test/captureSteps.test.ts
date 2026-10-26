import { describe, expect, it } from 'vitest'
import {
  CAPTURE_STEPS,
  FACE_DISPLAY_LABEL,
  FACE_ORDER,
  FACE_SHORT_LABEL,
  captureInstruction,
  describeCenterIssue,
  glareFacesToWarn,
  stickerMark,
  turnHintArrowAngle,
} from '../src/client/capture/captureSteps'
import { GLARE_WARNING_STICKERS } from '../src/client/vision/stickerLearning'

describe('capture steps', () => {
  it('labels each capture slot with its step', () => {
    expect(FACE_ORDER.map((face) => FACE_DISPLAY_LABEL[face])).toEqual(
      CAPTURE_STEPS.map((step) => step.label),
    )
    expect(FACE_SHORT_LABEL.D).toBe('4')
    expect(FACE_DISPLAY_LABEL.B).toBe('Bottom')
  })

  it('gives the same instruction with or without Mirror', () => {
    // The cube is turned the same way in the same order either way.
    expect(captureInstruction.length).toBe(1)
    CAPTURE_STEPS.forEach((step, i) => {
      expect(captureInstruction(i)).toBe(step.instruction)
      expect(step.instruction).not.toMatch(/mirror/i)
    })
    // The arrow always points the same way on screen, so side turns are
    // described by the picture, never by a physical direction.
    ;[1, 2, 3].forEach((i) => {
      expect(CAPTURE_STEPS[i].instruction).not.toMatch(/clockwise/i)
      expect(CAPTURE_STEPS[i].instruction).toMatch(/arrow.*picture/i)
    })
  })

  it('paints the turn hint arrow left, then up for both tips', () => {
    expect([1, 2, 3].map(turnHintArrowAngle)).toEqual([270, 270, 270])
    expect(turnHintArrowAngle(4)).toBe(0)
    expect(turnHintArrowAngle(5)).toBe(0)
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

describe('sticker marks', () => {
  it('marks a sticker the colors were changed on as corrected', () => {
    expect(stickerMark('R', 'O', 0.9, null)).toBe('corrected')
  })

  it('flags low confidence and lookalikes, whatever the confidence', () => {
    expect(stickerMark('R', 'R', 0.4, null)).toBe('flagged')
    expect(stickerMark('R', 'R', 0.9, 'O')).toBe('flagged')
    expect(stickerMark(undefined, 'R', 0.88, 'O')).toBe('flagged')
  })

  it('leaves a confident, clear sticker alone', () => {
    expect(stickerMark('R', 'R', 0.9, null)).toBeNull()
    expect(stickerMark(undefined, 'R', 0.5, undefined)).toBeNull()
  })
})

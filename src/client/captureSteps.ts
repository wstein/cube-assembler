import { GLARE_WARNING_STICKERS } from './imageProcessing'
import type { GuidedCenterIssue } from '../cube/cubeAssembly'

export const FACE_ORDER = ['U', 'R', 'F', 'D', 'L', 'B']

// Guided capture: the 4 sides in turn while the cube is turned a quarter
// turn at a time (either way, same row kept on top), then top and bottom
// (see solveGuidedCapture). Which physical face is which isn't known until
// all 6 are in, so the capture slots keep the neutral U..B keys of
// FACE_ORDER (fixtures, uploads and the review key off them) and only
// their meaning is a step in this order - slot U is Side 1, R Side 2, ...
export const CAPTURE_STEPS: Array<{
  label: string
  short: string
  instruction: string
}> = [
  {
    label: 'Side 1',
    short: '1',
    instruction: 'Hold the cube upright and show any side.',
  },
  {
    label: 'Side 2',
    short: '2',
    instruction:
      'Keep the same row on top and turn the whole cube clockwise a quarter turn. Either way works.',
  },
  {
    label: 'Side 3',
    short: '3',
    instruction:
      'Keep turning clockwise another quarter turn. Other directions still work.',
  },
  {
    label: 'Side 4',
    short: '4',
    instruction:
      'Turn clockwise one more quarter turn. Any remaining side still works.',
  },
  {
    label: 'Top',
    short: '5',
    instruction:
      'Tip the cube towards you so its top faces the camera - any angle is fine.',
  },
  {
    label: 'Bottom',
    short: '6',
    instruction:
      'Bring Side 4 back to the camera, then continue tipping to the opposite face. Top and bottom may be swapped.',
  },
]
const stepOf = (slot: string) => CAPTURE_STEPS[FACE_ORDER.indexOf(slot)]

export function captureInstruction(step: number, mirrored: boolean): string {
  if (!mirrored || step === 0) return CAPTURE_STEPS[step].instruction
  if (step === 4)
    return 'Tip the cube towards you so its top faces the camera. The mirrored view shows the bottom face.'
  if (step === 5)
    return 'Bring Side 4 back to the camera, then continue tipping to the opposite face. The mirrored view shows the top face.'
  if (step === 1)
    return 'Keep the same row on top and turn the whole cube counterclockwise in the mirrored view. Either direction works.'
  if (step === 2)
    return 'Keep turning counterclockwise in the mirrored view. Other directions still work.'
  return 'Turn counterclockwise in the mirrored view one more quarter turn. Any remaining side still works.'
}

// Saved with fixtures captured this way, so they can be put together (and
// regression-tested) with the guided search again later.
export const GUIDED_PROTOCOL = 'sides-then-top-bottom/v1'

// A capture mistake read from odd-size centers (see checkGuidedCenters),
// in words; photo indexes are capture steps.
export function describeCenterIssue(issue: GuidedCenterIssue): string {
  const label = (i: number) => CAPTURE_STEPS[i].label
  switch (issue.kind) {
    case 'same-center':
      return `${label(issue.photos[0])} and ${label(issue.photos[1])} show the same center - the same face photographed twice?`
    case 'turned-twice':
      return `${label(issue.photo)} shows the face opposite ${label(issue.photo - 1)} - the cube was probably turned twice.`
    case 'not-opposite':
      return `${label(issue.photos[0])} and ${label(issue.photos[1])} should be opposite faces, but aren't.`
  }
}

export const FACE_DISPLAY_LABEL: Record<string, string> = Object.fromEntries(
  FACE_ORDER.map((face) => [face, stepOf(face).label]),
)

// The faces to name in the glare warning, or none if too few stickers are
// washed out to warn about.
export function glareFacesToWarn(glare: Array<{ face: string }>): string[] {
  if (glare.length < GLARE_WARNING_STICKERS) return []
  return FACE_ORDER.filter((face) =>
    glare.some((sticker) => sticker.face === face),
  )
}
export const FACE_SHORT_LABEL: Record<string, string> = Object.fromEntries(
  FACE_ORDER.map((face) => [face, stepOf(face).short]),
)

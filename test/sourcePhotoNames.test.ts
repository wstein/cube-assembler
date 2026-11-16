import { expect, it } from 'vitest'
import { sourcePhotoNames } from '../src/core/capture/CaptureSteps.gen'
import {
  photoNames,
  photoNamesForProtocol,
  repeatedText,
  repeatedTextForProtocol,
} from '../src/core/capture/CaptureDiagnosis.gen'
const v2 = 'sides-then-top-bottom/v2'
const v1 = 'sides-then-top-bottom/v1'
it('uses versioned capture-source names without rewriting legacy or unknown provenance', () => {
  expect(sourcePhotoNames(v2)).toEqual([
    'Side 1',
    'Side 2',
    'Side 3',
    'Side 4',
    'Bottom',
    'Top',
  ])
  expect(sourcePhotoNames(v1)).toEqual([
    'Side 1',
    'Side 2',
    'Side 3',
    'Side 4',
    'Top',
    'Bottom',
  ])
  expect(sourcePhotoNames(null)).toEqual([
    'Photo 1',
    'Photo 2',
    'Photo 3',
    'Photo 4',
    'Photo 5',
    'Photo 6',
  ])
  expect(sourcePhotoNames('unrecognized/v9')).toEqual(sourcePhotoNames(null))
  expect(photoNames).toEqual(sourcePhotoNames(v1))
})
it('describes repeated photos with the same versioned labels while retaining the legacy API', () => {
  const diagnosis = {
    repeatsChecked: true,
    repeated: [
      [3, 4],
      [4, 5],
    ] as [number, number][],
    weakest: null,
    cause: 'repeat',
  }
  expect(photoNamesForProtocol(v2)).toEqual(sourcePhotoNames(v2))
  expect(repeatedTextForProtocol(diagnosis, v2)).toBe(
    'Side 4 and Bottom; Bottom and Top',
  )
  expect(repeatedTextForProtocol(diagnosis, v1)).toBe(
    'Side 4 and Top; Top and Bottom',
  )
  expect(repeatedTextForProtocol(diagnosis, null)).toBe(
    'Photo 4 and Photo 5; Photo 5 and Photo 6',
  )
  expect(repeatedText(diagnosis)).toBe('Side 4 and Top; Top and Bottom')
  expect(repeatedTextForProtocol({ ...diagnosis, repeated: [] }, v2)).toBe(
    'none',
  )
})

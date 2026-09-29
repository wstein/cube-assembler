// Choosing capture photos to upload: typed entry point for
// src/core/capture/PhotoUpload.res.
import {
  isNamedFaceCrop as isNamedFaceCropRes,
  photoReadModes as photoReadModesRes,
  photoUploadOrder,
  uploadKind as uploadKindRes,
} from '../../core/capture/PhotoUpload.gen'

interface PhotoFile {
  name: string
  type: string
  size: number
}

// Archives are expanded first. Metadata selects fixture loading; otherwise
// the files use the six-photo capture flow.
export function uploadKind(
  files: Array<{ name: string }>,
): 'fixture' | 'photos' {
  return uploadKindRes(files)
}

export function isNamedFaceCrop(name: string): boolean {
  return isNamedFaceCropRes(name)
}

export type PhotoFrameMode = 'auto' | 'cropped' | 'full'

export interface SelectedPhoto {
  file: File
  url: string
  mode: PhotoFrameMode
}

export function photoReadModes(
  name: string,
  mode: PhotoFrameMode,
  captureMode: 'cv' | 'guide' = 'cv',
): Array<'aligned' | 'fixed' | 'cropped'> {
  return photoReadModesRes(name, mode, captureMode)
}

// A fixture's six face-*.jpg files have an unambiguous slot order. Other
// photos keep the picker's order so the user can inspect and rearrange
// them. Throws when the files aren't six nonempty images.
export function orderPhotoUploads<T extends PhotoFile>(files: T[]): T[] {
  const result = photoUploadOrder(files)
  if (result.TAG === 'invalid') throw new Error(result.message)
  return result.order.map((index) => files[index])
}

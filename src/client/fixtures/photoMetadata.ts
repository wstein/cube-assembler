// What a photo file says about itself - the fingerprint of a synthetic photo
// and a camera photo's EXIF - read from its bytes; see
// src/core/capture/PhotoMetadata.res.
import {
  embedFingerprint,
  readExif,
  readFingerprint,
  type exif,
} from '../../core/capture/PhotoMetadata.gen'

export { embedFingerprint, readExif, readFingerprint }
export type CameraExif = exif

export interface PhotoInfo {
  fingerprint?: Record<string, unknown>
  exif?: CameraExif
}

// What a picked photo file says about itself, read from the file's own bytes
// (a canvas would drop it). Undefined when it says nothing; a fingerprint
// that is not a JSON object counts as none.
export async function readPhotoInfo(
  file: Blob,
): Promise<PhotoInfo | undefined> {
  const data = new Uint8Array(await file.arrayBuffer())
  const info: PhotoInfo = {}
  const text = readFingerprint(data)
  if (text !== undefined) {
    try {
      const parsed: unknown = JSON.parse(text)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
        info.fingerprint = parsed as Record<string, unknown>
    } catch {
      // Not a fingerprint after all.
    }
  }
  const exif = readExif(data)
  if (exif) info.exif = exif
  return info.fingerprint || info.exif ? info : undefined
}

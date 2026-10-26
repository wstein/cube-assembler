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

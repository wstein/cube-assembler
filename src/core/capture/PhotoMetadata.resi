@genType type bytes = Uint8Array.t

@genType
type exif = {
  make?: string,
  model?: string,
  orientation?: int,
  exposureTime?: float,
  fNumber?: float,
  iso?: int,
  focalLength?: float,
  whiteBalance?: string,
  dateTime?: string,
}

// The generator's fingerprint (JSON text) in a JPEG comment, if the photo
// has one.
@genType let readFingerprint: bytes => option<string>

// The photo with `json` as its fingerprint, replacing an earlier one. Throws
// when the bytes are no JPEG or the text does not fit a comment segment.
@genType let embedFingerprint: (bytes, string) => bytes

// The camera data of a photo's EXIF block, if it has any.
@genType let readExif: bytes => option<exif>

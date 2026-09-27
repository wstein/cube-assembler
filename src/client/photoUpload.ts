const FACE_ORDER = ['u', 'r', 'f', 'd', 'l', 'b']
const FACE_CROP = /^face-([urfdlb])\.(?:jpe?g|png)$/i

interface PhotoFile {
  name: string
  type: string
  size: number
}

export function isNamedFaceCrop(name: string): boolean {
  return FACE_CROP.test(name)
}

// A fixture's six face-*.jpg files have an unambiguous slot order. Other
// photos keep the picker's order so the user can inspect and rearrange them.
export function orderPhotoUploads<T extends PhotoFile>(files: T[]): T[] {
  if (files.length !== 6) throw new Error('Choose six photos, one per face.')
  if (
    files.some(
      (file) =>
        file.size <= 0 ||
        !(file.type
          ? file.type.startsWith('image/')
          : /\.(?:jpe?g|png|webp)$/i.test(file.name)),
    )
  ) {
    throw new Error('Choose six nonempty images.')
  }
  const named = files.map((file) =>
    FACE_CROP.exec(file.name)?.[1].toLowerCase(),
  )
  if (named.every(Boolean) && new Set(named).size === 6)
    return FACE_ORDER.map((face) => files[named.indexOf(face)])
  return files
}

import { useEffect, useRef, useState } from 'preact/hooks'
import {
  orderPhotoUploads,
  type PhotoFrameMode,
  type SelectedPhoto,
} from './photoUpload'

// Six selected photos waiting to be read as one capture, in capture order,
// with their preview URLs released when they are dropped.
export function usePhotoUploads() {
  const [photoUpload, setPhotoUpload] = useState<SelectedPhoto[] | null>(null)
  const photoUploadUrls = useRef<string[]>([])
  useEffect(
    () => () =>
      photoUploadUrls.current.forEach((url) => URL.revokeObjectURL(url)),
    [],
  )

  const closePhotoUpload = () => {
    photoUploadUrls.current.forEach((url) => URL.revokeObjectURL(url))
    photoUploadUrls.current = []
    setPhotoUpload(null)
  }

  // Throws when the files can't be ordered as six capture photos.
  const selectPhotos = (files: File[]) => {
    const ordered = orderPhotoUploads(files)
    closePhotoUpload()
    const selected = ordered.map((file) => ({
      file,
      url: URL.createObjectURL(file),
      mode: 'auto' as const,
    }))
    photoUploadUrls.current = selected.map(({ url }) => url)
    setPhotoUpload(selected)
  }

  const changePhotoUploadMode = (index: number, mode: PhotoFrameMode) => {
    setPhotoUpload(
      (current) =>
        current?.map((entry, position) =>
          position === index ? { ...entry, mode } : entry,
        ) ?? null,
    )
  }

  const movePhotoUpload = (index: number, direction: -1 | 1) => {
    setPhotoUpload((current) => {
      if (!current) return current
      const ordered = [...current]
      ;[ordered[index], ordered[index + direction]] = [
        ordered[index + direction],
        ordered[index],
      ]
      return ordered
    })
  }

  return {
    photoUpload,
    selectPhotos,
    closePhotoUpload,
    changePhotoUploadMode,
    movePhotoUpload,
  }
}

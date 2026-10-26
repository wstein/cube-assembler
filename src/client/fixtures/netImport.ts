// A picture of a cube net as the six face pictures the photo upload reads: the
// net is read in src/core/vision/NetImage.res, each face is cut out of it and
// named like a saved fixture's face-<u|r|f|d|l|b>.png, so the upload takes them
// for cropped faces in order.
import { readNetImage } from '../../core/vision/NetImage.gen'

const FACE_FILES = ['u', 'r', 'f', 'd', 'l', 'b']
const IMAGE_NAME = /\.(?:jpe?g|png|webp|gif|bmp)$/i

export type NetSplit =
  | { ok: true; size: number; files: File[] }
  | { ok: false; message: string }

// Whether the upload is one picture: the one case that may be a net.
export function isSinglePicture(files: Array<{ name: string; type: string }>) {
  return (
    files.length === 1 &&
    (files[0].type.startsWith('image/') || IMAGE_NAME.test(files[0].name))
  )
}

function toPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('No PNG made'))),
      'image/png',
    ),
  )
}

export async function splitNetPicture(file: File): Promise<NetSplit> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    return { ok: false, message: `Could not open ${file.name} as a picture.` }
  }
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return { ok: false, message: 'No canvas to read the picture.' }
  context.drawImage(bitmap, 0, 0)
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
  const read = readNetImage(pixels.data, canvas.width, canvas.height)
  if (read.TAG !== 'read') return { ok: false, message: read.message }
  const files = await Promise.all(
    read.faces.map(async (box, i) => {
      const face = document.createElement('canvas')
      face.width = box.width
      face.height = box.height
      face
        .getContext('2d')
        ?.drawImage(
          canvas,
          box.x,
          box.y,
          box.width,
          box.height,
          0,
          0,
          box.width,
          box.height,
        )
      return new File([await toPng(face)], `face-${FACE_FILES[i]}.png`, {
        type: 'image/png',
      })
    }),
  )
  return { ok: true, size: read.size, files }
}

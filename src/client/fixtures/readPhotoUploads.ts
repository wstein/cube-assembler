import { validateFaceColors } from '../../cube/cubeAssembly'
import type { FaceCaptureData } from '../capture/captureTypes'
import { estimateOuterCellRatio } from '../vision/gridAlignment'
import {
  captureAndProcessImage,
  hasPlausibleStickerFace,
  redetectFaceColors,
  type FaceCaptureResult,
} from '../vision/faceDetection'
import { NEUTRAL_GAINS } from '../vision/colorMath'
import {
  type ColorDetectionResult,
  type RGB,
  type SamplingGeometry,
} from '../vision/stickerColorGeometry'
import { photoReadModes, type SelectedPhoto } from './photoUpload'

interface ReadPhotoUploadsOptions {
  photos: SelectedPhoto[]
  size: number
  captureMode: 'cv' | 'guide'
  sampling: SamplingGeometry
  palette?: Record<string, RGB>
  faceOrder: readonly string[]
}

export async function readPhotoUploads({
  photos,
  size,
  captureMode,
  sampling,
  palette: selectedPalette,
  faceOrder,
}: ReadPhotoUploadsOptions): Promise<Record<string, FaceCaptureData>> {
  const entries: Record<string, FaceCaptureData> = {}
  for (const [index, { file, url, mode }] of photos.entries()) {
    const image = new Image()
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error(`Could not open ${file.name}`))
      image.src = url
    })
    const readCrop = async () => {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = () => reject(new Error(`Could not read ${file.name}`))
        reader.readAsDataURL(file)
      })
      return {
        ...(await redetectFaceColors(
          dataUrl,
          size,
          NEUTRAL_GAINS,
          sampling,
          selectedPalette,
        )),
        croppedImage: dataUrl,
        backgroundColor: null,
      }
    }
    let result: ColorDetectionResult & {
      croppedImage: string
      backgroundColor: RGB | null
      frame?: FaceCaptureResult['frame']
      crop?: FaceCaptureResult['crop']
      sharpness?: number
    }
    const modes = photoReadModes(file.name, mode, captureMode)
    const firstMode = modes[0]
    if (firstMode === 'cropped') {
      result = await readCrop()
    } else {
      try {
        result = captureAndProcessImage(
          image,
          size,
          NEUTRAL_GAINS,
          sampling,
          selectedPalette,
          firstMode,
        )
      } catch (err) {
        const square =
          Math.abs(image.naturalWidth - image.naturalHeight) /
            Math.max(image.naturalWidth, image.naturalHeight) <
          0.08
        let looksCropped = square
        if (!looksCropped && modes.length > 1) {
          const canvas = document.createElement('canvas')
          const scale = Math.min(
            1,
            512 / Math.max(image.naturalWidth, image.naturalHeight),
          )
          canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
          canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
          const context = canvas.getContext('2d', {
            willReadFrequently: true,
          })
          if (context) {
            context.drawImage(image, 0, 0, canvas.width, canvas.height)
            const pixels = context.getImageData(
              0,
              0,
              canvas.width,
              canvas.height,
            )
            const outerCellRatio = estimateOuterCellRatio(
              pixels.data,
              canvas.width,
              canvas.height,
              size,
            )
            looksCropped = hasPlausibleStickerFace(
              pixels.data,
              canvas.width,
              canvas.height,
              size,
              outerCellRatio,
            )
          }
        }
        if (
          modes.length < 2 ||
          !looksCropped ||
          !(err instanceof Error) ||
          !err.message.startsWith('No aligned face found')
        )
          throw err
        result = await readCrop()
      }
    }
    if (!validateFaceColors(result.colors, size))
      throw new Error(
        `${file.name} could not be read as a ${size}×${size} face.`,
      )
    entries[faceOrder[index]] = {
      colors: result.colors,
      detectedColors: result.colors,
      cellColors: result.cellColors,
      cellConfidences: result.cellConfidences,
      cellLookalikes: result.cellLookalikes,
      confidence: result.confidence,
      croppedImage: result.croppedImage,
      backgroundColor: result.backgroundColor,
      frame: result.frame,
      crop: result.crop,
      sharpness: result.sharpness,
      source: 'image-file',
      timestamp: Date.now() + index,
    }
  }
  return entries
}

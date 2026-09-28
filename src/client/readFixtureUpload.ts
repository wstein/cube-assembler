import { validateFaceColors } from '../cube/cubeAssembly'
import type { AutomaticResolution } from './colorProfileLearning'
import type { FaceCaptureData, PreviewColorProfile } from './captureTypes'
import { readFixtureColors } from './fixtureFormat'
import type { RGB, SamplingGeometry } from './imageProcessing'
import type { UsedColorProfile } from './profileSettings'

export interface FixtureUploadMetadata {
  gridSize: number
  colorsURFDLB?: string
  faces: Record<
    string,
    {
      photo: string
      capturedAt?: string
      background?: RGB | null
      previewColorProfile?: PreviewColorProfile
    } & Record<string, unknown>
  >
  capture?: {
    backgroundWhiteBalance?: Record<string, RGB> | null
    backgroundWhiteBalanceMethod?: string
    sampling?: SamplingGeometry
    profile?: { id?: string; name?: string } | null
    colorProfile?: UsedColorProfile | null
    colorResolution?: {
      reason: AutomaticResolution['reason']
      nearest?: Array<{ id: string; name: string; fit: number }>
    } | null
    colorReference?: Record<string, RGB> | null
    protocol?: string | null
  }
}

type FixtureUploadRead =
  | {
      ok: true
      meta: FixtureUploadMetadata
      entries: Record<string, FaceCaptureData>
    }
  | { ok: false; message: string }

// Parse the fixture and load its six original photos. The app applies its
// current color analysis and review choices after these files are validated.
export async function readFixtureUpload(
  files: File[],
): Promise<FixtureUploadRead> {
  const metaFile = files.find((file) =>
    file.name.toLowerCase().endsWith('.json'),
  )
  if (!metaFile)
    return {
      ok: false,
      message:
        "❌ No .json file found - select a fixture zip, or a fixture's meta.json together with its 6 face-*.jpg photos.",
    }

  let meta: FixtureUploadMetadata
  try {
    meta = JSON.parse(await metaFile.text())
  } catch {
    return { ok: false, message: `❌ ${metaFile.name} is not valid JSON.` }
  }

  const colorGrids = readFixtureColors(meta)?.colors ?? null
  if (!meta.faces || typeof meta.gridSize !== 'number' || !colorGrids)
    return {
      ok: false,
      message: `❌ ${metaFile.name} doesn't look like a saved fixture (missing gridSize, faces or their colors).`,
    }

  const photoFiles = files.filter((file) => file !== metaFile)
  const entries: Record<string, FaceCaptureData> = {}
  const missing: string[] = []
  for (const [face, faceData] of Object.entries(meta.faces)) {
    const photoFile = photoFiles.find((file) => file.name === faceData.photo)
    const colors = colorGrids[face.toUpperCase()]
    if (!photoFile || !colors || !validateFaceColors(colors, meta.gridSize)) {
      missing.push(face.toUpperCase())
      continue
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () =>
        reject(new Error(`Could not read ${photoFile.name}`))
      reader.readAsDataURL(photoFile)
    })
    entries[face.toUpperCase()] = {
      colors,
      confidence: 1,
      croppedImage: dataUrl,
      source: 'fixture',
      timestamp: faceData.capturedAt
        ? Date.parse(faceData.capturedAt) || Date.now()
        : Date.now(),
      ...(faceData.background && { backgroundColor: faceData.background }),
      ...(faceData.previewColorProfile?.id &&
        faceData.previewColorProfile.name &&
        faceData.previewColorProfile.colors && {
          previewColorProfile: faceData.previewColorProfile,
        }),
    }
  }

  if (missing.length > 0)
    return {
      ok: false,
      message: `❌ Missing or invalid photo/colors for face${missing.length === 1 ? '' : 's'} ${missing.join(', ')} - make sure all 6 face-*.jpg files named in ${metaFile.name} are selected too.`,
    }

  return { ok: true, meta, entries }
}

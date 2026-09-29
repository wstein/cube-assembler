// Loading an uploaded fixture's files; what its meta.json says is decided
// in src/core/capture/FixtureUpload.res.
import { planFixtureUpload } from '../../core/capture/FixtureUpload.gen'
import type { AutomaticResolution } from '../profiles/colorProfileLearning'
import type {
  FaceCaptureData,
  PreviewColorProfile,
} from '../capture/captureTypes'
import type { RGB, SamplingGeometry } from '../vision/stickerColorGeometry'
import type { UsedColorProfile } from '../profiles/profileSettings'

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

  const photoFiles = files.filter((file) => file !== metaFile)
  const plan = planFixtureUpload(
    meta,
    metaFile.name,
    photoFiles.map((file) => file.name),
    Date.now(),
  )
  if (!plan.ok) return { ok: false, message: plan.message }

  const entries: Record<string, FaceCaptureData> = {}
  for (const { face, photo, ...entry } of plan.faces) {
    const photoFile = photoFiles.find((file) => file.name === photo)!
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () =>
        reject(new Error(`Could not read ${photoFile.name}`))
      reader.readAsDataURL(photoFile)
    })
    entries[face] = {
      ...(entry as Pick<
        FaceCaptureData,
        'colors' | 'timestamp' | 'backgroundColor' | 'previewColorProfile'
      >),
      confidence: 1,
      croppedImage: dataUrl,
      source: 'fixture',
    }
  }
  return { ok: true, meta, entries }
}

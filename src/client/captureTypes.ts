import type { FaceCaptureResult, RGB } from './imageProcessing'

export interface PreviewColorProfile {
  id: string
  name: string
  colors: Record<string, RGB>
}

// The camera's settings at capture time, as the browser reports them.
export type CameraSettings = Partial<MediaTrackSettings>

export interface FaceCaptureData {
  colors: string[][]
  // What automatic detection produced for this face, kept alongside
  // `colors` (the final answer, possibly human-corrected) so the review
  // wizard can mark every sticker where the two disagree. Absent when there
  // was no detection at all (manual facelet input).
  detectedColors?: string[][]
  cellConfidences?: number[][]
  cellColors?: RGB[][]
  // Per sticker, the other color it sits close to the boundary with, or
  // null - see ColorDetectionResult.cellLookalikes.
  cellLookalikes?: (string | null)[][]
  confidence: number
  croppedImage?: string
  // Live-sampled at capture time from the area around the cube (see
  // extractBackgroundColor) - null when unavailable (frame too small, or
  // the backdrop read back unreliably dark). Used to derive a per-face
  // cross-face correction gain once all 6 faces are in; see
  // computeBackgroundGains.
  backgroundColor?: RGB | null
  // Capture context saved with fixtures - see FaceCaptureResult. The camera
  // settings are read at the moment of capture since exposure and white
  // balance can drift between faces. All absent for uploaded fixtures.
  frame?: FaceCaptureResult['frame']
  crop?: FaceCaptureResult['crop']
  sharpness?: number
  cameraSettings?: CameraSettings
  // The color profile that read this face at capture time: Automatic's
  // preview choice (or the selected profile); absent when none was used.
  previewColorProfile?: PreviewColorProfile
  // Where the photo came from: the live camera, an imported image file, or
  // an uploaded fixture. Absent for faces without a photo (manual input).
  source?: 'camera' | 'image-file' | 'fixture'
  outOfOrder?: boolean
  timestamp: number
}

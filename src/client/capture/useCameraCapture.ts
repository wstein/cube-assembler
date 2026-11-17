import type { CaptureIO } from './captureIO'
import { useState } from 'preact/hooks'
import { captureCameraPhoto, importCapturePhoto } from './capturePhoto'
import { FACE_ORDER } from './captureSteps'
import type { ColorDetectionResult } from '../vision/stickerColorGeometry'
import { withoutDeviceIds, type useCameraStream } from './useCameraStream'
import type { useCaptureFeedback } from './useCaptureFeedback'
import type { useCaptureSession } from './useCaptureSession'
import { useLiveCaptureAnalysis } from './useLiveCaptureAnalysis'
import type { useProfileStore } from '../profiles/useProfileStore'
import type { useScannerPreferences } from '../useScannerPreferences'

type Session = ReturnType<typeof useCaptureSession>
type Profiles = ReturnType<typeof useProfileStore>
type Preferences = ReturnType<typeof useScannerPreferences>

interface CameraCaptureOptions {
  captureIO: CaptureIO
  webcamOpen: boolean
  loading: boolean
  setLoading: (value: boolean) => void
  turnOverlay: Session['turnOverlay']
  webcamFace: string
  puzzleSize: number
  captureMode: Preferences['captureMode']
  sampling: Profiles['sampling']
  palette: Profiles['palette']
  autoColorProfiles: Profiles['autoColorProfiles']
  automaticColors: Profiles['automaticColors']
  provisionalColorProfile: Profiles['provisionalColorProfile']
  autoCapture: boolean
  stableFrames: number
  capturedFaces: Session['capturedFaces']
  webcamRef: ReturnType<typeof useCameraStream>['videoRef']
  lastCaptureAt: Session['lastCaptureAt']
  pendingFlyIn: Session['pendingFlyIn']
  setCaptureMessage: Session['setCaptureMessage']
  signalCapture: ReturnType<typeof useCaptureFeedback>['signalCapture']
  applyFaceCapture: Session['applyFaceCapture']
  previewProfileFor: Profiles['previewProfileFor']
}

// What the camera dialog reads from each live frame, auto capture, the
// shutter button and importing a photo for the current face.
export function useCameraCapture({
  captureIO,
  webcamOpen,
  loading,
  setLoading,
  turnOverlay,
  webcamFace,
  puzzleSize,
  captureMode,
  sampling,
  palette,
  autoColorProfiles,
  automaticColors,
  provisionalColorProfile,
  autoCapture,
  stableFrames,
  capturedFaces,
  webcamRef,
  lastCaptureAt,
  pendingFlyIn,
  setCaptureMessage,
  signalCapture,
  applyFaceCapture,
  previewProfileFor,
}: CameraCaptureOptions) {
  const [autoCaptureFrames, setAutoCaptureFrames] = useState(0)
  const [autoCapturePaused, setAutoCapturePaused] = useState(false)
  const [liveDetection, setLiveDetection] =
    useState<ColorDetectionResult | null>(null)
  const [liveFaceVisible, setLiveFaceVisible] = useState(false)
  const [liveNeedsRecentering, setLiveNeedsRecentering] = useState(false)
  const [liveMedianWB, setLiveMedianWB] = useState(false)
  const [liveAutoColorProfileId, setLiveAutoColorProfileId] = useState<
    string | null
  >(null)
  const liveAutoColorProfile = autoColorProfiles.find(
    (candidate) => candidate.id === liveAutoColorProfileId,
  )

  useLiveCaptureAnalysis({
    open: webcamOpen,
    loading,
    turnCueShowing: turnOverlay !== null,
    face: webcamFace,
    faceOrder: FACE_ORDER,
    size: puzzleSize,
    mode: captureMode,
    sampling,
    palette,
    autoProfiles: autoColorProfiles,
    autoColorsSelected: automaticColors,
    provisionalProfileId: provisionalColorProfile?.id ?? null,
    autoCapture,
    stableFrames,
    capturedFaces,
    videoRef: webcamRef,
    lastCaptureAt,
    pendingFlyIn,
    setAutoCaptureFrames,
    setAutoCapturePaused,
    setLiveDetection,
    setLiveFaceVisible,
    setLiveNeedsRecentering,
    setLiveMedianWB,
    setLiveAutoColorProfileId,
    setCaptureMessage,
    onCaptureSignal: signalCapture,
    onAutoCapture: async (result, profileId) => {
      const operation = captureIO.begin()
      const track = (
        webcamRef.current?.srcObject as MediaStream | null
      )?.getVideoTracks()[0]
      setLoading(true)
      setCaptureMessage('Processing image...')
      try {
        await applyFaceCapture(
          webcamFace,
          result,
          'camera',
          track ? withoutDeviceIds(track.getSettings()) : undefined,
          puzzleSize,
          previewProfileFor(profileId),
          operation,
        )
      } catch (err) {
        if (operation.isCurrent()) throw err
      } finally {
        if (captureIO.finish(operation)) setLoading(false)
      }
    },
  })

  const handleCapturePhoto = async () => {
    if (!webcamRef.current || turnOverlay !== null) return
    const operation = captureIO.begin()
    const frame = document
      .querySelector('.capture-scan-frame')
      ?.getBoundingClientRect()
    if (frame) pendingFlyIn.current = { slot: webcamFace, from: frame }

    try {
      setLoading(true)
      setCaptureMessage('Processing image...')
      const capturedBackgrounds = Object.fromEntries(
        FACE_ORDER.map((face) => [
          face,
          capturedFaces[face]?.backgroundColor ?? null,
        ]),
      )
      const result = captureCameraPhoto(webcamRef.current, {
        size: puzzleSize,
        mode: captureMode,
        sampling,
        palette: palette ?? liveAutoColorProfile?.colors,
        backgrounds: capturedBackgrounds,
      })
      const track = (
        webcamRef.current.srcObject as MediaStream | null
      )?.getVideoTracks()[0]
      signalCapture()
      await applyFaceCapture(
        webcamFace,
        result,
        'camera',
        track ? withoutDeviceIds(track.getSettings()) : undefined,
        result.colors.length,
        previewProfileFor(liveAutoColorProfileId),
        operation,
      )
    } catch (err) {
      if (!operation.isCurrent()) return
      console.error('Capture error:', err)
      setCaptureMessage(
        `❌ Error: ${err instanceof Error ? err.message : 'Unknown error'}`,
      )
    } finally {
      if (captureIO.finish(operation)) setLoading(false)
    }
  }

  const handleImportImage = async (e: Event) => {
    const input = e.currentTarget as HTMLInputElement
    const file = input.files?.[0]
    if (!file) return
    input.value = ''
    const operation = captureIO.begin()

    try {
      setLoading(true)
      setCaptureMessage('Processing image...')

      const result = await importCapturePhoto(file, {
        size: puzzleSize,
        mode: captureMode,
        sampling,
        palette,
      })
      if (!operation.isCurrent()) return
      await applyFaceCapture(
        webcamFace,
        result,
        'image-file',
        undefined,
        puzzleSize,
        previewProfileFor(null),
        operation,
      )
    } catch (err) {
      if (!operation.isCurrent()) return
      console.error('Image import error:', err)
      setCaptureMessage(
        `❌ Error: ${err instanceof Error ? err.message : 'Unknown error'}`,
      )
    } finally {
      if (captureIO.finish(operation)) setLoading(false)
    }
  }

  return {
    autoCaptureFrames,
    autoCapturePaused,
    liveDetection,
    setLiveDetection,
    liveFaceVisible,
    setLiveFaceVisible,
    liveNeedsRecentering,
    liveMedianWB,
    liveAutoColorProfile,
    handleCapturePhoto,
    handleImportImage,
  }
}

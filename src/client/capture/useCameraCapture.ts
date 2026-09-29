import { useState } from 'preact/hooks'
import { captureCameraPhoto, importCapturePhoto } from './capturePhoto'
import { FACE_ORDER } from './captureSteps'
import type { ColorDetectionResult } from '../imageProcessing'
import { withoutDeviceIds, type useCameraStream } from './useCameraStream'
import type { useCaptureFeedback } from './useCaptureFeedback'
import type { useCaptureSession } from './useCaptureSession'
import { useLiveCaptureAnalysis } from './useLiveCaptureAnalysis'
import type { useProfileStore } from '../useProfileStore'
import type { useScannerPreferences } from '../useScannerPreferences'

type Session = ReturnType<typeof useCaptureSession>
type Profiles = ReturnType<typeof useProfileStore>
type Preferences = ReturnType<typeof useScannerPreferences>

interface CameraCaptureOptions {
  webcamOpen: boolean
  loading: boolean
  setLoading: (value: boolean) => void
  turnOverlay: Session['turnOverlay']
  dismissTurnOverlay: Session['dismissTurnOverlay']
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
  lastCapturedColors: Session['lastCapturedColors']
  lastCapturedPose: Session['lastCapturedPose']
  pendingFlyIn: Session['pendingFlyIn']
  setCaptureMessage: Session['setCaptureMessage']
  signalCapture: ReturnType<typeof useCaptureFeedback>['signalCapture']
  applyFaceCapture: Session['applyFaceCapture']
  previewProfileFor: Profiles['previewProfileFor']
}

// What the camera dialog reads from each live frame, auto capture, the
// shutter button and importing a photo for the current face.
export function useCameraCapture({
  webcamOpen,
  loading,
  setLoading,
  turnOverlay,
  dismissTurnOverlay,
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
  lastCapturedColors,
  lastCapturedPose,
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
  const [liveCapturedFace, setLiveCapturedFace] = useState<string | null>(null)
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
    lastCapturedColors,
    lastCapturedPose,
    pendingFlyIn,
    setAutoCaptureFrames,
    setAutoCapturePaused,
    setLiveDetection,
    setLiveFaceVisible,
    setLiveNeedsRecentering,
    setLiveMedianWB,
    setLiveAutoColorProfileId,
    setLiveCapturedFace,
    setCaptureMessage,
    onTurnCueCleared: dismissTurnOverlay,
    onCaptureSignal: signalCapture,
    onAutoCapture: async (result, profileId) => {
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
        )
      } finally {
        setLoading(false)
      }
    },
  })

  const handleCapturePhoto = async () => {
    if (!webcamRef.current || turnOverlay !== null) return
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
      )
    } catch (err) {
      console.error('Capture error:', err)
      setCaptureMessage(
        `❌ Error: ${err instanceof Error ? err.message : 'Unknown error'}`,
      )
    } finally {
      setLoading(false)
    }
  }

  const handleImportImage = async (e: Event) => {
    const input = e.currentTarget as HTMLInputElement
    const file = input.files?.[0]
    if (!file) return

    try {
      setLoading(true)
      setCaptureMessage('Processing image...')

      const result = await importCapturePhoto(file, {
        size: puzzleSize,
        mode: captureMode,
        sampling,
        palette,
      })
      await applyFaceCapture(
        webcamFace,
        result,
        'image-file',
        undefined,
        puzzleSize,
        previewProfileFor(null),
      )
    } catch (err) {
      console.error('Image import error:', err)
      setCaptureMessage(
        `❌ Error: ${err instanceof Error ? err.message : 'Unknown error'}`,
      )
    } finally {
      setLoading(false)
      input.value = ''
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
    liveCapturedFace,
    handleCapturePhoto,
    handleImportImage,
  }
}

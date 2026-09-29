import { useEffect, useRef, useState } from 'preact/hooks'
import type { TurnCuePose } from './autoCapture'
import {
  captureStep,
  isGuidedCapture,
  sessionView,
  type FaceCaptureReading,
  type TurnCue,
} from './captureFlow'
import type { FaceCaptureData, PreviewColorProfile } from './captureTypes'
import { flyInto } from './flyAnimation'

// The faces captured so far and the guided capture around them: which face
// the camera asks for next, the turn cue between faces, the fly-in of a
// captured face, and the warnings a capture may deserve. What happens once
// all six are in is App's job (onAllCaptured).
export function useCaptureSession({
  puzzleSize,
  webcamOpen,
  onAllCaptured,
}: {
  puzzleSize: number
  webcamOpen: boolean
  onAllCaptured: (faces: Record<string, FaceCaptureData>) => Promise<void>
}) {
  const [capturedFaces, setCapturedFaces] = useState<
    Record<string, FaceCaptureData>
  >({})
  const [webcamFace, setWebcamFace] = useState('U')
  const [captureMessage, setCaptureMessage] = useState('')
  const [turnOverlay, setTurnOverlay] = useState<TurnCue | null>(null)
  // Capture-time warnings the customer chose to ignore (see captureWarning).
  const [dismissedCaptureWarnings, setDismissedCaptureWarnings] = useState<
    string[]
  >([])
  // capture.protocol of the last uploaded fixture (see isGuidedCapture).
  const [uploadedProtocol, setUploadedProtocol] = useState<string | null>(null)
  // The last camera capture, which the live analysis must see the cube turn
  // away from before it captures again.
  const lastCapturedColors = useRef<string[][] | null>(null)
  const lastCapturedPose = useRef<TurnCuePose | null>(null)
  // A face just captured, to fly from the scan square into its net slot
  // once the slot has rendered it (see CaptureNet / flyInto).
  const pendingFlyIn = useRef<{ slot: string; from: DOMRect } | null>(null)

  const forgetLastCapture = () => {
    lastCapturedColors.current = null
    lastCapturedPose.current = null
  }

  const dismissTurnOverlay = () => {
    setTurnOverlay(null)
  }

  const continueTurnOverlay = () => {
    // An identical-looking side cannot be told apart by sticker letters.
    // Continue explicitly confirms that the cube has been turned.
    forgetLastCapture()
    dismissTurnOverlay()
  }

  const selectFace = (face: string) => {
    dismissTurnOverlay()
    forgetLastCapture()
    setWebcamFace(face)
    setCaptureMessage('')
  }

  useEffect(() => {
    if (!webcamOpen) dismissTurnOverlay()
  }, [webcamOpen])

  useEffect(() => {
    const fly = pendingFlyIn.current
    if (!fly || !capturedFaces[fly.slot]) return
    pendingFlyIn.current = null
    const target = document.querySelector<HTMLElement>(
      `.capture-net [data-slot="${fly.slot}"] .orientation-net-face`,
    )
    if (target) flyInto(target, fly.from)
  }, [capturedFaces])

  // Stores a capture result for `face`, hands all 6 faces on to final
  // calibration and review, and otherwise advances to the next uncaptured
  // face so the user doesn't have to close/reopen it per face.
  const applyFaceCapture = async (
    face: string,
    result: FaceCaptureReading,
    source: 'camera' | 'image-file',
    cameraSettings?: Partial<MediaTrackSettings>,
    captureSize = puzzleSize,
    previewColorProfile?: PreviewColorProfile,
  ) => {
    const step = captureStep(
      capturedFaces,
      face,
      result,
      source,
      cameraSettings,
      previewColorProfile,
      captureSize,
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    )
    if (!step.ok) {
      setCaptureMessage(step.message)
      return
    }
    if (pendingFlyIn.current) pendingFlyIn.current.slot = step.assignedFace

    setCapturedFaces(step.faces)
    lastCapturedColors.current = step.lastColors
    lastCapturedPose.current = step.lastPose
    setCaptureMessage(step.message)

    if (step.nextFace === null) {
      await onAllCaptured(step.faces)
    } else {
      setWebcamFace(step.nextFace)
      setCaptureMessage('')
      dismissTurnOverlay()
      if (step.turnCue) setTurnOverlay(step.turnCue)
    }
  }

  const isGuided = () => isGuidedCapture(capturedFaces, uploadedProtocol)

  const {
    predictedCenters,
    predictedCenter,
    centerRoutingActive,
    repeatedNetFaces,
    warning,
  } = sessionView(
    capturedFaces,
    webcamFace,
    puzzleSize,
    dismissedCaptureWarnings,
  )

  return {
    capturedFaces,
    setCapturedFaces,
    webcamFace,
    setWebcamFace,
    captureMessage,
    setCaptureMessage,
    turnOverlay,
    dismissTurnOverlay,
    continueTurnOverlay,
    setDismissedCaptureWarnings,
    setUploadedProtocol,
    lastCapturedColors,
    lastCapturedPose,
    pendingFlyIn,
    forgetLastCapture,
    selectFace,
    applyFaceCapture,
    isGuided,
    predictedCenters,
    predictedCenter,
    centerRoutingActive,
    repeatedNetFaces,
    warning,
  }
}

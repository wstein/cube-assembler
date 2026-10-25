import { useEffect, useRef, useState } from 'preact/hooks'
import { TURN_CUE_COOLDOWN_MS } from './autoCapture'
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
  // When the last camera capture was made: auto capture waits a moment for
  // the cube to be turned (see autoCaptureHeld), or until Continue.
  const lastCaptureAt = useRef<number | null>(null)
  // A face just captured, to fly from the scan square into its net slot
  // once the slot has rendered it (see CaptureNet / flyInto).
  const pendingFlyIn = useRef<{ slot: string; from: DOMRect } | null>(null)

  const forgetLastCapture = () => {
    lastCaptureAt.current = null
  }

  const dismissTurnOverlay = () => {
    setTurnOverlay(null)
  }

  const continueTurnOverlay = () => {
    // Nothing in the picture is checked: Continue says the cube was turned.
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

  // The cue goes away by itself once the cube has had time to be turned.
  useEffect(() => {
    if (turnOverlay === null) return
    const timer = setTimeout(dismissTurnOverlay, TURN_CUE_COOLDOWN_MS)
    return () => clearTimeout(timer)
  }, [turnOverlay])

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
    lastCaptureAt.current = source === 'camera' ? Date.now() : null
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
    lastCaptureAt,
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

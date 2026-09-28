import { useEffect, useRef, useState } from 'preact/hooks'
import {
  captureCenterSlots,
  findRepeatedFaces,
  validateFaceColors,
} from '../cube/cubeAssembly'
import type { TurnCuePose } from './autoCapture'
import {
  captureWarning,
  capturedFaceMessage,
  isGuidedCapture,
  nextTurnCue,
  placeFaceCapture,
  turnCuePose,
  type FaceCaptureReading,
  type TurnCue,
} from './captureFlow'
import { FACE_ORDER } from './captureSteps'
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
    if (!validateFaceColors(result.colors, captureSize)) {
      setCaptureMessage(
        `❌ Invalid colors detected. Confidence: ${(result.confidence * 100).toFixed(0)}%`,
      )
      return
    }

    const {
      faces: newCapturedFaces,
      assignedFace,
      unexpectedCenter,
    } = placeFaceCapture(
      capturedFaces,
      face,
      result,
      source,
      cameraSettings,
      previewColorProfile,
    )
    if (pendingFlyIn.current) pendingFlyIn.current.slot = assignedFace

    setCapturedFaces(newCapturedFaces)
    lastCapturedColors.current = source === 'camera' ? result.colors : null
    lastCapturedPose.current =
      source === 'camera' ? turnCuePose(result.crop) : null
    setCaptureMessage(
      capturedFaceMessage(assignedFace, result.confidence, unexpectedCenter),
    )

    const allFacesCaptured = FACE_ORDER.every((f) => f in newCapturedFaces)
    if (allFacesCaptured) {
      await onAllCaptured(newCapturedFaces)
    } else {
      const nextFace = FACE_ORDER.find((f) => !(f in newCapturedFaces))
      if (nextFace) {
        setWebcamFace(nextFace)
        setCaptureMessage('')
        dismissTurnOverlay()
        // The cue blocks capturing while the cube turns; without the turn it
        // would only be a wait, and the step hint already says what to do.
        if (
          source !== 'camera' ||
          window.matchMedia('(prefers-reduced-motion: reduce)').matches
        )
          return
        setTurnOverlay(nextTurnCue(newCapturedFaces, nextFace, result.colors))
      }
    }
  }

  const isGuided = () => isGuidedCapture(capturedFaces, uploadedProtocol)

  const capturedPhotos = FACE_ORDER.map((f) => capturedFaces[f]?.colors)
  const predictedCenters = captureCenterSlots(capturedPhotos)
  const predictedCenter = predictedCenters[FACE_ORDER.indexOf(webcamFace)]
  const centerRoutingActive =
    puzzleSize % 2 === 1 &&
    Boolean(capturedFaces[FACE_ORDER[0]] && capturedFaces[FACE_ORDER[1]]) &&
    predictedCenters.every(Boolean) &&
    !capturedFaces[webcamFace]
  const repeatedFaces = findRepeatedFaces(capturedPhotos)
  const repeatedNetFaces = repeatedFaces.flatMap(([a, b]) => [
    FACE_ORDER[a],
    FACE_ORDER[b],
  ])
  const warning = captureWarning(
    capturedFaces,
    repeatedFaces,
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

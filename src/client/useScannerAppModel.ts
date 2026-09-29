import { createScannerUploadActions } from './scannerUploadActions'
import { useState, useEffect } from 'preact/hooks'
import {
  captureBackgroundGains,
  recalibrateCapture,
} from './captureFinalization'
import type { FaceCaptureData } from './captureTypes'
import { readyAssemblyAfterCapture } from './captureReviewRouting'
import { useFixtureDownload } from './useFixtureDownload'
import { useCameraStream, withoutDeviceIds } from './useCameraStream'
import { useCaptureFeedback } from './useCaptureFeedback'
import { useLiveCaptureAnalysis } from './useLiveCaptureAnalysis'
import { captureCameraPhoto, importCapturePhoto } from './capturePhoto'
import { profilesHash } from './profilesRoute'
import { selectedCubeSize } from './preferences'
import { useScannerPreferences } from './useScannerPreferences'
import { type ParityResult } from '../cube/parity'
import { type ColorDetectionResult } from './imageProcessing'
import {
  assembleCubeFromFaces,
  createSolvedCube,
  type OrientedCandidate,
  type CubeState,
} from '../cube/cubeAssembly'
import {
  allCubes,
  resolvedColorProfileSnapshot,
  selectCube,
  setAutoColorMatch,
} from './profileSettings'
import {
  canCreateProfileFromCapture,
  profileToUpdate,
} from './colorProfileLearning'
import { currentAppCommit } from './fixtureUpload'
import { FACE_ORDER, glareFacesToWarn } from './captureSteps'
import { useProfileStore } from './useProfileStore'
import { useCaptureSession } from './useCaptureSession'
import { useCaptureCalibration } from './useCaptureCalibration'
import {
  captureEvidence,
  checkParity,
  cubeCaptureFaces,
  parityStatus,
  parseCubeInput,
  solvedCaptureFaces,
} from './captureFlow'
import { usePhotoUploads } from './usePhotoUploads'
import {
  buildCaptureFixture,
  canSaveCaptureFixture,
  fixtureDownloadFor,
} from './captureFixture'
import { useOrientationReview } from './useOrientationReview'

// Injected at build time by Vite.
declare const __APP_VERSION__: string
declare const __APP_COMMIT__: string

export function useScannerAppModel() {
  const [puzzleSize, setPuzzleSize] = useState(
    () => selectedCubeSize(document.cookie) ?? 3,
  )
  const [cube, setCube] = useState<CubeState | null>(null)
  const [turnedCube, setTurnedCube] = useState<{
    source: CubeState
    value: CubeState
    moves: import('./cubeView3D').CubeTurn[]
  } | null>(null)
  const [parity, setParity] = useState<ParityResult | null>(null)
  const [webcamOpen, setWebcamOpen] = useState(false)
  const [autoCaptureFrames, setAutoCaptureFrames] = useState(0)
  const [autoCapturePaused, setAutoCapturePaused] = useState(false)
  const {
    cubeViewMode,
    setCubeViewMode,
    captureMode,
    setCaptureMode,
    autoCapture,
    setAutoCapture,
    stableFrames,
    captureSound,
    setCaptureSound,
    mirrorPreview,
    setMirrorPreview,
    notationFormat,
    setNotationFormat,
    changePreference,
    page,
    onSettingsPage,
  } = useScannerPreferences(puzzleSize)
  const {
    flash: captureFlash,
    armAudio: armCaptureAudio,
    signalCapture,
  } = useCaptureFeedback(captureSound)
  const {
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
  } = useCaptureSession({
    puzzleSize,
    webcamOpen,
    onAllCaptured: (faces) => finalizeAllFacesCaptured(faces),
  })
  const [loading, setLoading] = useState(false)
  const {
    photoUpload,
    selectPhotos,
    closePhotoUpload,
    changePhotoUploadMode,
    movePhotoUpload,
  } = usePhotoUploads()
  const {
    fixtureSaveMessage,
    setFixtureSaveMessage,
    fixtureUploadMessage,
    fixtureUploading,
    fixtureServerReachable,
    fixtureServerChecked,
    fixtureServerPolling,
    fixtureDownload,
    setFixtureDownload,
    closeFixtureDownload,
    uploadFixture,
    downloadFixture,
  } = useFixtureDownload()
  const [manualColorInput, setManualColorInput] = useState('')
  const [showColorInput, setShowColorInput] = useState(false)
  const [liveDetection, setLiveDetection] =
    useState<ColorDetectionResult | null>(null)
  const [liveFaceVisible, setLiveFaceVisible] = useState(false)
  const [liveNeedsRecentering, setLiveNeedsRecentering] = useState(false)
  const [liveMedianWB, setLiveMedianWB] = useState(false)
  const [liveAutoColorProfileId, setLiveAutoColorProfileId] = useState<
    string | null
  >(null)
  const [liveCapturedFace, setLiveCapturedFace] = useState<string | null>(null)
  const [showReviewDialog, setShowReviewDialog] = useState(false)
  const {
    orientationWizard,
    setOrientationWizard,
    wizardMorphing,
    orientationApproval,
    setOrientationApproval,
    reviewNotice,
    setReviewNotice,
    clearOrientationReview,
    handleConfirmReview,
    handleRejectOrientation,
    handleWizardPick,
  } = useOrientationReview({
    capturedFaces,
    isGuidedCapture: () => isGuided(),
    onChoose: (candidate) => handleChooseOrientation(candidate),
  })
  const [reviewEditingCell, setReviewEditingCell] = useState<{
    face: string
    row: number
    col: number
  } | null>(null)
  const {
    profileStore,
    applyProfileStore,
    automaticColors,
    profile,
    colorProfile,
    sampling,
    autoColorProfiles,
    provisionalColorProfile,
    palette,
    previewProfileFor,
    samplingFileMessage,
    profileLearningOffer,
    setProfileLearningOffer,
    newColorName,
    setNewColorName,
    updatableName,
    newCubeName,
    setNewCubeName,
    newColorProfileName,
    setNewColorProfileName,
    handleCreateCube,
    handleCreateNamedColors,
    handleCreateColors,
    handleUpdateColors,
    handleDownloadSampling,
    handleUploadSampling,
  } = useProfileStore({
    puzzleSize,
    capturedFaces,
    onCubeCreated: () => {
      setWebcamOpen(false)
      location.hash = profilesHash('cubes')
    },
  })
  const liveAutoColorProfile = autoColorProfiles.find(
    (candidate) => candidate.id === liveAutoColorProfileId,
  )
  // Upload Fixture option: start the review from what detection reads
  // today instead of the colors the fixture was saved with, so a capture
  // can be reviewed afresh without its earlier hand corrections.
  const [ignoreFixtureCorrections, setIgnoreFixtureCorrections] =
    useState(false)
  const {
    learnedPalette,
    mixedUpColors,
    pendingPalette,
    setPendingPalette,
    captureProfile,
    resolvedColorProfile,
    resolvedColorReference,
    automaticResolution,
    globalWhiteBalanceNote,
    glareFaces,
    appliedBackgroundGains,
    setAppliedBackgroundGains,
    forgetResolvedProfile,
    clearCalibration,
    startCapture,
    startRecalibration,
    applyRecalibration,
    failRecalibration,
    applyFixtureCalibration,
  } = useCaptureCalibration()
  const [showBackdropDialog, setShowBackdropDialog] = useState(false)
  const [reviewStep, setReviewStep] = useState(0)
  const [reviewRouting, setReviewRouting] = useState<{
    faces: Record<string, FaceCaptureData>
    glare: string[]
    mixedUp: string[]
  } | null>(null)
  const { videoRef: webcamRef, cameraInfo } = useCameraStream(webcamOpen)
  // Everything below belongs to one cube of one size, so switching sizes
  // starts over - keeping it drew e.g. a 5x5's 25 stickers per face into a
  // 6x6 net. Shared by the main size bar and the capture dialog.
  const changePuzzleSize = (size: number) => {
    if (size === puzzleSize) return true
    if (
      Object.keys(capturedFaces).length > 0 &&
      !window.confirm('Changing cube size clears the captured faces. Continue?')
    )
      return false
    setPuzzleSize(size)
    setCube(null)
    setParity(null)
    setCapturedFaces({})
    forgetLastCapture()
    setWebcamFace(FACE_ORDER[0])
    setLiveDetection(null)
    setShowReviewDialog(false)
    setReviewStep(0)
    setReviewEditingCell(null)
    clearOrientationReview()
    clearCalibration()
    setProfileLearningOffer(null)
    setCaptureMessage('')
    setFixtureSaveMessage('')
    return true
  }

  const changeCube = (id: string) => {
    const selected = allCubes(profileStore).find((cube) => cube.id === id)
    if (!selected) return false
    if (selected.size !== puzzleSize && !changePuzzleSize(selected.size))
      return false
    applyProfileStore(selectCube(profileStore, id))
    return true
  }

  const handleApplySolved = async () => {
    const solved = createSolvedCube(puzzleSize)
    setCube(solved)
    forgetResolvedProfile()

    setCapturedFaces(solvedCaptureFaces(puzzleSize))
    updateParityStatus(solved)
  }

  const handleApplyFacelets = async () => {
    if (!manualColorInput.trim()) {
      alert('Please enter facelet data')
      return
    }

    setLoading(true)
    try {
      // The textarea's onInput already keeps notationFormat in sync with
      // pasted content via detectNotationFormat, but fall back to it here
      // too in case content ever reaches this handler without going
      // through that path (e.g. a fast paste-and-submit).
      const parsed = parseCubeInput(manualColorInput, notationFormat)
      if (!parsed.ok) {
        alert(parsed.message)
        return
      }
      const { cube: newCube, format: effectiveFormat } = parsed
      if (effectiveFormat !== notationFormat) setNotationFormat(effectiveFormat)

      const size = Math.sqrt(newCube.u.length)
      setPuzzleSize(size)
      setCube(newCube)
      forgetResolvedProfile()

      setCapturedFaces(cubeCaptureFaces(newCube, size))

      updateParityStatus(newCube, size)
      setManualColorInput('')
      setShowColorInput(false)
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Features: Parity Validation (#10)
  // ─────────────────────────────────────────────────────────────────────────

  const updateParityStatus = (cubeState: CubeState, sizeOverride?: number) => {
    setParity(parityStatus(cubeState, sizeOverride ?? puzzleSize))
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Features: Face Capture Modal (#5)
  // ─────────────────────────────────────────────────────────────────────────

  // Continue from the first empty slot, or start over when requested (and
  // after all six are already complete).
  const handleOpenCapture = (restart = false) => {
    armCaptureAudio()
    dismissTurnOverlay()
    forgetLastCapture()
    const allCaptured = FACE_ORDER.every((f) => f in capturedFaces)
    const startOver = restart || allCaptured
    if (startOver) {
      setCapturedFaces({})
      setProfileLearningOffer(null)
      setNewColorName(null)
    }
    const nextFace = startOver
      ? FACE_ORDER[0]
      : FACE_ORDER.find((f) => !(f in capturedFaces))!
    setWebcamFace(nextFace)
    setCaptureMessage('')
    if (startOver) setDismissedCaptureWarnings([])
    startCapture(startOver)
    setWebcamOpen(true)
  }

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

  // Runs once every face has a captured entry, regardless of how it got
  // there (one-by-one webcam capture or a bulk file upload) - the global
  // white-balance recalibration (learning each sticker color from all 6
  // faces together, see runGlobalWhiteBalance) only makes sense with a
  // complete set, so this is the single place both capture paths converge
  // before routing to color review or assembly.
  const finalizeAllFacesCaptured = async (
    newCapturedFaces: Record<string, FaceCaptureData>,
  ) => {
    let finalFaces = newCapturedFaces
    let finalGlare: string[] = []
    let finalMixedUp: string[] = []
    setCaptureMessage(
      '✓ All faces captured! Checking white balance across all stickers...',
    )
    setLoading(true)
    setProfileLearningOffer(null)
    const automatic = automaticColors
    startRecalibration(
      automatic ? null : resolvedColorProfileSnapshot(colorProfile, 'manual'),
    )

    const canRecalibrate = FACE_ORDER.every(
      (f) => newCapturedFaces[f].croppedImage,
    )
    if (canRecalibrate) {
      try {
        const faceGains = captureBackgroundGains(newCapturedFaces, FACE_ORDER)
        setAppliedBackgroundGains(faceGains)
        const result = await recalibrateCapture(
          {
            faces: newCapturedFaces,
            order: FACE_ORDER,
            size: puzzleSize,
            sampling,
            automatic,
            palette,
            autoProfiles: autoColorProfiles,
            colorProfile,
            glareToWarn: glareFacesToWarn,
          },
          faceGains,
        )
        applyRecalibration(result, profile)
        finalMixedUp = result.mixedUp
        finalGlare = result.glare
        // Keep calibration provisional until the customer approves the
        // complete cube in the orientation review.
        if (result.applied) {
          finalFaces = result.finalFaces
          setCapturedFaces(result.finalFaces)
        }
      } catch (err) {
        console.error('Global white balance error:', err)
        failRecalibration()
      }
    }

    setLoading(false)
    setWebcamOpen(false)
    setReviewRouting({
      faces: finalFaces,
      glare: finalGlare,
      mixedUp: finalMixedUp,
    })
  }

  const { handleUploadFiles, handleUploadPhotos } = createScannerUploadActions({
    setLoading,
    setCaptureMessage,
    setProfileLearningOffer,
    setUploadedProtocol,
    applyFixtureCalibration,
    setPuzzleSize,
    setCapturedFaces,
    setReviewStep,
    setShowReviewDialog,
    ignoreFixtureCorrections,
    selectPhotos,
    photoUpload,
    loading,
    puzzleSize,
    captureMode,
    sampling,
    automaticColors,
    profileStore,
    setDismissedCaptureWarnings,
    closePhotoUpload,
    finalizeAllFacesCaptured,
  })

  // ─────────────────────────────────────────────────────────────────────────
  // Features: Post-Capture Review & Color Fix
  // ─────────────────────────────────────────────────────────────────────────

  const handleFixCellColor = (
    face: string,
    row: number,
    col: number,
    newColor: string,
  ) => {
    setCapturedFaces((prev) => {
      const faceData = prev[face]
      if (!faceData) return prev

      const newColors = faceData.colors.map((r) => [...r])
      newColors[row][col] = newColor

      // Detection's confidence and lookalike stay as measured (saved with
      // fixtures); the review hides them while the sticker differs from
      // what detection saw, and shows them again if it's set back.
      return {
        ...prev,
        [face]: { ...faceData, colors: newColors },
      }
    })
    setReviewEditingCell(null)
  }

  const handleRetakeFace = (face: string) => {
    armCaptureAudio()
    setShowReviewDialog(false)
    setWebcamFace(face)
    setCaptureMessage('')
    setWebcamOpen(true)
  }

  useEffect(() => {
    if (!reviewRouting || capturedFaces !== reviewRouting.faces) return
    setReviewRouting(null)
    const showColorReview = () => {
      setReviewStep(0)
      setShowReviewDialog(true)
    }
    const ready = readyAssemblyAfterCapture(
      capturedFaces,
      FACE_ORDER,
      reviewRouting.glare,
      reviewRouting.mixedUp,
    )
    if (!ready) {
      showColorReview()
      return
    }
    handleConfirmReview(ready)
  }, [reviewRouting, capturedFaces])

  const matchingNetFaces = new Set(repeatedNetFaces)
  if (liveCapturedFace) matchingNetFaces.add(liveCapturedFace)

  // Finishes assembly once the orientation wizard has narrowed down to a
  // single candidate - mirrors handleConfirmReview's tail end exactly,
  // since this IS that same step, just with the choice already made
  // instead of auto-picking alternatives[0].
  const handleChooseOrientation = async (chosen: OrientedCandidate) => {
    clearOrientationReview()
    const cubeState = assembleCubeFromFaces(chosen.faces, puzzleSize)
    setCube(cubeState)
    updateParityStatus(cubeState)
    if (pendingPalette) {
      let reviewedValid = false
      try {
        reviewedValid = checkParity(cubeState, puzzleSize).valid
      } catch {
        /* Keep learned colors out of a failed review. */
      }
      const evidence = captureEvidence(
        capturedFaces,
        puzzleSize,
        reviewedValid,
        pendingPalette,
      )
      const automatic = automaticColors
      const matched =
        automatic &&
        reviewedValid &&
        evidence.cameraOnly &&
        evidence.recalibrated
          ? (autoColorProfiles.find(
              (profile) => profile.id === resolvedColorProfile?.id,
            ) ?? null)
          : null
      // The Automatic match or the hand-selected profile is only ever
      // updated through the explicit Update action, never silently.
      const updatable = profileToUpdate(
        profileStore.colors,
        {
          automatic,
          resolvedId: resolvedColorProfile?.id ?? null,
          selectedId: profileStore.activeColorsId,
        },
        pendingPalette.colors,
        evidence,
      )
      const canCreate = canCreateProfileFromCapture(evidence)
      setProfileLearningOffer(
        canCreate
          ? {
              colors: pendingPalette.colors,
              evidence,
              matchedProfileId: updatable?.id ?? null,
            }
          : null,
      )
      setNewColorName(null)
      if (automatic)
        applyProfileStore(setAutoColorMatch(profileStore, matched?.id ?? null))
      setPendingPalette(null)
    }
    setShowReviewDialog(false)
  }

  // Shows what a fixture of this capture holds before downloading it (see
  // buildCaptureFixture). Only meaningful once the cube has been confirmed,
  // when the colors include the review's corrections.
  const handleSaveFixture = async () => {
    if (!canSaveCaptureFixture(capturedFaces)) {
      setFixtureSaveMessage('❌ Capture and confirm all 6 faces first.')
      return
    }
    const commit = import.meta.env.DEV
      ? await currentAppCommit(__APP_COMMIT__)
      : __APP_COMMIT__
    try {
      const fixture = buildCaptureFixture({
        capturedFaces,
        puzzleSize,
        version: __APP_VERSION__,
        commit,
        userAgent: navigator.userAgent,
        devicePixelRatio: window.devicePixelRatio,
        mirrored: mirrorPreview,
        cameraInfo,
        captureProfile,
        resolvedColorProfile,
        automaticResolution,
        resolvedColorReference,
        guided: isGuided(),
        cube,
        appliedBackgroundGains,
        sampling,
        calibrationApplied: globalWhiteBalanceNote !== null,
        learnedPalette,
      })
      setFixtureSaveMessage('')
      setFixtureDownload(fixtureDownloadFor(fixture))
    } catch (err) {
      setFixtureSaveMessage(
        `❌ Failed to save fixture: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

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

  // ─────────────────────────────────────────────────────────────────────────
  return {
    appliedBackgroundGains,
    applyProfileStore,
    armCaptureAudio,
    autoCapture,
    autoCaptureFrames,
    autoCapturePaused,
    automaticColors,
    automaticResolution,
    cameraInfo,
    captureFlash,
    captureMessage,
    captureMode,
    captureProfile,
    captureSound,
    capturedFaces,
    centerRoutingActive,
    changeCube,
    changePhotoUploadMode,
    changePreference,
    closeFixtureDownload,
    closePhotoUpload,
    colorProfile,
    continueTurnOverlay,
    cube,
    cubeViewMode,
    downloadFixture,
    fixtureDownload,
    fixtureSaveMessage,
    fixtureServerChecked,
    fixtureServerPolling,
    fixtureServerReachable,
    fixtureUploadMessage,
    fixtureUploading,
    forgetLastCapture,
    glareFaces,
    globalWhiteBalanceNote,
    handleApplyFacelets,
    handleApplySolved,
    handleCapturePhoto,
    handleChooseOrientation,
    handleConfirmReview,
    handleCreateColors,
    handleCreateCube,
    handleCreateNamedColors,
    handleDownloadSampling,
    handleFixCellColor,
    handleImportImage,
    handleOpenCapture,
    handleRejectOrientation,
    handleRetakeFace,
    handleSaveFixture,
    handleUpdateColors,
    handleUploadFiles,
    handleUploadPhotos,
    handleUploadSampling,
    handleWizardPick,
    ignoreFixtureCorrections,
    learnedPalette,
    liveAutoColorProfile,
    liveCapturedFace,
    liveDetection,
    liveFaceVisible,
    liveMedianWB,
    liveNeedsRecentering,
    loading,
    manualColorInput,
    matchingNetFaces,
    mirrorPreview,
    mixedUpColors,
    movePhotoUpload,
    newColorName,
    newColorProfileName,
    newCubeName,
    notationFormat,
    onSettingsPage,
    orientationApproval,
    orientationWizard,
    page,
    palette,
    parity,
    photoUpload,
    predictedCenter,
    predictedCenters,
    profile,
    profileLearningOffer,
    profileStore,
    provisionalColorProfile,
    puzzleSize,
    resolvedColorProfile,
    reviewEditingCell,
    reviewNotice,
    reviewStep,
    sampling,
    samplingFileMessage,
    selectFace,
    setAutoCapture,
    setCaptureMessage,
    setCaptureMode,
    setCaptureSound,
    setCubeViewMode,
    setDismissedCaptureWarnings,
    setIgnoreFixtureCorrections,
    setLiveDetection,
    setLiveFaceVisible,
    setManualColorInput,
    setMirrorPreview,
    setNewColorName,
    setNewColorProfileName,
    setNewCubeName,
    setNotationFormat,
    setOrientationApproval,
    setOrientationWizard,
    setReviewEditingCell,
    setReviewNotice,
    setReviewStep,
    setShowBackdropDialog,
    setShowColorInput,
    setShowReviewDialog,
    setTurnedCube,
    setWebcamFace,
    setWebcamOpen,
    showBackdropDialog,
    showColorInput,
    showReviewDialog,
    stableFrames,
    turnOverlay,
    turnedCube,
    updatableName,
    uploadFixture,
    warning,
    webcamFace,
    webcamOpen,
    webcamRef,
    wizardMorphing,
  }
}

export type ScannerAppModel = ReturnType<typeof useScannerAppModel>

import { render } from 'preact'
import { useState, useEffect, useRef } from 'preact/hooks'
// Fonts bundled with the app rather than loaded from Google Fonts, which
// would send every visitor's IP address to Google.
import '@fontsource/space-grotesk/500.css'
import '@fontsource/space-grotesk/600.css'
import '@fontsource/space-grotesk/700.css'
import '@fontsource/ibm-plex-sans/400.css'
import '@fontsource/ibm-plex-sans/500.css'
import '@fontsource/ibm-plex-sans/600.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import '@fontsource/ibm-plex-mono/600.css'
import '../../web/style.css'
import '../../web/capture.css'
import '../../web/review.css'
import type { TurnCuePose } from './autoCapture'
import { CaptureLiveView } from './captureLiveView'
import { CaptureDialog } from './captureDialog'
import { CaptureReviewDialog } from './captureReviewDialog'
import { OrientationApprovalDialog } from './orientationApprovalDialog'
import {
  OrientationWizardDialog,
  type OrientationWizardState,
} from './orientationWizardDialog'
import { CaptureColorPicker } from './captureColorPicker'
import {
  captureBackgroundGains,
  recalibrateCapture,
} from './captureFinalization'
import { CaptureSettings, CubeSelectOptions } from './captureSettings'
import type { FaceCaptureData, PreviewColorProfile } from './captureTypes'
import {
  planCaptureReview,
  readyAssemblyAfterCapture,
  rejectAlternatives,
  type CaptureApproval,
} from './captureReviewRouting'
import {
  decodeOrbit64State,
  looksLikeOrbit64StateToken,
} from '../cube/notation/orbit64'
import type { ReviewCapture } from './colorReviewPage'
import { BackdropDialog } from './backdropDialog'
import { FixtureDownloadDialog } from './fixtureDownloadDialog'
import { useFixtureDownload } from './useFixtureDownload'
import { useCameraStream, withoutDeviceIds } from './useCameraStream'
import { useCaptureFeedback } from './useCaptureFeedback'
import { useLiveCaptureAnalysis } from './useLiveCaptureAnalysis'
import {
  captureCameraPhoto,
  importCapturePhoto,
  type CaptureMode,
} from './capturePhoto'
import { CubeDisplayCard } from './cubeDisplayCard'
import { NotationCard } from './notationCard'
import { ManualFaceletInput } from './manualFaceletInput'
import { CaptureCard } from './captureCard'
import { ColorProfileControls } from './colorProfileControls'
import { lazy, Suspense } from 'preact/compat'

const ProfilesPage = lazy(() =>
  import('./profilesPage').then((m) => ({ default: m.ProfilesPage })),
)
import {
  orderPhotoUploads,
  uploadKind,
  type PhotoFrameMode,
  type SelectedPhoto,
} from './photoUpload'
import { PhotoUploadReview } from './photoUploadReview'
import { readPhotoUploads } from './readPhotoUploads'
import { repositoryLink } from './repositoryLink'
import { profilesHash, profilesTab } from './profilesRoute'
import {
  AUTO_CAPTURE_COOKIE,
  CUBE_SIZE_COOKIE,
  CUBE_VIEW_COOKIE,
  MIRROR_COOKIE,
  SOUND_COOKIE,
  preferenceCookie,
  readPreference,
  selectedCubeSize,
  selectedCubeView,
  selectionCookie,
} from './preferences'
import { runFullParity, type ParityResult } from '../cube/parity'
import { pickWizardFace } from '../cube/orientationWizard'
import {
  runGlobalWhiteBalance,
  backdropReference,
  BACKGROUND_WB_METHOD,
  NEUTRAL_GAINS,
  CROP_JPEG_QUALITY,
  DEFAULT_SAMPLING,
  STICKER_MEASUREMENT,
  STICKER_COLORS,
  type ColorDetectionResult,
  type FaceCaptureResult,
  type RGB,
} from './imageProcessing'
import {
  assembleCubeFromFaces,
  validateFaceColors,
  createSolvedCube,
  toCubeIR,
  checkGuidedCenters,
  findRepeatedFaces,
  findCaptureSlotForOrientedFace,
  captureCenterSlots,
  placeCapturedFace,
  type OrientedCandidate,
  type OrientationSolution,
  type FaceKey,
  type CubeState,
} from '../cube/cubeAssembly'
import {
  allCubes,
  allColorProfiles,
  capturePalette,
  cubeGroupName,
  resolvedColorProfileSnapshot,
  selectCube,
  selectColorProfile,
  setAutoColorMatch,
  type UsedColorProfile,
} from './profileSettings'
import {
  canCreateProfileFromCapture,
  captureProfileFinding,
  profileToUpdate,
  type AutomaticResolution,
} from './colorProfileLearning'
import { readFixtureUpload } from './readFixtureUpload'
import {
  buildFixture,
  summarizeFixture,
  unzipUploadFiles,
  zipFixture,
} from './fixtureZip'
import { currentAppCommit } from './fixtureUpload'
import {
  CAPTURE_STEPS,
  FACE_DISPLAY_LABEL,
  FACE_ORDER,
  FACE_SHORT_LABEL,
  GUIDED_PROTOCOL,
  captureInstruction,
  describeCenterIssue,
  glareFacesToWarn,
} from './captureSteps'
import {
  COLOR_NAME,
  COLOR_ORDER,
  STICKER_HEX,
  confidenceTier,
} from './stickerDisplay'
import { computeColorStats } from './colorStats'
import { flyInto, morphInto } from './flyAnimation'
import { focusModalOnOpen, handleModalKeyDown } from './modalFocus'
import { useProfileStore } from './useProfileStore'
import {
  toWRGFacelets,
  fromWRGFacelets,
  fromURFFacelets,
  detectNotationFormat,
  gridsToWRGFacelets,
} from '../cube/notation/NotationOutput.gen'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

// Injected at build time by vite.config.ts's `define`.
declare const __APP_VERSION__: string
declare const __APP_COMMIT__: string

// ─────────────────────────────────────────────────────────────────────────────
// Parity Check
// ─────────────────────────────────────────────────────────────────────────────

function checkParity(cube: CubeState, size: number): ParityResult {
  return runFullParity(toCubeIR(cube, size))
}

const CALIBRATION_NOTE = 'Colors double-checked by comparing all 6 sides.'

// ─────────────────────────────────────────────────────────────────────────────
// App Component
// ─────────────────────────────────────────────────────────────────────────────

function App() {
  const [puzzleSize, setPuzzleSize] = useState(
    () => selectedCubeSize(document.cookie) ?? 3,
  )
  const [cube, setCube] = useState<CubeState | null>(null)
  const [turnedCube, setTurnedCube] = useState<{
    source: CubeState
    value: CubeState
    moves: import('./cubeView3D').CubeTurn[]
  } | null>(null)
  const [cubeViewMode, setCubeViewMode] = useState<'net' | '3d'>(
    () => selectedCubeView(document.cookie) ?? 'net',
  )
  const [parity, setParity] = useState<ParityResult | null>(null)
  const [webcamOpen, setWebcamOpen] = useState(false)
  const [captureMode, setCaptureMode] = useState<CaptureMode>('cv')
  // Auto capture, sound and mirror start off; the viewer's choices are kept
  // in cookies (see preferences.ts).
  const [autoCapture, setAutoCapture] = useState(() =>
    readPreference(document.cookie, AUTO_CAPTURE_COOKIE),
  )
  const [autoCaptureFrames, setAutoCaptureFrames] = useState(0)
  const [autoCapturePaused, setAutoCapturePaused] = useState(false)
  const [captureSound, setCaptureSound] = useState(() =>
    readPreference(document.cookie, SOUND_COOKIE),
  )
  const {
    flash: captureFlash,
    armAudio: armCaptureAudio,
    signalCapture,
  } = useCaptureFeedback(captureSound)
  const lastCapturedColors = useRef<string[][] | null>(null)
  const lastCapturedPose = useRef<TurnCuePose | null>(null)
  const [webcamFace, setWebcamFace] = useState('U')
  const [capturedFaces, setCapturedFaces] = useState<
    Record<string, FaceCaptureData>
  >({})
  const [faceConfidence, setFaceConfidence] = useState<Record<string, number>>(
    {},
  )
  const [loading, setLoading] = useState(false)
  const [captureMessage, setCaptureMessage] = useState('')
  const [photoUpload, setPhotoUpload] = useState<SelectedPhoto[] | null>(null)
  const photoUploadUrls = useRef<string[]>([])
  useEffect(
    () => () =>
      photoUploadUrls.current.forEach((url) => URL.revokeObjectURL(url)),
    [],
  )
  const [turnOverlay, setTurnOverlay] = useState<{
    step: number
    startColors: string[][]
    viaColors?: string[][]
  } | null>(null)
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
  const [notationFormat, setNotationFormat] = useState<'wrg' | 'urf'>('wrg')
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
  // Non-null only when solveFaceOrientations found genuine ambiguity (see
  // its alternatives field) - drives the step-by-step orientation wizard
  // (see pickWizardFace/groupWizardOptions above) that narrows `remaining`
  // down to one candidate before assembly can proceed, instead of dumping
  // every alternative in one overwhelming grid. `truncated` mirrors
  // OrientationSolution.truncated: more genuinely-distinct ties existed
  // than the solver could keep, so `remaining` may not include every
  // possibility - shown to the customer rather than silently hidden.
  // `picked` lists the faces the customer answered directly; every other
  // settled face was inferred (see the progress net's dimming).
  const [orientationWizard, setOrientationWizard] =
    useState<OrientationWizardState | null>(null)
  // True while a picked option is animating into the net - blocks a second
  // pick from landing mid-flight.
  const [wizardMorphing, setWizardMorphing] = useState(false)
  // The arrangement(s) of the captured faces waiting for the customer's
  // OK (see handleConfirmReview): one to approve, a few to pick from, or a
  // closest match that isn't a valid cube. `fallback` feeds the wizard if
  // they say no.
  const [orientationApproval, setOrientationApproval] =
    useState<CaptureApproval | null>(null)
  // Capture-time warnings the customer chose to ignore (see captureWarning).
  const [dismissedCaptureWarnings, setDismissedCaptureWarnings] = useState<
    string[]
  >([])
  // capture.protocol of the last uploaded fixture (see isGuidedCapture).
  const [uploadedProtocol, setUploadedProtocol] = useState<string | null>(null)
  // A problem with the capture shown in the review dialog.
  const [reviewNotice, setReviewNotice] = useState<string | null>(null)
  const [reviewEditingCell, setReviewEditingCell] = useState<{
    face: string
    row: number
    col: number
  } | null>(null)
  // Most laptop/webcam feeds are shown mirrored by convention (like a
  // physical mirror), which is what most users expect; default on but
  // let it be turned off for cameras that don't need it (e.g. a rear
  // phone camera fed in via some capture setups).
  const [mirrorPreview, setMirrorPreview] = useState(() =>
    readPreference(document.cookie, MIRROR_COOKIE),
  )
  const changePreference = (
    name: string,
    set: (on: boolean) => void,
    on: boolean,
  ) => {
    set(on)
    document.cookie = preferenceCookie(name, on)
  }
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
  useEffect(() => {
    document.cookie = selectionCookie(CUBE_SIZE_COOKIE, String(puzzleSize))
  }, [puzzleSize])
  useEffect(() => {
    document.cookie = selectionCookie(CUBE_VIEW_COOKIE, cubeViewMode)
  }, [cubeViewMode])
  const liveAutoColorProfile = autoColorProfiles.find(
    (candidate) => candidate.id === liveAutoColorProfileId,
  )
  // Upload Fixture option: start the review from what detection reads
  // today instead of the colors the fixture was saved with, so a capture
  // can be reviewed afresh without its earlier hand corrections.
  const [ignoreFixtureCorrections, setIgnoreFixtureCorrections] =
    useState(false)
  // The 6 colors as learned from this capture's own stickers (null when the
  // cross-face recalibration didn't run) - what the color-fix picker scores
  // each alternative against.
  const [learnedPalette, setLearnedPalette] = useState<Record<
    string,
    RGB
  > | null>(null)
  // Learned colors whose cluster mixed two colors (see mixedUpClusters).
  const [mixedUpColors, setMixedUpColors] = useState<string[]>([])
  const [pendingPalette, setPendingPalette] = useState<{
    colors: Record<string, RGB>
    confidentFraction: number
    recalibrated: boolean
  } | null>(null)
  // The cube geometry and colors selected when this capture was taken.
  const [captureProfile, setCaptureProfile] = useState<{
    id?: string
    name: string
  } | null>(null)
  const [resolvedColorProfile, setResolvedColorProfile] =
    useState<UsedColorProfile | null>(null)
  const [resolvedColorReference, setResolvedColorReference] = useState<Record<
    string,
    RGB
  > | null>(null)
  // Why Automatic settled on its six-face profile (or on none).
  const [automaticResolution, setAutomaticResolution] =
    useState<AutomaticResolution | null>(null)
  // Applied for this session even when the browser won't keep it.
  // '#profiles' shows the profiles page instead of the scanner.
  const [page, setPage] = useState(() => location.hash)
  useEffect(() => {
    const onHash = () => setPage(location.hash)
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  const [globalWhiteBalanceNote, setGlobalWhiteBalanceNote] = useState<
    string | null
  >(null)
  // Faces with glare-washed stickers, when enough to warn (see glareStickers).
  const [glareFaces, setGlareFaces] = useState<string[]>([])
  // The per-face background-derived gains actually applied this capture
  // (see computeBackgroundGains) - recorded in saved fixtures, which
  // replay them.
  const [appliedBackgroundGains, setAppliedBackgroundGains] = useState<Record<
    string,
    RGB
  > | null>(null)
  const [showBackdropDialog, setShowBackdropDialog] = useState(false)
  const [reviewStep, setReviewStep] = useState(0)
  const [reviewRouting, setReviewRouting] = useState<{
    faces: Record<string, FaceCaptureData>
    glare: string[]
    mixedUp: string[]
  } | null>(null)
  const { videoRef: webcamRef, cameraInfo } = useCameraStream(webcamOpen)
  // A face just captured, to fly from the scan square into its net slot
  // once the slot has rendered it (see CaptureNet / flyInto).
  const pendingFlyIn = useRef<{ slot: string; from: DOMRect } | null>(null)
  const dismissTurnOverlay = () => {
    setTurnOverlay(null)
  }

  const continueTurnOverlay = () => {
    // An identical-looking side cannot be told apart by sticker letters.
    // Continue explicitly confirms that the cube has been turned.
    lastCapturedColors.current = null
    lastCapturedPose.current = null
    dismissTurnOverlay()
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
    setFaceConfidence({})
    lastCapturedColors.current = null
    lastCapturedPose.current = null
    setWebcamFace(FACE_ORDER[0])
    setLiveDetection(null)
    setShowReviewDialog(false)
    setReviewStep(0)
    setReviewEditingCell(null)
    setOrientationWizard(null)
    setOrientationApproval(null)
    setReviewNotice(null)
    setGlobalWhiteBalanceNote(null)
    setGlareFaces([])
    setAppliedBackgroundGains(null)
    setLearnedPalette(null)
    setMixedUpColors([])
    setPendingPalette(null)
    setProfileLearningOffer(null)
    setCaptureProfile(null)
    setResolvedColorProfile(null)
    setAutomaticResolution(null)
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
    setResolvedColorProfile(null)
    setAutomaticResolution(null)

    const solvedFaceGrid = (color: string): string[][] =>
      Array.from({ length: puzzleSize }, () => Array(puzzleSize).fill(color))
    const solvedColors: Record<string, string> = {
      U: 'W',
      R: 'R',
      F: 'G',
      D: 'Y',
      L: 'O',
      B: 'B',
    }

    const newCapturedFaces: Record<string, FaceCaptureData> = {}
    for (const face of FACE_ORDER) {
      newCapturedFaces[face] = {
        colors: solvedFaceGrid(solvedColors[face]),
        confidence: 1.0,
        timestamp: Date.now(),
      }
    }
    setCapturedFaces(newCapturedFaces)
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
      const trimmedInput = manualColorInput.trim()
      const isOrbit64Token = looksLikeOrbit64StateToken(trimmedInput)
      const decodedToken = isOrbit64Token
        ? decodeOrbit64State(trimmedInput)
        : null
      const effectiveFormat = isOrbit64Token
        ? 'urf'
        : (detectNotationFormat(manualColorInput) ?? notationFormat)
      const newCube = isOrbit64Token
        ? decodedToken && fromURFFacelets(decodedToken)
        : effectiveFormat === 'wrg'
          ? fromWRGFacelets(manualColorInput)
          : fromURFFacelets(manualColorInput)
      if (!newCube) {
        alert(
          isOrbit64Token
            ? 'Invalid Orbit64 state token. Only canonical 2×2–7×7 state tokens are supported.'
            : effectiveFormat === 'wrg'
              ? 'Invalid facelets. Must be 6 space-separated blocks of equal, perfect-square length (9 for 3×3, 25 for 5×5, ...) using colors W, O, G, R, B, Y, in U R F D L B order.'
              : 'Invalid facelets. Must be 6 space-separated blocks of equal, perfect-square length (9 for 3×3, 25 for 5×5, ...) using letters U, R, F, D, L, B (the face each sticker matches when solved), in U R F D L B order.',
        )
        return
      }
      if (effectiveFormat !== notationFormat) setNotationFormat(effectiveFormat)

      const size = Math.sqrt(newCube.u.length)
      setPuzzleSize(size)
      setCube(newCube)
      setResolvedColorProfile(null)
      setAutomaticResolution(null)

      const toGrid = (data: string[]): string[][] =>
        Array.from({ length: size }, (_, r) =>
          data.slice(r * size, r * size + size),
        )
      const newCapturedFaces: Record<string, FaceCaptureData> = {}
      for (const [face, data] of Object.entries(newCube)) {
        newCapturedFaces[face.toUpperCase()] = {
          colors: toGrid(data),
          confidence: 1.0,
          timestamp: Date.now(),
        }
      }
      setCapturedFaces(newCapturedFaces)

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
    try {
      const result = checkParity(cubeState, sizeOverride ?? puzzleSize)
      setParity(result)
    } catch (err) {
      console.error('Parity check error:', err)
      setParity({
        valid: false,
        result: err instanceof Error ? err.message : 'Parity check failed',
        checks: {},
      })
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Features: Face Capture Modal (#5)
  // ─────────────────────────────────────────────────────────────────────────

  // Continue from the first empty slot, or start over when requested (and
  // after all six are already complete).
  const handleOpenCapture = (restart = false) => {
    armCaptureAudio()
    dismissTurnOverlay()
    lastCapturedColors.current = null
    lastCapturedPose.current = null
    const allCaptured = FACE_ORDER.every((f) => f in capturedFaces)
    const startOver = restart || allCaptured
    if (startOver) {
      setCapturedFaces({})
      setFaceConfidence({})
      setResolvedColorProfile(null)
      setAutomaticResolution(null)
      setProfileLearningOffer(null)
      setNewColorName(null)
    }
    const nextFace = startOver
      ? FACE_ORDER[0]
      : FACE_ORDER.find((f) => !(f in capturedFaces))!
    setWebcamFace(nextFace)
    setCaptureMessage('')
    if (startOver) setDismissedCaptureWarnings([])
    setGlobalWhiteBalanceNote(null)
    setGlareFaces([])
    setAppliedBackgroundGains(null)
    setResolvedColorReference(null)
    setWebcamOpen(true)
  }

  // Stores a capture result for `face`, routes all 6 faces through final
  // calibration and review/assembly, and otherwise advances to the next
  // uncaptured face so the user doesn't have to close/reopen it per face.
  const applyFaceCapture = async (
    face: string,
    result: {
      colors: string[][]
      confidence: number
      cellConfidences?: number[][]
      cellColors?: RGB[][]
      croppedImage?: string
      backgroundColor?: RGB | null
      frame?: FaceCaptureResult['frame']
      crop?: FaceCaptureResult['crop']
      sharpness?: number
    },
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

    const requestedIndex = FACE_ORDER.indexOf(face)
    const { index: assignedIndex, unexpectedCenter } = placeCapturedFace(
      FACE_ORDER.map((f) => capturedFaces[f]?.colors),
      requestedIndex,
      result.colors,
    )
    const assignedFace = FACE_ORDER[assignedIndex]
    if (pendingFlyIn.current) pendingFlyIn.current.slot = assignedFace

    const newCapturedFaces = {
      ...capturedFaces,
      [assignedFace]: {
        colors: result.colors,
        detectedColors: result.colors,
        cellConfidences: result.cellConfidences,
        cellColors: result.cellColors,
        confidence: result.confidence,
        croppedImage: result.croppedImage,
        backgroundColor: result.backgroundColor,
        frame: result.frame,
        crop: result.crop,
        sharpness: result.sharpness,
        cameraSettings,
        source,
        ...(previewColorProfile && { previewColorProfile }),
        outOfOrder:
          unexpectedCenter ||
          assignedIndex !== requestedIndex ||
          capturedFaces[assignedFace]?.outOfOrder,
        timestamp: Date.now(),
      },
    }

    setCapturedFaces(newCapturedFaces)
    lastCapturedColors.current = source === 'camera' ? result.colors : null
    lastCapturedPose.current =
      source === 'camera' && result.crop
        ? {
            centerX: result.crop.x + result.crop.width / 2,
            centerY: result.crop.y + result.crop.height / 2,
            size: result.crop.width,
            angle: ((result.crop.angle ?? 0) * Math.PI) / 180,
          }
        : null
    setFaceConfidence({ ...faceConfidence, [assignedFace]: result.confidence })
    setCaptureMessage(
      `✓ ${FACE_DISPLAY_LABEL[assignedFace]} captured (${(result.confidence * 100).toFixed(0)}% confidence)` +
        (unexpectedCenter
          ? " - its center isn't the suggested one; check it in the review"
          : ''),
    )

    const allFacesCaptured = FACE_ORDER.every((f) => f in newCapturedFaces)
    if (allFacesCaptured) {
      await finalizeAllFacesCaptured(newCapturedFaces)
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
          window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
          FACE_ORDER.some((f) => newCapturedFaces[f]?.outOfOrder)
        )
          return
        const step = FACE_ORDER.indexOf(nextFace)
        setTurnOverlay({
          step,
          startColors: result.colors,
          viaColors:
            step === 5 ? newCapturedFaces[FACE_ORDER[3]]?.colors : undefined,
        })
      }
    }
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
    setPendingPalette(null)
    setProfileLearningOffer(null)
    const automatic = automaticColors
    setResolvedColorProfile(
      automatic ? null : resolvedColorProfileSnapshot(colorProfile, 'manual'),
    )
    setAutomaticResolution(null)
    setResolvedColorReference(null)

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
        setAutomaticResolution(result.resolution)
        setResolvedColorReference(result.reference)
        setResolvedColorProfile(result.resolvedProfile)
        setLearnedPalette(result.learnedPalette)
        finalMixedUp = result.mixedUp
        setMixedUpColors(finalMixedUp)
        setPendingPalette(result.pendingPalette)
        setCaptureProfile({ id: profile.id, name: profile.name })
        // Keep calibration provisional until the customer approves the
        // complete cube in the orientation review.
        if (result.applied) {
          finalFaces = result.finalFaces
          setCapturedFaces(result.finalFaces)
          setGlobalWhiteBalanceNote(CALIBRATION_NOTE)
        } else {
          setGlobalWhiteBalanceNote(null)
        }
        finalGlare = result.glare
        setGlareFaces(finalGlare)
      } catch (err) {
        console.error('Global white balance error:', err)
        setGlobalWhiteBalanceNote(null)
        setGlareFaces([])
        setLearnedPalette(null)
        setMixedUpColors([])
        setPendingPalette(null)
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

  // Restores a fixture saved earlier via handleSaveFixture - the customer
  // selects its zip, or a fixture directory's (test/fixtures/<name>/)
  // meta.json together with its 6 face-*.jpg photos (one multi-file
  // picker covers both). Colors are
  // re-detected from the photos through the same pipeline a live capture
  // uses (runGlobalWhiteBalance), replaying the per-face gains recorded at
  // capture time - so a detection problem reproduces exactly as the
  // customer saw it. meta.json's colors (the human-reviewed answer) are
  // kept as the final colors; wherever detection disagrees, the review
  // wizard marks the sticker with what was detected (see detectedColors).
  // Faces are restored under whatever slot key they were saved under
  // (meta.json's "u"/"r"/... - the ORIGINAL capture-order slot, not
  // necessarily true physical identity, since capturedFaces itself is never
  // rewritten to reflect solveFaceOrientations' answer - see
  // handleConfirmReview), so reloading a fixture faithfully reproduces what
  // solveFaceOrientations would have seen the first time.
  const handleUploadFixture = async (files: File[]) => {
    setLoading(true)
    setCaptureMessage('Loading fixture...')

    try {
      const loaded = await readFixtureUpload(files)
      if (!loaded.ok) {
        setCaptureMessage(loaded.message)
        return
      }
      const { meta, entries: newEntries } = loaded

      setCaptureMessage('Detecting colors from the fixture photos...')
      setPendingPalette(null)
      setProfileLearningOffer(null)
      setUploadedProtocol(meta.capture?.protocol ?? null)
      const recordedProfile = meta.capture?.profile
      setCaptureProfile(
        recordedProfile?.name
          ? { id: recordedProfile.id, name: recordedProfile.name }
          : null,
      )
      const recordedColors = meta.capture?.colorProfile
      setResolvedColorProfile(
        recordedColors?.name && recordedColors.colors ? recordedColors : null,
      )
      // The recorded reason for it, where the fixture has one.
      const recordedResolution = meta.capture?.colorResolution
      setAutomaticResolution(
        recordedResolution?.reason
          ? {
              profile: null,
              reason: recordedResolution.reason,
              nearest: (recordedResolution.nearest ?? []).map(
                ({ id, name, fit }) => ({
                  profile: { id, name, colors: {}, captures: 0 },
                  fit,
                }),
              ),
            }
          : null,
      )
      setResolvedColorReference(meta.capture?.colorReference ?? null)
      const images = Object.fromEntries(
        Object.entries(newEntries).map(([f, d]) => [f, d.croppedImage!]),
      )
      // Background gains are replayed only if made the current way (see
      // BACKGROUND_WB_METHOD); older ones swapped red and orange.
      const recordedGains =
        meta.capture?.backgroundWhiteBalanceMethod === BACKGROUND_WB_METHOD
          ? (meta.capture.backgroundWhiteBalance ?? null)
          : null
      const wb = await runGlobalWhiteBalance(
        images,
        meta.gridSize,
        recordedGains ?? undefined,
        meta.capture?.sampling ?? DEFAULT_SAMPLING,
        meta.capture?.colorReference ?? undefined,
      )
      let mismatches = 0
      for (const [f, entry] of Object.entries(newEntries)) {
        const det = wb.faces[f]
        entry.detectedColors = det.colors
        entry.cellColors = det.cellColors
        entry.cellConfidences = det.cellConfidences
        entry.cellLookalikes = det.cellLookalikes
        entry.confidence = det.confidence
        entry.colors.forEach((row, r) =>
          row.forEach((color, c) => {
            if (det.colors[r][c] !== color) mismatches++
          }),
        )
        if (ignoreFixtureCorrections)
          entry.colors = det.colors.map((row) => [...row])
      }
      setAppliedBackgroundGains(recordedGains)
      setGlareFaces(glareFacesToWarn(wb.glare))
      setGlobalWhiteBalanceNote(wb.applied ? CALIBRATION_NOTE : null)
      setLearnedPalette(wb.learned?.colors ?? null)
      setMixedUpColors(wb.learned?.mixedUpColors ?? [])

      setPuzzleSize(meta.gridSize)
      setCapturedFaces(newEntries)
      setFaceConfidence(
        Object.fromEntries(
          Object.entries(newEntries).map(([f, d]) => [f, d.confidence]),
        ),
      )
      const stickers = `${mismatches} sticker${mismatches === 1 ? '' : 's'}`
      setCaptureMessage(
        mismatches === 0
          ? `✓ Loaded fixture - detection matches all stickers.`
          : ignoreFixtureCorrections
            ? `✓ Loaded fixture with detected colors only - dropped the saved choice on ${stickers}.`
            : `✓ Loaded fixture - detection differs on ${stickers} (marked in the review).`,
      )
      setReviewStep(0)
      setShowReviewDialog(true)
    } finally {
      setLoading(false)
    }
  }

  const closePhotoUpload = () => {
    photoUploadUrls.current.forEach((url) => URL.revokeObjectURL(url))
    photoUploadUrls.current = []
    setPhotoUpload(null)
  }

  const changePhotoUploadMode = (index: number, mode: PhotoFrameMode) => {
    setPhotoUpload(
      (current) =>
        current?.map((entry, position) =>
          position === index ? { ...entry, mode } : entry,
        ) ?? null,
    )
  }

  const movePhotoUpload = (index: number, direction: -1 | 1) => {
    setPhotoUpload((current) => {
      if (!current) return current
      const ordered = [...current]
      ;[ordered[index], ordered[index + direction]] = [
        ordered[index + direction],
        ordered[index],
      ]
      return ordered
    })
  }

  const handleSelectPhotos = (files: File[]) => {
    try {
      const ordered = orderPhotoUploads(files)
      closePhotoUpload()
      const selected = ordered.map((file) => ({
        file,
        url: URL.createObjectURL(file),
        mode: 'auto' as const,
      }))
      photoUploadUrls.current = selected.map(({ url }) => url)
      setPhotoUpload(selected)
      setCaptureMessage('')
    } catch (err) {
      setCaptureMessage(
        `❌ ${err instanceof Error ? err.message : 'Could not select photos.'}`,
      )
    }
  }

  const handleUploadFiles = async (e: Event) => {
    const input = e.currentTarget as HTMLInputElement
    const selected = Array.from(input.files ?? [])
    if (selected.length === 0) return
    try {
      const files: File[] = []
      for (const file of selected) {
        if (file.name.toLowerCase().endsWith('.zip'))
          files.push(
            ...unzipUploadFiles(new Uint8Array(await file.arrayBuffer())),
          )
        else files.push(file)
      }
      if (uploadKind(files) === 'fixture') await handleUploadFixture(files)
      else handleSelectPhotos(files)
    } catch (err) {
      setCaptureMessage(
        `❌ Could not open files: ${err instanceof Error ? err.message : String(err)}`,
      )
    } finally {
      input.value = ''
    }
  }

  const handleUploadPhotos = async () => {
    if (!photoUpload || loading) return
    setLoading(true)
    setCaptureMessage('Reading six photos...')
    try {
      const entries = await readPhotoUploads({
        photos: photoUpload,
        size: puzzleSize,
        captureMode,
        sampling,
        palette: automaticColors ? undefined : capturePalette(profileStore),
        faceOrder: FACE_ORDER,
      })
      setCapturedFaces(entries)
      setFaceConfidence(
        Object.fromEntries(
          FACE_ORDER.map((face) => [face, entries[face].confidence]),
        ),
      )
      setUploadedProtocol(null)
      setDismissedCaptureWarnings([])
      closePhotoUpload()
      await finalizeAllFacesCaptured(entries)
    } catch (err) {
      console.error('Photo upload error:', err)
      setCaptureMessage(
        `❌ ${err instanceof Error ? err.message : 'Could not read photos.'}`,
      )
    } finally {
      setLoading(false)
    }
  }

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

  // After color review, or automatically for a high-confidence valid cube:
  // works out how the 6 photos fit together and
  // asks the customer to approve it, falling back step by step -
  //   guided capture (camera, sides then top/bottom): the 64 arrangements
  //   the turning pattern allows (solveGuidedCapture);
  //   otherwise, or if none of those is a valid cube: any arrangement at
  //   all (solveFaceOrientations), which also catches a capture that
  //   didn't follow the pattern;
  //   if nothing is a valid cube: the closest match, flagged, which can
  //   still be used or rejected.
  // Rejecting an arrangement opens the "Which way is your ... face?"
  // wizard with the remaining ones.
  const handleConfirmReview = (
    precomputedFree?: OrientationSolution | null,
  ) => {
    setReviewNotice(null)
    const faceData = Object.fromEntries(
      FACE_ORDER.map((face) => [face, capturedFaces[face].colors]),
    )
    const plan = planCaptureReview(
      faceData,
      FACE_ORDER,
      isGuidedCapture(),
      describeCenterIssue,
      precomputedFree,
    )
    switch (plan.kind) {
      case 'approval':
        setOrientationApproval(plan.approval)
        break
      case 'wizard':
        setOrientationWizard({
          remaining: plan.remaining,
          truncated: plan.truncated,
          picked: [],
        })
        break
      case 'notice':
        setReviewNotice(plan.message)
        break
      case 'choose':
        void handleChooseOrientation(plan.candidate)
        break
    }
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

  // Whether the current faces followed the guided protocol: a camera
  // capture, or an uploaded fixture that recorded it. Faces mixed with
  // imported photos may not have, so they use the any-order search.
  const isGuidedCapture = () =>
    (FACE_ORDER.every((f) => capturedFaces[f]?.source === 'camera') &&
      !FACE_ORDER.some((f) => capturedFaces[f]?.outOfOrder) &&
      !checkGuidedCenters(
        FACE_ORDER.slice(0, 2).map((f) => capturedFaces[f]?.colors),
      ).length) ||
    (FACE_ORDER.every((f) => capturedFaces[f]?.source === 'fixture') &&
      uploadedProtocol === GUIDED_PROTOCOL)

  const predictedCenters = captureCenterSlots(
    FACE_ORDER.map((f) => capturedFaces[f]?.colors),
  )
  const predictedCenter = predictedCenters[FACE_ORDER.indexOf(webcamFace)]
  const centerRoutingActive =
    puzzleSize % 2 === 1 &&
    Boolean(capturedFaces[FACE_ORDER[0]] && capturedFaces[FACE_ORDER[1]]) &&
    predictedCenters.every(Boolean) &&
    !capturedFaces[webcamFace]
  const capturedPhotos = FACE_ORDER.map((f) => capturedFaces[f]?.colors)
  const repeatedFaces = findRepeatedFaces(capturedPhotos)
  const matchingNetFaces = new Set(
    repeatedFaces.flatMap(([a, b]) => [FACE_ORDER[a], FACE_ORDER[b]]),
  )
  if (liveCapturedFace) matchingNetFaces.add(liveCapturedFace)

  // A likely capture mistake visible from odd-size centers while capturing
  // (see checkGuidedCenters) - only a hint, never blocking. Live colors are
  // first-pass readings that can confuse e.g. red and orange, so it only
  // speaks up when the centers involved were read with some confidence.
  // A whole face matching an earlier one (any size) comes first.
  const captureWarning = (() => {
    for (const [j, i] of repeatedFaces) {
      const key = `repeat:${j}:${i}`
      if (!dismissedCaptureWarnings.includes(key)) {
        return {
          text: `${CAPTURE_STEPS[i].label} and ${CAPTURE_STEPS[j].label} have matching patterns. They may be different faces; check both photos if unsure.`,
          key,
          retake: i,
        }
      }
    }
    const mid = Math.floor(puzzleSize / 2)
    const sure = (i: number) =>
      (capturedFaces[FACE_ORDER[i]]?.cellConfidences?.[mid]?.[mid] ?? 0) >= 0.6
    for (const issue of checkGuidedCenters(capturedPhotos)) {
      const involved =
        issue.kind === 'turned-twice'
          ? [issue.photo - 1, issue.photo]
          : issue.photos
      const key = JSON.stringify(issue)
      if (involved.every(sure) && !dismissedCaptureWarnings.includes(key)) {
        return {
          text: describeCenterIssue(issue),
          key,
          retake: Math.max(...involved),
        }
      }
    }
    return null
  })()

  // "No, let me choose each side" is only offered when the photos fit
  // together some other way too; the wizard then starts from every
  // arrangement (see wizardStart).
  const handleRejectOrientation = () => {
    if (!orientationApproval) return
    if (rejectAlternatives(orientationApproval).length === 0) return
    setOrientationApproval(null)
    // Every arrangement, the turned-down one included: the wizard only asks
    // about faces the remaining candidates disagree on and fills in the
    // rest, so leaving the suggestion out can drop a face's one alternative
    // - a pattern cube whose back face fits either way got it filled in
    // turned 90 degrees, never asked about. If the answers lead back to the
    // suggestion, it was right after all.
    setOrientationWizard({
      remaining: orientationApproval.fallback!.alternatives,
      truncated: orientationApproval.fallback!.truncated,
      picked: [],
    })
  }

  // Finishes assembly once the orientation wizard has narrowed down to a
  // single candidate - mirrors handleConfirmReview's tail end exactly,
  // since this IS that same step, just with the choice already made
  // instead of auto-picking alternatives[0].
  const handleChooseOrientation = async (chosen: OrientedCandidate) => {
    setOrientationWizard(null)
    setOrientationApproval(null)
    setReviewNotice(null)
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
      const correctedCells = FACE_ORDER.reduce((count, face) => {
        const captured = capturedFaces[face]
        if (!captured?.detectedColors) return count + puzzleSize * puzzleSize
        return (
          count +
          captured.colors.reduce(
            (sum, row, r) =>
              sum +
              row.filter(
                (color, c) => color !== captured.detectedColors?.[r]?.[c],
              ).length,
            0,
          )
        )
      }, 0)
      const evidence = {
        reviewedValid,
        cameraOnly: FACE_ORDER.every(
          (face) => capturedFaces[face]?.source === 'camera',
        ),
        recalibrated: pendingPalette.recalibrated,
        confidentFraction: pendingPalette.confidentFraction,
        correctedFraction: correctedCells / (6 * puzzleSize * puzzleSize),
      }
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

  // Advances the orientation wizard by one answer: narrows `remaining` to
  // whichever candidates matched the customer's pick for the face just
  // asked about, then either asks the next most-informative question or,
  // once every face agrees (pickWizardFace returns null), finishes
  // assembly with the single remaining candidate.
  const handleWizardAnswer = (matched: OrientedCandidate[], face: FaceKey) => {
    if (pickWizardFace(matched) === null) {
      void handleChooseOrientation(matched[0])
      return
    }
    setOrientationWizard((prev) =>
      prev
        ? {
            remaining: matched,
            truncated: prev.truncated,
            picked: [...prev.picked, face],
          }
        : null,
    )
  }

  // Clicking an option face flies it into the framed slot in the progress
  // net before the answer is applied, so the customer sees exactly where
  // their pick landed. The flying clone is removed in the next task, after
  // Preact's microtask re-render has already filled the slot - so the slot
  // never flashes back to its hatched placeholder in between. (A timer,
  // not requestAnimationFrame, since rAF doesn't fire in background tabs.)
  const handleWizardPick = async (
    optionEl: HTMLElement,
    candidates: OrientedCandidate[],
    face: FaceKey,
  ) => {
    if (wizardMorphing) return
    const source = optionEl.querySelector<HTMLElement>('.orientation-net-face')
    const target = document.querySelector<HTMLElement>(
      '.orientation-picker .orientation-net-face-current',
    )
    let removeClone = () => {}
    if (source && target) {
      setWizardMorphing(true)
      try {
        removeClone = await morphInto(source, target)
      } finally {
        setWizardMorphing(false)
      }
    }
    handleWizardAnswer(candidates, face)
    setTimeout(removeClone, 0)
  }

  // Packs this capture - each face's actual photo plus its (human-
  // reviewed/corrected) color grid - into a fixture zip (see fixtureZip.ts)
  // and shows what's in it before downloading (downloadFixture): unzipped
  // into test/fixtures/, it is a permanent regression fixture (see
  // test/fixtures.test.ts). Only meaningful once a
  // cube has actually been confirmed: that's the point at which
  // capturedFaces' colors reflect whatever corrections were made in the
  // review wizard, not just the raw first-pass detection.
  const handleSaveFixture = async () => {
    const allCaptured = FACE_ORDER.every((f) => capturedFaces[f]?.croppedImage)
    if (!allCaptured) {
      setFixtureSaveMessage('❌ Capture and confirm all 6 faces first.')
      return
    }
    const commit = import.meta.env.DEV
      ? await currentAppCommit(__APP_COMMIT__)
      : __APP_COMMIT__
    try {
      const faces: Record<string, { photo: string } & Record<string, unknown>> =
        {}
      for (const f of FACE_ORDER) {
        const face = capturedFaces[f]
        faces[f] = {
          photo: face.croppedImage!,
          // What the browser measured for each sticker (row-major, after the
          // face's gain) and detection's confidence in it, 0-100 - lets
          // the fixture test check its own JPEG decode reads the same.
          readings: face.cellColors
            ?.flat()
            .map(({ r, g, b }) =>
              [r, g, b].map((v) => Math.round(v * 10) / 10),
            ),
          confidences: face.cellConfidences
            ?.flat()
            .map((c) => Math.round(c * 100)),
          source: face.source,
          capturedAt: new Date(face.timestamp).toISOString(),
          background: face.backgroundColor,
          frame: face.frame,
          crop: face.crop,
          sharpness:
            face.sharpness !== undefined
              ? Math.round(face.sharpness * 10) / 10
              : undefined,
          camera: face.cameraSettings,
          previewColorProfile: face.previewColorProfile,
        }
      }
      const meta = {
        capturedAt: new Date().toISOString(),
        app: { version: __APP_VERSION__, commit },
        userAgent: navigator.userAgent,
        devicePixelRatio: window.devicePixelRatio,
        photo: { format: 'image/jpeg', quality: CROP_JPEG_QUALITY },
        mirrored: mirrorPreview,
        // Only meaningful when at least one face was shot with it - not for
        // a re-saved uploaded fixture or imported image files.
        camera: FACE_ORDER.some((f) => capturedFaces[f].source === 'camera')
          ? cameraInfo
          : null,
        // The cube profile the capture was taken with - same condition as
        // camera, since a re-saved upload wasn't shot with the current one.
        profile: FACE_ORDER.some((f) => capturedFaces[f].source === 'camera')
          ? captureProfile
          : null,
        // One resolved profile for the complete capture. The actual common
        // palette learned from all six photos is recorded below.
        colorProfile: resolvedColorProfile,
        // Why Automatic chose it: the reason and the nearest saved profiles.
        colorResolution: automaticResolution && {
          reason: automaticResolution.reason,
          nearest: automaticResolution.nearest.map(({ profile, fit }) => ({
            id: profile.id,
            name: profile.name,
            fit,
          })),
        },
        // A saved/manual profile acts as the six-face classification prior.
        // Automatic without a clear match uses only this capture's colors.
        colorReference: resolvedColorReference,
        // How the photos were taken (see CAPTURE_STEPS) and the cube they
        // were approved as - the fixture test puts the photos together
        // again and checks it gets that cube.
        protocol: isGuidedCapture() ? GUIDED_PROTOCOL : null,
        // How the per-face `readings` were measured (see stickerColor).
        measurement: STICKER_MEASUREMENT,
        assembledURFDLB: cube ? toWRGFacelets(cube) : null,
        // Two corrections run after all 6 faces are in: each face's
        // backdrop brought to the median of all six (backgroundWhiteBalance,
        // per-face gains - see computeBackgroundGains; each face's backdrop
        // reading is recorded per face), then the 6 colors learned from
        // this capture's own stickers (colorCalibration).
        backgroundWhiteBalance: appliedBackgroundGains,
        backgroundWhiteBalanceMethod: appliedBackgroundGains
          ? BACKGROUND_WB_METHOD
          : null,
        // Face border and sticker gap used to sample every face (see
        // SamplingGeometry) - replayed by the fixture test.
        sampling,
        // The 6 colors learned from this capture's stickers, which every
        // sticker was classified against (null when there weren't enough
        // stickers to learn from and the canonical colors were used).
        colorCalibration: {
          applied: globalWhiteBalanceNote !== null,
          learnedColors: learnedPalette
            ? Object.fromEntries(
                Object.entries(learnedPalette).map(([color, { r, g, b }]) => [
                  color,
                  [r, g, b].map((v) => Math.round(v * 10) / 10),
                ]),
              )
            : null,
        },
        // Per-color detected count/lightness/chroma/hue spread across all 6
        // faces at confirm time (see computeColorStats) - no longer shown
        // live in the review wizard (raw OKLCH ranges aren't actionable
        // mid-capture), but valuable here for offline analysis of a
        // reported detection problem against this exact fixture.
        colorStats: computeColorStats(capturedFaces, puzzleSize),
      }
      const fixture = buildFixture({
        gridSize: puzzleSize,
        colorsURFDLB: gridsToWRGFacelets(
          Object.fromEntries(
            FACE_ORDER.map((f) => [f, capturedFaces[f].colors]),
          ),
        ),
        // What detection said before any hand correction - the diff
        // against colorsURFDLB is exactly what a human had to fix.
        detectedURFDLB: FACE_ORDER.every((f) => capturedFaces[f].detectedColors)
          ? gridsToWRGFacelets(
              Object.fromEntries(
                FACE_ORDER.map((f) => [f, capturedFaces[f].detectedColors!]),
              ),
            )
          : undefined,
        faces,
        meta,
      })
      const summary = summarizeFixture(fixture)
      setFixtureSaveMessage('')
      setFixtureDownload({
        fixture,
        name: fixture.name,
        zip: zipFixture(fixture),
        summary,
        photoUrls: summary.photos.map((p) =>
          URL.createObjectURL(
            new Blob([p.bytes as BlobPart], {
              type: p.file.endsWith('.png') ? 'image/png' : 'image/jpeg',
            }),
          ),
        ),
      })
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
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  const displayedCube =
    cube && turnedCube?.source === cube ? turnedCube.value : cube
  const visibleCube = displayedCube ?? createSolvedCube(puzzleSize)
  const profilesPageTab = profilesTab(page)
  if (profilesPageTab) {
    // The last capture's faces that kept their measured sticker colors.
    const reviewCapture: ReviewCapture = {
      faces: FACE_ORDER.flatMap((face) => {
        const data = capturedFaces[face]
        return data?.cellColors && data.cellColors.length === data.colors.length
          ? [
              {
                face,
                label: FACE_DISPLAY_LABEL[face],
                colors: data.colors,
                cellColors: data.cellColors,
              },
            ]
          : []
      }),
    }
    // The first captured face photo shows the Cubes tab's sticker areas.
    const photoFace = FACE_ORDER.find(
      (face) => capturedFaces[face]?.croppedImage,
    )
    const reviewPhoto = photoFace
      ? {
          size: puzzleSize,
          src: capturedFaces[photoFace].croppedImage!,
          label: `${FACE_DISPLAY_LABEL[photoFace]} face`,
        }
      : null
    return (
      <Suspense
        fallback={
          <div class="color-review">
            <p class="color-review-muted">Loading profiles...</p>
          </div>
        }
      >
        <ProfilesPage
          tab={profilesPageTab}
          settings={profileStore}
          onChange={applyProfileStore}
          capture={reviewCapture.faces.length ? reviewCapture : null}
          photo={reviewPhoto}
          onClose={() => {
            location.hash = ''
          }}
          onExport={handleDownloadSampling}
          onImport={handleUploadSampling}
          fileMessage={samplingFileMessage}
        />
      </Suspense>
    )
  }

  const profileFinding =
    resolvedColorProfile?.selection === 'automatic'
      ? captureProfileFinding(
          FACE_ORDER.map((face) => capturedFaces[face])
            .sort((a, b) => (a?.timestamp ?? 0) - (b?.timestamp ?? 0))
            .map((face) => face?.previewColorProfile?.name),
          resolvedColorProfile.name,
          automaticResolution?.reason ?? null,
        )
      : null

  return (
    <div class="app-layout">
      {/* Header: name, cube geometry and color settings */}
      <header class="app-header">
        <div class="header-content">
          <svg
            class="app-logo"
            width="32"
            height="32"
            viewBox="0 0 32 32"
            aria-hidden="true"
          >
            <path
              d="M16 3 28 9.5v13L16 29 4 22.5v-13Z"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linejoin="round"
            />
            <path
              d="M4 9.5 16 16l12-6.5M16 16v13"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linejoin="round"
            />
            <path d="M16 3 28 9.5 16 16 4 9.5Z" fill="var(--color-accent)" />
          </svg>
          <div class="app-title">
            <h1>CubeAssembler</h1>
            <p>Photograph a cube, get its exact state</p>
          </div>
          <div class="header-spacer" />
          <span class="cube-current-name">{cubeGroupName(profile)}</span>
          <select
            class="header-profile"
            aria-label="Cube"
            value={profile.id}
            onChange={(e) => {
              if (!changeCube(e.currentTarget.value))
                e.currentTarget.value = profile.id
            }}
          >
            <CubeSelectOptions settings={profileStore} />
          </select>
          <select
            class="header-profile"
            aria-label="Colors"
            value={profileStore.activeColorsId}
            onChange={(e) =>
              applyProfileStore(
                selectColorProfile(profileStore, e.currentTarget.value),
              )
            }
          >
            {allColorProfiles(profileStore).map((colors) => (
              <option key={colors.id} value={colors.id}>
                {colors.name}
              </option>
            ))}
          </select>
          <a class="color-review-link" href="#profiles">
            Profiles
          </a>
        </div>
      </header>

      <main class="app-main">
        <div class="main-column">
          <CubeDisplayCard
            cube={cube}
            visibleCube={visibleCube}
            size={puzzleSize}
            parity={parity}
            capturedFaces={capturedFaces}
            faceOrder={FACE_ORDER}
            stickerColors={STICKER_HEX}
            colorNames={COLOR_NAME}
            confidenceTier={confidenceTier}
            viewMode={cubeViewMode}
            initialMoves={turnedCube?.source === cube ? turnedCube.moves : []}
            onViewModeChange={setCubeViewMode}
            onTurnStateChange={(value, moves) =>
              cube && setTurnedCube({ source: cube, value, moves })
            }
          />

          <NotationCard
            cube={displayedCube}
            size={puzzleSize}
            format={notationFormat}
            loading={loading}
            fixtureSaveMessage={fixtureSaveMessage}
            onFormatChange={setNotationFormat}
            onSaveFixture={handleSaveFixture}
          />
        </div>

        <div class="side-column">
          <CaptureCard
            capturedFaces={capturedFaces}
            loading={loading}
            captureProfileName={captureProfile?.name}
            resolvedColorProfile={cube ? resolvedColorProfile : null}
            profileFinding={profileFinding}
            calibrationUnavailable={!learnedPalette}
            onCompareBackdrop={
              appliedBackgroundGains ? () => setShowBackdropDialog(true) : null
            }
            message={webcamOpen ? '' : captureMessage}
            showColorInput={showColorInput}
            ignoreFixtureCorrections={ignoreFixtureCorrections}
            onOpenCapture={handleOpenCapture}
            onEditColors={() => {
              setReviewStep(0)
              setShowReviewDialog(true)
            }}
            onUploadFiles={handleUploadFiles}
            onToggleColorInput={() => setShowColorInput(!showColorInput)}
            onApplySolved={handleApplySolved}
            onIgnoreFixtureCorrectionsChange={setIgnoreFixtureCorrections}
            profileControls={
              cube &&
              FACE_ORDER.every((face) => capturedFaces[face]?.croppedImage) &&
              !showReviewDialog && (
                <ColorProfileControls
                  offer={profileLearningOffer}
                  updatableName={updatableName}
                  newName={newColorName}
                  onNewNameChange={setNewColorName}
                  onCreate={handleCreateColors}
                  onUpdate={handleUpdateColors}
                />
              )
            }
            photoUpload={
              photoUpload && (
                <PhotoUploadReview
                  photos={photoUpload}
                  size={puzzleSize}
                  captureMode={captureMode}
                  loading={loading}
                  onChangeMode={changePhotoUploadMode}
                  onMove={movePhotoUpload}
                  onCancel={closePhotoUpload}
                  onRead={handleUploadPhotos}
                />
              )
            }
            manualInput={
              showColorInput && (
                <ManualFaceletInput
                  size={puzzleSize}
                  format={notationFormat}
                  value={manualColorInput}
                  loading={loading}
                  onFormatChange={setNotationFormat}
                  onValueChange={setManualColorInput}
                  onApply={handleApplyFacelets}
                />
              )
            }
          />
        </div>
      </main>
      <footer class="app-footer">
        <a
          href={repositoryLink(__APP_COMMIT__).href}
          target="_blank"
          rel="noopener noreferrer"
        >
          {repositoryLink(__APP_COMMIT__).label}
        </a>
        {' · '}
        <a href={`${import.meta.env.BASE_URL}licenses/`}>
          Third-party licenses
        </a>
      </footer>

      {/* Webcam Modal */}
      {webcamOpen && (
        <CaptureDialog
          liveView={
            <CaptureLiveView
              webcamRef={webcamRef}
              mirrorPreview={mirrorPreview}
              captureMode={captureMode}
              liveDetection={liveDetection}
              liveFaceVisible={liveFaceVisible}
              liveNeedsRecentering={liveNeedsRecentering}
              liveCapturedFace={liveCapturedFace}
              liveAutoColorProfileName={liveAutoColorProfile?.name}
              liveMedianWB={liveMedianWB}
              automaticColors={automaticColors}
              autoCapture={autoCapture}
              autoCaptureFrames={autoCaptureFrames}
              autoCapturePaused={autoCapturePaused}
              captureFlash={captureFlash}
              captureSound={captureSound}
              turnOverlay={turnOverlay}
              capturedColors={Object.values(capturedFaces).map(
                (entry) => entry.colors,
              )}
              sampling={sampling}
              stickerColors={STICKER_HEX}
              faceLabels={FACE_DISPLAY_LABEL}
              onContinueTurn={continueTurnOverlay}
              onMirrorChange={(enabled) =>
                changePreference(MIRROR_COOKIE, setMirrorPreview, enabled)
              }
              onAutoCaptureChange={(enabled) =>
                changePreference(AUTO_CAPTURE_COOKIE, setAutoCapture, enabled)
              }
              onSoundChange={(enabled) => {
                changePreference(SOUND_COOKIE, setCaptureSound, enabled)
                armCaptureAudio(enabled)
              }}
            />
          }
          settings={
            <CaptureSettings
              profileStore={profileStore}
              profile={profile}
              puzzleSize={puzzleSize}
              colorProfileName={colorProfile.name}
              automaticColors={automaticColors}
              provisionalProfileName={provisionalColorProfile?.name}
              liveProfileName={liveAutoColorProfile?.name}
              mirrorPreview={mirrorPreview}
              noFacesCaptured={FACE_ORDER.every((f) => !capturedFaces[f])}
              newCubeName={newCubeName}
              newColorProfileName={newColorProfileName}
              loading={loading}
              turnCueShowing={turnOverlay !== null}
              onCubeChange={changeCube}
              onColorProfileChange={(id) =>
                applyProfileStore(selectColorProfile(profileStore, id))
              }
              onNewCubeNameChange={setNewCubeName}
              onNewColorProfileNameChange={setNewColorProfileName}
              onCreateCube={handleCreateCube}
              onCreateNamedColors={handleCreateNamedColors}
              onImportImage={handleImportImage}
            />
          }
          focusDialog={focusModalOnOpen}
          onDialogKeyDown={(event) =>
            handleModalKeyDown(event, event.currentTarget, () =>
              setWebcamOpen(false),
            )
          }
          onClose={() => setWebcamOpen(false)}
          face={webcamFace}
          faceOrder={FACE_ORDER}
          faceLabels={FACE_DISPLAY_LABEL}
          shortLabels={FACE_SHORT_LABEL}
          colorNames={COLOR_NAME}
          stickerColors={STICKER_HEX}
          size={puzzleSize}
          captureMode={captureMode}
          onModeChange={(mode) => {
            setCaptureMode(mode)
            setLiveDetection(null)
            setLiveFaceVisible(false)
          }}
          mirrorPreview={mirrorPreview}
          centerRoutingActive={centerRoutingActive}
          instruction={
            centerRoutingActive
              ? 'Show any uncaptured face. Its center color will place it in the capture net.'
              : captureInstruction(
                  FACE_ORDER.indexOf(webcamFace),
                  mirrorPreview,
                )
          }
          predictedCenter={predictedCenter}
          predictedCenters={predictedCenters}
          faces={Object.fromEntries(
            FACE_ORDER.map((f) => [f, capturedFaces[f]?.colors]),
          )}
          matchingNetFaces={matchingNetFaces}
          liveCapturedFace={liveCapturedFace}
          onSelectFace={(slot) => {
            dismissTurnOverlay()
            lastCapturedColors.current = null
            lastCapturedPose.current = null
            setWebcamFace(slot)
            setCaptureMessage('')
          }}
          cameraBlurOn={cameraInfo?.granted.backgroundBlur === true}
          captureWarning={captureWarning}
          onRetakeWarning={(step) => {
            lastCapturedColors.current = null
            lastCapturedPose.current = null
            setWebcamFace(FACE_ORDER[step])
            setCaptureMessage('')
          }}
          onIgnoreWarning={(key) =>
            setDismissedCaptureWarnings((keys) => [...keys, key])
          }
          captureMessage={captureMessage}
          loading={loading}
          turnCueShowing={turnOverlay !== null}
          autoCapture={autoCapture}
          onCapture={handleCapturePhoto}
        />
      )}

      {showReviewDialog && (
        <CaptureReviewDialog
          faceOrder={FACE_ORDER}
          faceLabels={FACE_DISPLAY_LABEL}
          shortLabels={FACE_SHORT_LABEL}
          colorNames={COLOR_NAME}
          stickerColors={STICKER_HEX}
          colorOrder={COLOR_ORDER}
          faces={capturedFaces}
          size={puzzleSize}
          step={reviewStep}
          captureProfileName={captureProfile?.name}
          globalNote={globalWhiteBalanceNote}
          reviewNotice={reviewNotice}
          glareFaces={glareFaces}
          mixedUpColors={mixedUpColors}
          confidenceTier={confidenceTier}
          focusDialog={focusModalOnOpen}
          onDialogKeyDown={(event) =>
            handleModalKeyDown(event, event.currentTarget, () =>
              setShowReviewDialog(false),
            )
          }
          onClose={() => setShowReviewDialog(false)}
          onStepChange={setReviewStep}
          onEditCell={(face, row, col) =>
            setReviewEditingCell({ face, row, col })
          }
          onRetake={handleRetakeFace}
          onConfirm={() => handleConfirmReview()}
        />
      )}

      {/* Orientation wizard - see orientationWizard/pickWizardFace/groupWizardOptions */}
      {/* Approval of how the captured faces fit together (see
          handleConfirmReview): one arrangement to confirm, a few to pick
          from, or a closest match that isn't a valid cube. */}
      {orientationApproval && !orientationWizard && (
        <OrientationApprovalDialog
          approval={orientationApproval}
          puzzleSize={puzzleSize}
          mirrorPreview={mirrorPreview}
          stickerColors={STICKER_HEX}
          focusDialog={focusModalOnOpen}
          onDialogKeyDown={(event) =>
            handleModalKeyDown(event, event.currentTarget, () =>
              setOrientationApproval(null),
            )
          }
          onClose={() => setOrientationApproval(null)}
          onCheckFace={(candidate, face) => {
            const slot = findCaptureSlotForOrientedFace(
              FACE_ORDER.map((key) => capturedFaces[key]?.colors),
              candidate.faces[face as FaceKey],
            )
            if (slot === null) return
            setOrientationApproval(null)
            setReviewStep(slot)
            setReviewEditingCell(null)
            setReviewNotice(null)
            setShowReviewDialog(true)
          }}
          onChoose={handleChooseOrientation}
          onReject={handleRejectOrientation}
          onPageChange={(page) =>
            setOrientationApproval((prev) => prev && { ...prev, page })
          }
        />
      )}

      {orientationWizard && (
        <OrientationWizardDialog
          wizard={orientationWizard}
          stickerColors={STICKER_HEX}
          morphing={wizardMorphing}
          focusDialog={focusModalOnOpen}
          onDialogKeyDown={(event) =>
            handleModalKeyDown(event, event.currentTarget, () =>
              setOrientationWizard(null),
            )
          }
          onClose={() => setOrientationWizard(null)}
          onChoose={handleChooseOrientation}
          onPick={handleWizardPick}
        />
      )}

      {reviewEditingCell && (
        <CaptureColorPicker
          editingCell={reviewEditingCell}
          faces={capturedFaces}
          learnedPalette={learnedPalette}
          palette={palette}
          defaultColors={STICKER_COLORS}
          stickerColors={STICKER_HEX}
          colorNames={COLOR_NAME}
          focusDialog={focusModalOnOpen}
          onDialogKeyDown={(event) =>
            handleModalKeyDown(event, event.currentTarget, () =>
              setReviewEditingCell(null),
            )
          }
          onFixColor={handleFixCellColor}
          onClose={() => setReviewEditingCell(null)}
        />
      )}

      {fixtureDownload && (
        <FixtureDownloadDialog
          download={fixtureDownload}
          faceLabels={FACE_DISPLAY_LABEL}
          serverChecked={fixtureServerChecked}
          serverReachable={fixtureServerReachable}
          serverPolling={fixtureServerPolling}
          uploading={fixtureUploading}
          uploadMessage={fixtureUploadMessage}
          onClose={closeFixtureDownload}
          onUpload={uploadFixture}
          onDownload={downloadFixture}
          focusModalOnOpen={focusModalOnOpen}
          onModalKeyDown={handleModalKeyDown}
        />
      )}
      {showBackdropDialog && appliedBackgroundGains && (
        <BackdropDialog
          faces={FACE_ORDER.filter((f) => capturedFaces[f]?.croppedImage).map(
            (f) => ({
              face: f,
              label: FACE_DISPLAY_LABEL[f],
              photo: capturedFaces[f].croppedImage!,
              gains: appliedBackgroundGains[f] ?? NEUTRAL_GAINS,
              background: capturedFaces[f].backgroundColor ?? null,
              stickers: capturedFaces[f].cellColors,
            }),
          )}
          reference={backdropReference(
            Object.fromEntries(
              FACE_ORDER.map((f) => [
                f,
                capturedFaces[f]?.backgroundColor ?? null,
              ]),
            ),
          )}
          onClose={() => setShowBackdropDialog(false)}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Hydrate
// ─────────────────────────────────────────────────────────────────────────────

const app = document.querySelector('#app')
if (app) {
  render(<App />, app)
}

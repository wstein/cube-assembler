import { render } from 'preact'
import { useState, useEffect, useRef, useMemo } from 'preact/hooks'
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
import type { TurnCuePose } from './autoCapture'
import { CaptureLiveView } from './captureLiveView'
import { CaptureDialog } from './captureDialog'
import { CaptureReviewDialog } from './captureReviewDialog'
import { CaptureColorPicker } from './captureColorPicker'
import {
  captureBackgroundGains,
  recalibrateCapture,
} from './captureFinalization'
import { CaptureSettings, CubeSelectOptions } from './captureSettings'
import type { FaceCaptureData, PreviewColorProfile } from './captureTypes'
import { FaceGrid } from './captureNet'
import {
  describeArrangement,
  OrientationNetPreview,
  FACE_LABELS,
  ORIENTATION_CHOICES_PER_PAGE,
} from './orientationPresentation'
import {
  planCaptureReview,
  readyAssemblyAfterCapture,
  type CaptureApproval,
} from './captureReviewRouting'
import {
  decodeOrbit64State,
  encodeOrbit64State,
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
import { faceSources, pieceKey, sourceIndex } from './netPresentation'
import { lazy, Suspense } from 'preact/compat'

const CubeView3D = lazy(() =>
  import('./cubeView3D').then((m) => ({ default: m.CubeView3D })),
)
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
  COLOR_PROFILE_COOKIE,
  CUBE_SIZE_COOKIE,
  CUBE_VIEW_COOKIE,
  MIRROR_COOKIE,
  SOUND_COOKIE,
  preferenceCookie,
  readPreference,
  readSelection,
  selectedCubeSize,
  selectedCubeView,
  selectionCookie,
} from './preferences'
import { runFullParity, type ParityResult } from '../cube/parity'
import {
  WIZARD_FACE_ORDER,
  faceContentKey,
  groupWizardOptions,
  pickWizardFace,
} from '../cube/orientationWizard'
import {
  runGlobalWhiteBalance,
  GLARE_WARNING_STICKERS,
  backdropReference,
  BACKGROUND_WB_METHOD,
  NEUTRAL_GAINS,
  CROP_JPEG_QUALITY,
  DEFAULT_SAMPLING,
  STICKER_MEASUREMENT,
  STICKER_COLORS,
  rgbToOKLCH,
  hueCircularRange,
  hueRangesOverlap,
  linearRange,
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
  orientationFreeSignature,
  captureCenterSlots,
  placeCapturedFace,
  type OrientedCandidate,
  type OrientationSolution,
  type FaceKey,
  type CubeState,
  type GuidedCenterIssue,
} from '../cube/cubeAssembly'
import {
  AUTO_COLORS_ID,
  EMPTY_SETTINGS,
  activeCube,
  allCubes,
  activeColorProfile,
  allColorProfiles,
  builtinColorProfiles,
  capturePalette,
  colorPalette,
  copyColorProfile,
  copyCubeSetting,
  cubeGroupName,
  mergeSettings,
  saveCube,
  saveColorProfile,
  resolvedColorProfileSnapshot,
  selectCube,
  selectColorProfile,
  setAutoColorMatch,
  type ProfileSettings,
  type UsedColorProfile,
} from './profileSettings'
import {
  loadProfileSettings,
  saveProfileSettings,
  settingsFile,
  parseSettingsFile,
} from './profileStorage'
import {
  canCreateProfileFromCapture,
  captureProfileFinding,
  matchPartialColorProfile,
  profileToUpdate,
  updateProfileFromCapture,
  type AutomaticResolution,
  type PaletteEvidence,
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
  toWRGFacelets,
  fromWRGFacelets,
  toURFFacelets,
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

function loadProfileStore(): ProfileSettings {
  try {
    const settings = loadProfileSettings(localStorage)
    const selectedId = readSelection(document.cookie, COLOR_PROFILE_COOKIE)
    return selectedId &&
      allColorProfiles(settings).some((profile) => profile.id === selectedId)
      ? selectColorProfile(settings, selectedId)
      : settings
  } catch {
    return EMPTY_SETTINGS
  }
}

// False when the browser won't store it (storage blocked or full).
function saveProfileStore(store: ProfileSettings): boolean {
  try {
    return saveProfileSettings(localStorage, store)
  } catch {
    return false
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Parity Check
// ─────────────────────────────────────────────────────────────────────────────

function checkParity(cube: CubeState, size: number): ParityResult {
  return runFullParity(toCubeIR(cube, size))
}

const FACE_ORDER = ['U', 'R', 'F', 'D', 'L', 'B']

// Guided capture: the 4 sides in turn while the cube is turned a quarter
// turn at a time (either way, same row kept on top), then top and bottom
// (see solveGuidedCapture). Which physical face is which isn't known until
// all 6 are in, so the capture slots keep the neutral U..B keys of
// FACE_ORDER (fixtures, uploads and the review key off them) and only
// their meaning is a step in this order - slot U is Side 1, R Side 2, ...
const CAPTURE_STEPS: Array<{
  label: string
  short: string
  instruction: string
}> = [
  {
    label: 'Side 1',
    short: '1',
    instruction: 'Hold the cube upright and show any side.',
  },
  {
    label: 'Side 2',
    short: '2',
    instruction:
      'Keep the same row on top and turn the whole cube clockwise a quarter turn. Either way works.',
  },
  {
    label: 'Side 3',
    short: '3',
    instruction:
      'Keep turning clockwise another quarter turn. Other directions still work.',
  },
  {
    label: 'Side 4',
    short: '4',
    instruction:
      'Turn clockwise one more quarter turn. Any remaining side still works.',
  },
  {
    label: 'Top',
    short: '5',
    instruction:
      'Tip the cube towards you so its top faces the camera - any angle is fine.',
  },
  {
    label: 'Bottom',
    short: '6',
    instruction:
      'Bring Side 4 back to the camera, then continue tipping to the opposite face. Top and bottom may be swapped.',
  },
]
const stepOf = (slot: string) => CAPTURE_STEPS[FACE_ORDER.indexOf(slot)]

function captureInstruction(step: number, mirrored: boolean): string {
  if (!mirrored || step === 0) return CAPTURE_STEPS[step].instruction
  if (step === 4)
    return 'Tip the cube towards you so its top faces the camera. The mirrored view shows the bottom face.'
  if (step === 5)
    return 'Bring Side 4 back to the camera, then continue tipping to the opposite face. The mirrored view shows the top face.'
  if (step === 1)
    return 'Keep the same row on top and turn the whole cube counterclockwise in the mirrored view. Either direction works.'
  if (step === 2)
    return 'Keep turning counterclockwise in the mirrored view. Other directions still work.'
  return 'Turn counterclockwise in the mirrored view one more quarter turn. Any remaining side still works.'
}

// Saved with fixtures captured this way, so they can be put together (and
// regression-tested) with the guided search again later.
const GUIDED_PROTOCOL = 'sides-then-top-bottom/v1'

// A capture mistake read from odd-size centers (see checkGuidedCenters),
// in words; photo indexes are capture steps.
function describeCenterIssue(issue: GuidedCenterIssue): string {
  const label = (i: number) => CAPTURE_STEPS[i].label
  switch (issue.kind) {
    case 'same-center':
      return `${label(issue.photos[0])} and ${label(issue.photos[1])} show the same center - the same face photographed twice?`
    case 'turned-twice':
      return `${label(issue.photo)} shows the face opposite ${label(issue.photo - 1)} - the cube was probably turned twice.`
    case 'not-opposite':
      return `${label(issue.photos[0])} and ${label(issue.photos[1])} should be opposite faces, but aren't.`
  }
}

const FACE_DISPLAY_LABEL: Record<string, string> = Object.fromEntries(
  FACE_ORDER.map((face) => [face, stepOf(face).label]),
)

// The faces to name in the glare warning, or none if too few stickers are
// washed out to warn about.
function glareFacesToWarn(glare: Array<{ face: string }>): string[] {
  if (glare.length < GLARE_WARNING_STICKERS) return []
  return FACE_ORDER.filter((face) =>
    glare.some((sticker) => sticker.face === face),
  )
}
const FACE_SHORT_LABEL: Record<string, string> = Object.fromEntries(
  FACE_ORDER.map((face) => [face, stepOf(face).short]),
)

// How each color is drawn on screen (nets, review, picker) - slightly
// calmer than pure RGB so the six still read at a glance without glaring.
// Display only: detection never compares against these.
// Readable names for parity.ts's checks (unknown ones show as-is).
const PARITY_CHECK_NAMES: Record<string, string> = {
  colorBalance: 'Color balance',
  cornerColors: 'Corner colors',
  cornerOrientation: 'Corner twist',
  edgeColors: 'Edge colors',
  edgeOrientation: 'Edge flip',
  permutationParity: 'Parity',
  wingEdgeColors: 'Wing colors',
}

const STICKER_HEX: Record<string, string> = {
  W: '#f7f6f1',
  O: '#ff7a1a',
  G: '#1e9e57',
  R: '#cf2a3a',
  B: '#2459d6',
  Y: '#f2d21b',
}

const COLOR_NAME: Record<string, string> = {
  W: 'White',
  O: 'Orange',
  G: 'Green',
  R: 'Red',
  B: 'Blue',
  Y: 'Yellow',
}

const CALIBRATION_NOTE = 'Colors double-checked by comparing all 6 sides.'

// Face names shown on the net, keyed by CubeIR face.
const NET_FACE_NAMES: Record<string, string> = {
  u: 'Top',
  l: 'Left',
  f: 'Front',
  r: 'Right',
  b: 'Back',
  d: 'Bottom',
}

// The review mark for sticker `index` (row-major) of a captured face: hand
// corrected, or flagged as unsure (low confidence or close to another color).
function stickerMark(
  face: {
    colors: string[][]
    detectedColors?: string[][]
    cellConfidences?: number[][]
    cellLookalikes?: (string | null)[][]
  },
  index: number,
): 'corrected' | 'flagged' | null {
  const n = face.colors.length,
    r = Math.floor(index / n),
    c = index % n
  const detected = face.detectedColors?.[r]?.[c]
  if (detected !== undefined && detected !== face.colors[r]?.[c])
    return 'corrected'
  if (
    confidenceTier(face.cellConfidences?.[r]?.[c] ?? 1) === 'low' ||
    face.cellLookalikes?.[r]?.[c]
  )
    return 'flagged'
  return null
}

function confidenceTier(c: number): 'high' | 'medium' | 'low' {
  return c >= 0.8 ? 'high' : c >= 0.5 ? 'medium' : 'low'
}

const COLOR_ORDER = ['W', 'O', 'G', 'R', 'B', 'Y']

interface ColorStat {
  count: number
  expected: number
  lightness: { min: number; max: number } | null
  chroma: { min: number; max: number } | null
  hue: { min: number; max: number } | null
  hueOverlapsWith: string[]
}

// Aggregates every captured sticker's detected color across all 6 faces,
// keyed by color letter - count (vs. the expected per-color total for this
// puzzle size) plus each color's OKLCH lightness/chroma/hue spread and
// which other colors' hue ranges it overlaps (the exact condition that
// produces boundary misclassifications between two colors). Saved as
// fixture metadata for later offline analysis - the review wizard flags
// individual stickers from cellLookalikes instead, since a whole color's
// hue range overlapping another's flagged every sticker of both colors.
function computeColorStats(
  capturedFaces: Record<string, { colors: string[][]; cellColors?: RGB[][] }>,
  puzzleSize: number,
): Record<string, ColorStat> {
  const counts: Record<string, number> = { W: 0, O: 0, G: 0, R: 0, B: 0, Y: 0 }
  const oklchByColor: Record<string, { l: number; c: number; h: number }[]> = {
    W: [],
    O: [],
    G: [],
    R: [],
    B: [],
    Y: [],
  }
  for (const f of FACE_ORDER) {
    const grid = capturedFaces[f]?.colors
    const cellColors = capturedFaces[f]?.cellColors
    if (!grid) continue
    grid.forEach((row, r) =>
      row.forEach((color, c) => {
        if (!(color in counts)) return
        counts[color]++
        const rgb = cellColors?.[r]?.[c]
        if (rgb) oklchByColor[color].push(rgbToOKLCH(rgb))
      }),
    )
  }
  const hueRangeByColor: Record<
    string,
    ReturnType<typeof hueCircularRange>
  > = {}
  for (const color of COLOR_ORDER)
    hueRangeByColor[color] = hueCircularRange(
      oklchByColor[color].map((o) => o.h),
    )

  const expected = puzzleSize * puzzleSize
  const stats: Record<string, ColorStat> = {}
  for (const color of COLOR_ORDER) {
    const samples = oklchByColor[color]
    const range = hueRangeByColor[color]
    stats[color] = {
      count: counts[color],
      expected,
      lightness: linearRange(samples.map((o) => o.l)),
      chroma: linearRange(samples.map((o) => o.c)),
      hue: range,
      hueOverlapsWith: range
        ? COLOR_ORDER.filter((other) => {
            if (other === color) return false
            const otherRange = hueRangeByColor[other]
            return otherRange !== null && hueRangesOverlap(range, otherRange)
          })
        : [],
    }
  }
  return stats
}

// Moves `target` from where `from` was to where it is now (FLIP) - how a
// just-captured face flies from the scan square into its net slot.
// Skipped under prefers-reduced-motion.
function flyInto(target: HTMLElement, from: DOMRect) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const to = target.getBoundingClientRect()
  if (to.width === 0) return
  target.animate(
    [
      {
        transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width})`,
        transformOrigin: 'top left',
        opacity: 0.6,
      },
      { transform: 'none', transformOrigin: 'top left', opacity: 1 },
    ],
    { duration: 500, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
  )
}

// Flies a copy of `source` onto `target`'s position and size (FLIP-style,
// via a fixed-position clone so neither real element has to move). Resolves
// once the clone has landed, with a callback that removes it - the caller
// decides when, so the clone can cover the target until the real content
// has re-rendered underneath. Skipped entirely under prefers-reduced-motion.
function morphInto(
  source: HTMLElement,
  target: HTMLElement,
): Promise<() => void> {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    return Promise.resolve(() => {})
  const from = source.getBoundingClientRect()
  const to = target.getBoundingClientRect()
  const clone = source.cloneNode(true) as HTMLElement
  Object.assign(clone.style, {
    position: 'fixed',
    left: `${from.left}px`,
    top: `${from.top}px`,
    width: `${from.width}px`,
    height: `${from.height}px`,
    margin: '0',
    zIndex: '10000',
    pointerEvents: 'none',
    transformOrigin: 'top left',
  })
  document.body.appendChild(clone)
  const scale = to.width / from.width
  const anim = clone.animate(
    [
      { transform: 'none' },
      {
        transform: `translate(${to.left - from.left}px, ${to.top - from.top}px) scale(${scale})`,
      },
    ],
    {
      duration: 450,
      easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
      fill: 'forwards',
    },
  )
  const remove = () => clone.remove()
  // Browsers freeze animation timelines in background tabs, so `finished`
  // alone could leave the pick hanging until the tab is visible again -
  // force-finish after a grace period (timers still fire when hidden).
  const fallback = setTimeout(() => anim.finish(), 800)
  return anim.finished.then(
    () => {
      clearTimeout(fallback)
      return remove
    },
    () => {
      clearTimeout(fallback)
      return remove
    },
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Modal accessibility: every modal in this app (capture, review wizard,
// orientation wizard, color-fix popup) is a plain conditionally-rendered
// div, not a shared component, so there's no single lifecycle hook to hang
// this on - these two plain functions (not hooks, so they're safe to wire
// up from inside a conditionally-rendered block) give each one the same
// keyboard behavior instead of duplicating it five times.
// ─────────────────────────────────────────────────────────────────────────────

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

// Escape closes the modal; Tab/Shift+Tab cycles focus within it instead of
// leaking out to (invisible, behind-the-backdrop) page content.
function handleModalKeyDown(
  e: KeyboardEvent,
  container: HTMLElement,
  onClose: () => void,
) {
  if (e.key === 'Escape') {
    e.stopPropagation()
    onClose()
    return
  }
  if (e.key !== 'Tab') return
  const focusable = Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  )
  if (focusable.length === 0) return
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault()
    first.focus()
  }
}

// Moves focus into a modal right when it opens, so keyboard/screen-reader
// users land inside it instead of it silently appearing over whatever was
// focused before (in practice, always the button that opened it). A ref
// callback (not a hook) re-runs on every render, not just the first one a
// real element mount would - checking that focus isn't already somewhere
// inside this modal is what limits the focus grab to that first moment:
// once the container (or something in it) is focused, later re-renders
// while the customer is actually using the modal leave it alone.
function focusModalOnOpen(el: HTMLElement | null) {
  if (el && !el.contains(document.activeElement)) el.focus()
}

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
  // Which highlight group (see parity.ts's HighlightGroup) is
  // currently moused-over in the Cube Net, if any - lets hovering one
  // implicated sticker cross-highlight every other reading that shares
  // its same color combination (e.g. all the wings that matched an
  // over-represented pair), not just itself.
  const [hoveredHighlightGroup, setHoveredHighlightGroup] = useState<
    string | null
  >(null)
  // The net sticker under the pointer: its face and index.
  const [hoveredNetCell, setHoveredNetCell] = useState<{
    face: string
    index: number
  } | null>(null)
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
  const [orientationWizard, setOrientationWizard] = useState<{
    remaining: OrientedCandidate[]
    truncated: boolean
    picked: FaceKey[]
  } | null>(null)
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
  const [profileStore, setProfileStore] =
    useState<ProfileSettings>(loadProfileStore)
  useEffect(() => {
    document.cookie = selectionCookie(CUBE_SIZE_COOKIE, String(puzzleSize))
  }, [puzzleSize])
  useEffect(() => {
    document.cookie = selectionCookie(CUBE_VIEW_COOKIE, cubeViewMode)
  }, [cubeViewMode])
  useEffect(() => {
    document.cookie = selectionCookie(
      COLOR_PROFILE_COOKIE,
      profileStore.activeColorsId,
    )
  }, [profileStore.activeColorsId])
  const profile = activeCube(profileStore, puzzleSize)
  const colorProfile = activeColorProfile(profileStore)
  const sampling = profile.sampling
  const autoColorProfiles = useMemo(
    () => [...builtinColorProfiles(), ...profileStore.colors],
    [profileStore.colors],
  )
  const provisionalColorProfile = useMemo(
    () =>
      matchPartialColorProfile(
        autoColorProfiles,
        FACE_ORDER.flatMap(
          (face) => capturedFaces[face]?.cellColors?.flat() ?? [],
        ),
      ),
    [autoColorProfiles, capturedFaces],
  )
  const palette = useMemo(
    () =>
      profileStore.activeColorsId === AUTO_COLORS_ID
        ? provisionalColorProfile?.colors
        : capturePalette(profileStore),
    [profileStore, provisionalColorProfile],
  )
  const liveAutoColorProfile = autoColorProfiles.find(
    (candidate) => candidate.id === liveAutoColorProfileId,
  )
  // The profile a capture is read with right now (see the palette passed to
  // captureAndProcessCanvas): Automatic's provisional choice, else the live
  // worker's pick for the first face; the selected profile otherwise.
  const previewProfileFor = (
    liveId: string | null,
  ): PreviewColorProfile | undefined => {
    const used =
      profileStore.activeColorsId === AUTO_COLORS_ID
        ? (provisionalColorProfile ??
          autoColorProfiles.find((candidate) => candidate.id === liveId))
        : colorProfile
    return used
      ? { id: used.id, name: used.name, colors: colorPalette(used) }
      : undefined
  }
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
  const [profileLearningOffer, setProfileLearningOffer] = useState<{
    colors: Record<string, RGB>
    evidence: PaletteEvidence
    matchedProfileId: string | null
    updatedProfileName?: string
  } | null>(null)
  const [newColorName, setNewColorName] = useState<string | null>(null)
  const [samplingFileMessage, setSamplingFileMessage] = useState('')
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
  const applyProfileStore = (updated: ProfileSettings) => {
    if (!saveProfileStore(updated)) {
      setSamplingFileMessage(
        "❌ This browser won't keep profiles (storage blocked or full) - export them to save a copy",
      )
    }
    setProfileStore(updated)
  }
  const [newCubeName, setNewCubeName] = useState<string | null>(null)
  const [newColorProfileName, setNewColorProfileName] = useState<string | null>(
    null,
  )
  const handleCreateCube = () => {
    if (!newCubeName?.trim()) return
    applyProfileStore(
      saveCube(
        profileStore,
        copyCubeSetting(profileStore, profile, newCubeName),
      ),
    )
    setNewCubeName(null)
    setWebcamOpen(false)
    location.hash = profilesHash('cubes')
  }
  const handleCreateNamedColors = () => {
    if (!newColorProfileName?.trim()) return
    applyProfileStore(
      saveColorProfile(
        profileStore,
        copyColorProfile(profileStore, colorProfile, newColorProfileName),
      ),
    )
    setNewColorProfileName(null)
  }
  const handleCreateColors = () => {
    if (!profileLearningOffer || !newColorName?.trim()) return
    const id = `colors-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const saved = saveColorProfile(profileStore, {
      id,
      name: newColorName.trim().slice(0, 60),
      colors: profileLearningOffer.colors,
      captures: 1,
      updatedAt: new Date().toISOString(),
    })
    applyProfileStore(
      profileStore.activeColorsId === AUTO_COLORS_ID
        ? setAutoColorMatch(selectColorProfile(saved, AUTO_COLORS_ID), id)
        : saved,
    )
    setProfileLearningOffer(null)
    setNewColorName(null)
  }
  // The saved profile the Update action would change (see profileToUpdate).
  const updatableName =
    profileStore.colors.find(
      (profile) => profile.id === profileLearningOffer?.matchedProfileId,
    )?.name ?? 'detected'
  const handleUpdateColors = () => {
    const offer = profileLearningOffer
    const target = profileStore.colors.find(
      (profile) => profile.id === offer?.matchedProfileId,
    )
    if (!offer || !target) return
    const updated = updateProfileFromCapture(
      target,
      offer.colors,
      offer.evidence,
      new Date().toISOString(),
    )
    if (!updated) return
    // Saving would also select the profile; keep Automatic or the current choice.
    const saved = {
      ...saveColorProfile(profileStore, updated),
      activeColorsId: profileStore.activeColorsId,
    }
    applyProfileStore(
      profileStore.activeColorsId === AUTO_COLORS_ID
        ? setAutoColorMatch(saved, updated.id)
        : saved,
    )
    setProfileLearningOffer({
      ...offer,
      matchedProfileId: null,
      updatedProfileName: updated.name,
    })
  }
  // Profiles file: cubes and colors, so a setup tuned in one browser or
  // on one machine can be carried to another.
  const handleDownloadSampling = () => {
    const blob = new Blob(
      [JSON.stringify(settingsFile(profileStore), null, 2)],
      { type: 'application/json' },
    )
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'cube-assembler-profiles.json'
    link.click()
    URL.revokeObjectURL(url)
    setSamplingFileMessage('✓ Profiles downloaded')
  }
  const handleUploadSampling = async (e: Event) => {
    const input = e.currentTarget as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    if (!file) return
    try {
      const data = JSON.parse(await file.text())
      // Files saved before cube profiles held per-size settings instead.
      const uploaded = parseSettingsFile(data)
      if (!uploaded) {
        setSamplingFileMessage(
          `❌ ${file.name} isn't a cube and color profiles file`,
        )
        return
      }
      applyProfileStore(mergeSettings(profileStore, uploaded))
      setSamplingFileMessage(
        `✓ Loaded ${uploaded.cubes.length} cubes and ${uploaded.colors.length} color profiles`,
      )
    } catch {
      setSamplingFileMessage(`❌ ${file.name} isn't valid JSON`)
    }
  }
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
    setHoveredHighlightGroup(null)
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
    autoColorsSelected: profileStore.activeColorsId === AUTO_COLORS_ID,
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
    const automatic = profileStore.activeColorsId === AUTO_COLORS_ID
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
        palette:
          profileStore.activeColorsId === AUTO_COLORS_ID
            ? undefined
            : capturePalette(profileStore),
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
  const rejectAlternatives = (
    approval: NonNullable<typeof orientationApproval>,
  ): OrientedCandidate[] => {
    const rejected = new Set(
      approval.candidates.map((c) => orientationFreeSignature(c.faces)),
    )
    return (approval.fallback?.alternatives ?? []).filter(
      (c) => !rejected.has(orientationFreeSignature(c.faces)),
    )
  }
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
      const automatic = profileStore.activeColorsId === AUTO_COLORS_ID
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
  // Features: Copy to Clipboard (#11)
  // ─────────────────────────────────────────────────────────────────────────

  // Confirmed inline on the button itself (briefly swapping its label)
  // rather than with a blocking alert() the customer has to click away.
  const [copyStatus, setCopyStatus] = useState<
    | 'idle'
    | 'facelets-copied'
    | 'facelets-failed'
    | 'token-copied'
    | 'token-failed'
  >('idle')
  const copyToClipboard = async (
    text: string,
    target: 'facelets' | 'token',
  ) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopyStatus(`${target}-copied`)
    } catch (err) {
      console.error('Copy failed:', err)
      setCopyStatus(`${target}-failed`)
    }
    setTimeout(() => setCopyStatus('idle'), 1500)
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  const displayedCube =
    cube && turnedCube?.source === cube ? turnedCube.value : cube
  const visibleCube = displayedCube ?? createSolvedCube(puzzleSize)
  const getNotationOutput = () => {
    if (!displayedCube) return 'null'
    return notationFormat === 'wrg'
      ? toWRGFacelets(displayedCube)
      : toURFFacelets(displayedCube)
  }
  const currentOrbit64Token = useMemo(
    () =>
      displayedCube && puzzleSize <= 7
        ? encodeOrbit64State(toURFFacelets(displayedCube))
        : null,
    [displayedCube, puzzleSize],
  )

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
          {/* The cube: net, parity verdict and its individual checks */}
          <section class="card cube-card">
            <div class="card-header">
              <h2>Your cube</h2>
              <div role="status">
                {parity && (
                  <span
                    class={`verdict ${parity.valid ? 'is-valid' : 'is-invalid'}`}
                  >
                    {parity.valid
                      ? '✓ Valid cube — every check passed'
                      : parity.result}
                    {!parity.valid && parity.detail && (
                      <span class="status-detail">: {parity.detail}</span>
                    )}
                  </span>
                )}
              </div>
              <div class="header-spacer" />
              {cube && (
                <div
                  class="cube-view-toggle"
                  role="group"
                  aria-label="Cube view mode"
                >
                  <button
                    type="button"
                    class={`cube-view-toggle-btn ${cubeViewMode === 'net' ? 'is-active' : ''}`}
                    onClick={() => setCubeViewMode('net')}
                  >
                    2D Net
                  </button>
                  <button
                    type="button"
                    class={`cube-view-toggle-btn ${cubeViewMode === '3d' ? 'is-active' : ''}`}
                    onClick={() => setCubeViewMode('3d')}
                  >
                    3D View
                  </button>
                </div>
              )}
            </div>
            {cube ? (
              cubeViewMode === '3d' ? (
                <Suspense
                  fallback={
                    <div class="cube-3d-container">
                      <div class="cube-3d-hint">Loading 3D view...</div>
                    </div>
                  }
                >
                  <CubeView3D
                    cube={cube}
                    initialCube={visibleCube}
                    initialMoves={
                      turnedCube?.source === cube ? turnedCube.moves : []
                    }
                    onTurnStateChange={(value, moves) =>
                      setTurnedCube({ source: cube, value, moves })
                    }
                    puzzleSize={puzzleSize}
                    palette={STICKER_HEX}
                  />
                </Suspense>
              ) : (
                (() => {
                  // parity.highlight (see parity.ts's HighlightGroup) is a
                  // list of readings, each with its own `group` tag (the color
                  // combination or matched piece name it read as) and the facelets
                  // backing it. Multiple entries can share a `group` - e.g. every
                  // wing that matched an over-represented pair - which is exactly
                  // the set to cross-highlight on hover, since they're the
                  // candidates for "which of these is actually the misread one".
                  const highlightGroups: Array<{
                    group: string
                    facelets: { face: string; index: number }[]
                  }> = parity?.highlight ?? []
                  const totalHighlighted = highlightGroups.reduce(
                    (n, g) => n + g.facelets.length,
                    0,
                  )
                  const groupAt = (
                    face: string,
                    index: number,
                  ): string | undefined =>
                    highlightGroups.find((g) =>
                      g.facelets.some(
                        (f) => f.face === face && f.index === index,
                      ),
                    )?.group
                  // Which photo each net face shows, for its review marks and preview.
                  const rows = (flat: string[]) =>
                    Array.from({ length: puzzleSize }, (_, r) =>
                      flat.slice(r * puzzleSize, (r + 1) * puzzleSize),
                    )
                  const netSources = faceSources(
                    {
                      u: rows(visibleCube.u),
                      r: rows(visibleCube.r),
                      f: rows(visibleCube.f),
                      d: rows(visibleCube.d),
                      l: rows(visibleCube.l),
                      b: rows(visibleCube.b),
                    },
                    Object.fromEntries(
                      FACE_ORDER.filter((f) => capturedFaces[f]).map((f) => [
                        f,
                        capturedFaces[f].colors,
                      ]),
                    ),
                  )
                  const hoveredPiece = hoveredNetCell
                    ? pieceKey(
                        puzzleSize,
                        hoveredNetCell.face,
                        hoveredNetCell.index,
                      )
                    : null
                  const hoveredInfo = (() => {
                    if (!hoveredNetCell || !hoveredPiece) return null
                    const members = (
                      ['u', 'r', 'f', 'd', 'l', 'b'] as const
                    ).filter((face) =>
                      Array.from(
                        { length: puzzleSize * puzzleSize },
                        (_, i) => i,
                      ).some(
                        (i) => pieceKey(puzzleSize, face, i) === hoveredPiece,
                      ),
                    ).length
                    const source = netSources[hoveredNetCell.face]
                    const photo = source
                      ? capturedFaces[source.slot]
                      : undefined
                    const index = source
                      ? sourceIndex(
                          puzzleSize,
                          source.turns,
                          hoveredNetCell.index,
                        )
                      : -1
                    const mark = photo ? stickerMark(photo, index) : null
                    const r = Math.floor(index / puzzleSize),
                      c = index % puzzleSize
                    const detected = photo?.detectedColors?.[r]?.[c]
                    const color = visibleCube[
                      hoveredNetCell.face as keyof CubeState
                    ][hoveredNetCell.index] as string
                    return {
                      faceName: NET_FACE_NAMES[hoveredNetCell.face],
                      pieceName:
                        members === 3
                          ? 'corner piece'
                          : members === 2
                            ? 'edge piece'
                            : 'center piece',
                      photo: photo?.croppedImage,
                      turns: source?.turns ?? 0,
                      note:
                        mark === 'corrected'
                          ? `Detected ${COLOR_NAME[detected!] ?? detected}, you changed it to ${COLOR_NAME[color] ?? color}.`
                          : mark === 'flagged'
                            ? 'Detection was unsure about this sticker.'
                            : null,
                    }
                  })()
                  return (
                    <div class="net-region">
                      {totalHighlighted > 0 && (
                        <p class="net-highlight-note">
                          ⚠ {totalHighlighted} sticker
                          {totalHighlighted === 1 ? '' : 's'} outlined below may
                          be involved in the problem above. Hover one to see
                          which others share its color reading.
                        </p>
                      )}
                      <div
                        class="cube-net"
                        style={{
                          '--net-gap':
                            puzzleSize >= 6
                              ? '1px'
                              : puzzleSize >= 4
                                ? '2px'
                                : '3px',
                        }}
                        onMouseLeave={() => {
                          setHoveredNetCell(null)
                          setHoveredHighlightGroup(null)
                        }}
                      >
                        {(
                          [
                            ['U', visibleCube.u, 'net-u'],
                            ['L', visibleCube.l, 'net-l'],
                            ['F', visibleCube.f, 'net-f'],
                            ['R', visibleCube.r, 'net-r'],
                            ['B', visibleCube.b, 'net-b'],
                            ['D', visibleCube.d, 'net-d'],
                          ] as [string, string[], string][]
                        ).map(([label, data, cls]) => {
                          // Faces are named by their lowercase CubeIR key ('u','r',...)
                          // in parity.highlight, matching `cube`'s own keys - `label`
                          // here is only the uppercase display letter used for the
                          // net-u/net-l/... CSS class.
                          const faceKey = label.toLowerCase()
                          const source = netSources[faceKey]
                          const photo = source
                            ? capturedFaces[source.slot]
                            : undefined
                          return (
                            <div class={`net-face ${cls}`} key={label}>
                              <div class="net-face-label">
                                {NET_FACE_NAMES[faceKey]}
                              </div>
                              <div
                                class="net-face-grid"
                                style={{
                                  gridTemplateColumns: `repeat(${puzzleSize}, 1fr)`,
                                }}
                              >
                                {data.map((color, i) => {
                                  const group = groupAt(faceKey, i)
                                  const isHoverRelated =
                                    group !== undefined &&
                                    group === hoveredHighlightGroup
                                  const samePiece =
                                    hoveredPiece !== null &&
                                    pieceKey(puzzleSize, faceKey, i) ===
                                      hoveredPiece
                                  const mark =
                                    photo && source
                                      ? stickerMark(
                                          photo,
                                          sourceIndex(
                                            puzzleSize,
                                            source.turns,
                                            i,
                                          ),
                                        )
                                      : null
                                  return (
                                    <div
                                      class={`net-cell ${group !== undefined ? 'net-cell-highlighted' : ''} ${isHoverRelated ? 'net-cell-hover-related' : ''} ${samePiece ? 'net-cell-piece' : ''}`}
                                      key={i}
                                      style={{
                                        background:
                                          STICKER_HEX[color] || '#888',
                                      }}
                                      onMouseEnter={() => {
                                        setHoveredNetCell({
                                          face: faceKey,
                                          index: i,
                                        })
                                        setHoveredHighlightGroup(group ?? null)
                                      }}
                                    >
                                      {mark === 'corrected' && (
                                        <span
                                          class="net-cell-mark corrected"
                                          aria-hidden="true"
                                        >
                                          ✎
                                        </span>
                                      )}
                                      {mark === 'flagged' && (
                                        <span
                                          class="net-cell-mark flagged"
                                          aria-hidden="true"
                                        />
                                      )}
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          )
                        })}
                        <div class="net-info" aria-live="polite">
                          {hoveredInfo ? (
                            <>
                              {hoveredInfo.photo && (
                                <img
                                  class="net-info-photo"
                                  src={hoveredInfo.photo}
                                  alt={`Photo of the ${hoveredInfo.faceName} face`}
                                  style={{
                                    transform: `rotate(${hoveredInfo.turns * 90}deg)`,
                                  }}
                                />
                              )}
                              <p>
                                <strong>{hoveredInfo.faceName}</strong> ·{' '}
                                {hoveredInfo.pieceName}
                              </p>
                              {hoveredInfo.note && (
                                <p class="net-info-note">{hoveredInfo.note}</p>
                              )}
                            </>
                          ) : (
                            <p class="net-info-hint">
                              Point at a sticker to see its whole piece and the
                              photo it came from.
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })()
              )
            ) : (
              <p class="empty-state">
                No cube yet — capture the faces, upload a fixture or type the
                colors.
              </p>
            )}
            {parity && (
              <div class="parity-checks">
                {Object.entries(parity.checks).map(([check, valid]) => (
                  <div
                    class={`parity-check ${valid ? 'is-ok' : 'is-failed'}`}
                    key={check}
                  >
                    <span class="parity-check-name">
                      {PARITY_CHECK_NAMES[check] ?? check}
                    </span>
                    <span class="parity-check-result">
                      {valid ? '✓ ok' : '✗ failed'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Notation of the current cube, to copy or save as a fixture */}
          <section class="card notation-card">
            <div class="card-header">
              <h2>Notation</h2>
              <div class="segmented" role="group" aria-label="Notation format">
                <button
                  type="button"
                  class={notationFormat === 'wrg' ? 'active' : ''}
                  aria-pressed={notationFormat === 'wrg'}
                  onClick={() => setNotationFormat('wrg')}
                >
                  Colors (WRG)
                </button>
                <button
                  type="button"
                  class={notationFormat === 'urf' ? 'active' : ''}
                  aria-pressed={notationFormat === 'urf'}
                  onClick={() => setNotationFormat('urf')}
                >
                  Faces (URF)
                </button>
              </div>
              <div class="header-spacer" />
              {cube && (
                <button
                  type="button"
                  class="btn btn-secondary btn-sm"
                  onClick={handleSaveFixture}
                  disabled={loading}
                  title="Download this capture's photos + reviewed colors as a zip - unzipped into test/fixtures/ it becomes a regression test"
                >
                  Save as test fixture
                </button>
              )}
              <button
                type="button"
                class="btn btn-primary btn-sm"
                onClick={() =>
                  cube && copyToClipboard(getNotationOutput(), 'facelets')
                }
                disabled={!cube}
              >
                <span aria-live="polite">
                  {copyStatus === 'facelets-copied'
                    ? '✓ Copied'
                    : copyStatus === 'facelets-failed'
                      ? 'Copy failed'
                      : 'Copy'}
                </span>
              </button>
            </div>
            <textarea
              class="notation-output"
              readOnly
              aria-label="Notation"
              value={cube ? getNotationOutput() : ''}
            />
            {currentOrbit64Token && (
              <div class="orbit64-token-row">
                <span>
                  Orbit64 state token: <code>{currentOrbit64Token}</code>
                </span>
                <button
                  type="button"
                  class="btn btn-secondary btn-sm"
                  onClick={() => copyToClipboard(currentOrbit64Token, 'token')}
                >
                  <span aria-live="polite">
                    {copyStatus === 'token-copied'
                      ? '✓ Copied'
                      : copyStatus === 'token-failed'
                        ? 'Copy failed'
                        : 'Copy token'}
                  </span>
                </button>
              </div>
            )}
            {cube && !currentOrbit64Token && (
              <p class="notation-hint">
                Orbit64 token unavailable until the facelets form a valid cube
                state.
              </p>
            )}
            <p class="notation-hint">
              {notationFormat === 'wrg'
                ? `6 blocks of ${puzzleSize * puzzleSize} colors (W O G R B Y) in U R F D L B order.`
                : `6 blocks of ${puzzleSize * puzzleSize} face letters (U R F D L B) in U R F D L B order.`}
            </p>
            {fixtureSaveMessage && (
              <div
                role="status"
                class={`capture-message ${fixtureSaveMessage.includes('✓') ? 'success' : fixtureSaveMessage.includes('❌') ? 'error' : ''}`}
              >
                {fixtureSaveMessage}
              </div>
            )}
          </section>
        </div>

        <div class="side-column">
          {/* Getting a cube in: guided capture, fixture upload, typed colors */}
          <section class="card capture-card">
            <h2>Capture</h2>
            <div class="capture-card-actions">
              {FACE_ORDER.some((f) => f in capturedFaces) &&
                !FACE_ORDER.every((f) => f in capturedFaces) && (
                  <button
                    type="button"
                    class="btn btn-secondary btn-lg"
                    onClick={() => handleOpenCapture(true)}
                  >
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 20 20"
                      fill="none"
                      aria-hidden="true"
                    >
                      <path
                        d="M16.5 9a6.5 6.5 0 1 0-1.4 5.1M16.5 4.5V9H12"
                        stroke="currentColor"
                        stroke-width="1.7"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      />
                    </svg>
                    Capture again
                  </button>
                )}
              <button
                type="button"
                class="btn btn-primary btn-lg"
                onClick={() => handleOpenCapture()}
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 20 20"
                  aria-hidden="true"
                >
                  <path
                    d="M2.5 6.5A1.5 1.5 0 0 1 4 5h2.2l1.3-2h5l1.3 2H16a1.5 1.5 0 0 1 1.5 1.5V15A1.5 1.5 0 0 1 16 16.5H4A1.5 1.5 0 0 1 2.5 15Z"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.6"
                    stroke-linejoin="round"
                  />
                  <circle
                    cx="10"
                    cy="10.5"
                    r="3"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.6"
                  />
                </svg>
                {FACE_ORDER.every((f) => f in capturedFaces)
                  ? 'Capture again'
                  : FACE_ORDER.some((f) => f in capturedFaces)
                    ? `Continue (${FACE_ORDER.filter((f) => f in capturedFaces).length}/${FACE_ORDER.length})`
                    : 'Capture faces'}
              </button>
              {FACE_ORDER.every((f) => f in capturedFaces) && (
                <button
                  type="button"
                  class="btn btn-secondary btn-lg"
                  onClick={() => {
                    setReviewStep(0)
                    setShowReviewDialog(true)
                  }}
                >
                  Edit colors
                </button>
              )}
            </div>
            <p class="card-hint">
              Four sides while turning the cube, then top and bottom — about a
              minute.
            </p>
            <div class="face-status-row">
              <div class="face-status-dots">
                {FACE_ORDER.map((face) => (
                  <span
                    key={face}
                    class={`progress-dot ${capturedFaces[face] ? 'done' : ''}`}
                    title={`${FACE_DISPLAY_LABEL[face]}${capturedFaces[face] ? ' (captured)' : ' (not captured)'}`}
                  >
                    {FACE_SHORT_LABEL[face]}
                  </span>
                ))}
              </div>
              <span class="card-hint">
                {FACE_ORDER.every((f) => f in capturedFaces)
                  ? 'All 6 captured'
                  : `${FACE_ORDER.filter((f) => f in capturedFaces).length} of 6 captured`}
              </span>
            </div>
            {captureProfile &&
              FACE_ORDER.every((f) => capturedFaces[f]?.croppedImage) && (
                <span class="capture-profile-used">
                  Cube: {captureProfile.name}
                  {cube && resolvedColorProfile && (
                    <>
                      {' · '}Colors: {resolvedColorProfile.name}
                      {resolvedColorProfile.selection === 'automatic' &&
                        ' (Automatic)'}
                      {resolvedColorProfile.colorFitPercent !== undefined &&
                        ` · ${resolvedColorProfile.colorFitPercent}% color fit`}
                      {(profileFinding ||
                        !learnedPalette ||
                        appliedBackgroundGains) && (
                        <span class="capture-profile-used-detail">
                          {profileFinding}
                          {!learnedPalette &&
                            `${profileFinding ? ' · ' : ''}Six-face calibration unavailable`}
                          {appliedBackgroundGains && (
                            <>
                              {profileFinding || !learnedPalette ? ' · ' : ''}
                              <button
                                type="button"
                                class="color-review-link"
                                onClick={() => setShowBackdropDialog(true)}
                              >
                                Compare backdrop adjustment
                              </button>
                            </>
                          )}
                        </span>
                      )}
                    </>
                  )}
                </span>
              )}
            {cube &&
              FACE_ORDER.every((face) => capturedFaces[face]?.croppedImage) &&
              !showReviewDialog && (
                <div class="profile-suggestion">
                  {newColorName === null ? (
                    <>
                      <button
                        type="button"
                        class="btn btn-secondary btn-sm"
                        disabled={!profileLearningOffer}
                        title={
                          profileLearningOffer
                            ? 'Save this capture’s learned sticker colors under a new name'
                            : 'Requires a valid, confident reviewed camera capture'
                        }
                        onClick={() => setNewColorName('')}
                      >
                        ＋ Create sticker color profile
                      </button>
                      {profileLearningOffer?.matchedProfileId && (
                        <button
                          type="button"
                          class="btn btn-secondary btn-sm"
                          onClick={handleUpdateColors}
                          title={`Update the ${updatableName} profile from this reviewed capture`}
                        >
                          Update {updatableName} profile
                        </button>
                      )}
                      {profileLearningOffer?.updatedProfileName && (
                        <span role="status">
                          ✓ {profileLearningOffer.updatedProfileName} updated
                        </span>
                      )}
                    </>
                  ) : (
                    <>
                      <input
                        aria-label="New sticker color profile name"
                        maxLength={60}
                        placeholder="e.g. Matte"
                        value={newColorName}
                        onInput={(e) => setNewColorName(e.currentTarget.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleCreateColors()
                        }}
                      />
                      <button
                        type="button"
                        class="btn btn-primary btn-sm"
                        disabled={!newColorName.trim()}
                        onClick={handleCreateColors}
                      >
                        Save profile
                      </button>
                      <button
                        type="button"
                        class="btn btn-secondary btn-sm"
                        onClick={() => setNewColorName(null)}
                      >
                        Cancel
                      </button>
                    </>
                  )}
                </div>
              )}
            <div class="card-divider" />
            <div class="capture-alternatives">
              <label
                class={`btn btn-secondary btn-sm ${loading ? 'btn-disabled' : ''}`}
                title="Select six photos, a fixture ZIP, or meta.json with its six photos"
              >
                Upload files
                <input
                  type="file"
                  accept=".zip,.json,image/*"
                  multiple
                  hidden
                  disabled={loading}
                  onChange={handleUploadFiles}
                />
              </label>
              <button
                type="button"
                class="btn btn-secondary btn-sm"
                aria-expanded={showColorInput}
                onClick={() => setShowColorInput(!showColorInput)}
              >
                {showColorInput ? 'Close' : 'Type colors'}
              </button>
              <button
                type="button"
                class="btn btn-secondary btn-sm"
                onClick={handleApplySolved}
              >
                Solved cube
              </button>
            </div>
            {photoUpload && (
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
            )}
            <label
              class="checkbox-option"
              title="Review the fixture from what detection reads now, without the colors that were picked by hand when it was saved"
            >
              <input
                type="checkbox"
                checked={ignoreFixtureCorrections}
                onChange={(e) =>
                  setIgnoreFixtureCorrections(e.currentTarget.checked)
                }
              />
              Fixture uploads ignore saved corrections
            </label>
            {/* File-upload/bulk-action feedback: the webcam modal has its own
                copy of this same message for the live-capture flow, but that
                modal isn't open for an upload started from this panel, so
                without this the message would update invisibly. */}
            {captureMessage && !webcamOpen && (
              <div
                role="status"
                class={`capture-message ${captureMessage.includes('✓') ? 'success' : captureMessage.includes('❌') ? 'error' : ''}`}
              >
                {captureMessage}
              </div>
            )}
            {showColorInput && (
              <div class="color-input-panel">
                <div class="notation-format-toggle">
                  <button
                    type="button"
                    class={`wb-btn ${notationFormat === 'wrg' ? 'active' : ''}`}
                    onClick={() => setNotationFormat('wrg')}
                  >
                    WRG Facelets
                  </button>
                  <button
                    type="button"
                    class={`wb-btn ${notationFormat === 'urf' ? 'active' : ''}`}
                    onClick={() => setNotationFormat('urf')}
                  >
                    URF / Orbit64 Facelets
                  </button>
                </div>
                <label>
                  {notationFormat === 'wrg'
                    ? `Enter WRG facelets: 6 blocks of ${puzzleSize * puzzleSize} colors (W, O, G, R, B, Y), space-separated, in U R F D L B order`
                    : `Enter URF facelets: 6 blocks of ${puzzleSize * puzzleSize} letters (U, R, F, D, L, B - the face each sticker's color matches when solved), space-separated, in U R F D L B order`}{' '}
                  You can also paste an Orbit64 2×2–7×7 state token.
                </label>
                <textarea
                  value={manualColorInput}
                  onInput={(e) => {
                    const value = e.currentTarget.value
                    setManualColorInput(value)
                    const detected = looksLikeOrbit64StateToken(value)
                      ? null
                      : detectNotationFormat(value)
                    if (detected && detected !== notationFormat)
                      setNotationFormat(detected)
                  }}
                  placeholder={
                    notationFormat === 'wrg'
                      ? Array(6)
                          .fill('W'.repeat(puzzleSize * puzzleSize))
                          .join(' ')
                      : ['U', 'R', 'F', 'D', 'L', 'B']
                          .map((l) => l.repeat(puzzleSize * puzzleSize))
                          .join(' ')
                  }
                  rows={6}
                  style={{ width: '100%', marginTop: '0.5rem' }}
                />
                <div class="input-actions">
                  <button
                    type="button"
                    class="btn btn-primary btn-sm"
                    onClick={handleApplyFacelets}
                    disabled={loading}
                  >
                    {loading ? '⏳ Processing...' : 'Apply Facelets'}
                  </button>
                </div>
              </div>
            )}
          </section>
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
              automaticColors={profileStore.activeColorsId === AUTO_COLORS_ID}
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
              automaticColors={profileStore.activeColorsId === AUTO_COLORS_ID}
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
      {orientationApproval &&
        !orientationWizard &&
        (() => {
          const { candidates, arrangements, valid, note, suggestedFrom } =
            orientationApproval
          const close = () => setOrientationApproval(null)
          const checkFace = (candidate: OrientedCandidate, face: string) => {
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
          }
          const single = candidates.length === 1
          const page = Math.min(
            orientationApproval.page ?? 0,
            Math.floor((candidates.length - 1) / ORIENTATION_CHOICES_PER_PAGE),
          )
          const first = page * ORIENTATION_CHOICES_PER_PAGE
          const shown = candidates
            .map((candidate, i) => ({ candidate, i }))
            .slice(first, first + ORIENTATION_CHOICES_PER_PAGE)
          return (
            <div class="modal open">
              <div
                class="modal-content orientation-approval"
                role="dialog"
                aria-modal="true"
                aria-labelledby="orientation-approval-title"
                tabIndex={-1}
                ref={focusModalOnOpen}
                onKeyDown={(e) => handleModalKeyDown(e, e.currentTarget, close)}
              >
                <div class="modal-header">
                  <h2 id="orientation-approval-title">
                    {!valid
                      ? "These faces don't make a valid cube"
                      : single
                        ? 'Does this match your cube?'
                        : 'Which of these is your cube?'}
                  </h2>
                  <button
                    type="button"
                    class="modal-close"
                    aria-label="Close"
                    onClick={close}
                  >
                    ×
                  </button>
                </div>
                {note && (
                  <p
                    class={
                      valid ? 'orientation-approval-note' : 'capture-warning'
                    }
                  >
                    {note}
                  </p>
                )}
                <p class="orientation-approval-note">
                  Tap any face to check its colors or retake that photo.
                </p>
                {!note && single && valid && (
                  <p class="orientation-approval-note">
                    {suggestedFrom && suggestedFrom > 1
                      ? 'This is the likely fit if you followed the turning guide. If it looks wrong, choose each side.'
                      : 'The photos fit together one way.'}
                    {puzzleSize % 2 === 1 &&
                      ' Hold your cube with white on top and green in front to compare.'}
                  </p>
                )}
                {!single && valid && (
                  <p class="orientation-approval-note">
                    The photos fit your cube in {candidates.length} different
                    ways. Compare two at a time.
                  </p>
                )}
                {single ? (
                  <div class="approval-single">
                    <div class="approval-net">
                      <OrientationNetPreview
                        faces={candidates[0].faces}
                        stickerColors={STICKER_HEX}
                        onFaceClick={(face) => checkFace(candidates[0], face)}
                      />
                    </div>
                    {arrangements?.[0] && (
                      <div class="approval-changes">
                        <span class="approval-changes-title">
                          How the photos were put together
                        </span>
                        <ul class="approval-checklist">
                          {describeArrangement(
                            arrangements[0],
                            mirrorPreview,
                          ).map((line) => (
                            <li key={line}>
                              <svg
                                width="18"
                                height="18"
                                viewBox="0 0 18 18"
                                aria-hidden="true"
                              >
                                <circle
                                  cx="9"
                                  cy="9"
                                  r="8"
                                  fill="var(--color-accent-soft)"
                                />
                                <path
                                  d="m5.5 9.2 2.3 2.3 4.7-4.8"
                                  fill="none"
                                  stroke="var(--color-accent)"
                                  stroke-width="1.8"
                                  stroke-linecap="round"
                                  stroke-linejoin="round"
                                />
                              </svg>
                              {line}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <div class="orientation-approval-options">
                      {shown.map(({ candidate, i }) => (
                        <div key={i} class="orientation-approval-option">
                          <OrientationNetPreview
                            faces={candidate.faces}
                            stickerColors={STICKER_HEX}
                            onFaceClick={(face) => checkFace(candidate, face)}
                          />
                          {arrangements?.[i] && (
                            <ul class="orientation-approval-changes">
                              {describeArrangement(
                                arrangements[i],
                                mirrorPreview,
                              ).map((line) => (
                                <li key={line}>{line}</li>
                              ))}
                            </ul>
                          )}
                          <button
                            type="button"
                            class="btn btn-primary btn-sm"
                            onClick={() => handleChooseOrientation(candidate)}
                          >
                            {valid ? 'This one' : 'Use it anyway'}
                          </button>
                        </div>
                      ))}
                    </div>
                    {candidates.length > ORIENTATION_CHOICES_PER_PAGE && (
                      <div class="orientation-choice-pages">
                        <button
                          type="button"
                          class="btn btn-secondary btn-sm"
                          disabled={page === 0}
                          onClick={() =>
                            setOrientationApproval(
                              (prev) => prev && { ...prev, page: page - 1 },
                            )
                          }
                        >
                          Previous two
                        </button>
                        <span>
                          Options {first + 1}–
                          {Math.min(
                            first + ORIENTATION_CHOICES_PER_PAGE,
                            candidates.length,
                          )}{' '}
                          of {candidates.length}
                        </span>
                        <button
                          type="button"
                          class="btn btn-secondary btn-sm"
                          disabled={
                            first + ORIENTATION_CHOICES_PER_PAGE >=
                            candidates.length
                          }
                          onClick={() =>
                            setOrientationApproval(
                              (prev) => prev && { ...prev, page: page + 1 },
                            )
                          }
                        >
                          Next two
                        </button>
                      </div>
                    )}
                  </>
                )}
                <div class="orientation-approval-actions">
                  <button
                    type="button"
                    class="btn btn-secondary"
                    onClick={close}
                  >
                    Back to the colors
                  </button>
                  <div class="header-spacer" />
                  {rejectAlternatives(orientationApproval).length > 0 && (
                    <button
                      type="button"
                      class="btn btn-secondary"
                      onClick={handleRejectOrientation}
                    >
                      {single
                        ? 'No, let me choose each side'
                        : 'None of these - let me choose each side'}
                    </button>
                  )}
                  {single && (
                    <button
                      type="button"
                      class="btn btn-primary btn-review-next"
                      onClick={() => handleChooseOrientation(candidates[0])}
                    >
                      {valid ? 'Yes, this is my cube' : 'Use it anyway'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })()}

      {orientationWizard &&
        (() => {
          const { remaining, truncated, picked } = orientationWizard
          const askingFace = pickWizardFace(remaining)
          // This is normally reached only after a face choice has settled
          // every candidate. Keep the recovery screen to one option too.
          if (!askingFace) {
            return (
              <div class="modal open">
                <div
                  class="modal-content orientation-picker"
                  role="dialog"
                  aria-modal="true"
                  tabIndex={-1}
                  ref={focusModalOnOpen}
                  onKeyDown={(e) =>
                    handleModalKeyDown(e, e.currentTarget, () =>
                      setOrientationWizard(null),
                    )
                  }
                >
                  <div class="modal-header">
                    <h2>Which orientation matches your cube?</h2>
                    <button
                      type="button"
                      class="modal-close"
                      aria-label="Close"
                      onClick={() => setOrientationWizard(null)}
                    >
                      ×
                    </button>
                  </div>
                  <div class="orientation-picker-grid">
                    {remaining.slice(0, 1).map((alt, i) => (
                      <div key={i} class="orientation-picker-option">
                        <OrientationNetPreview
                          faces={alt.faces}
                          stickerColors={STICKER_HEX}
                        />
                        <button
                          type="button"
                          class="btn btn-primary btn-sm"
                          onClick={() => handleChooseOrientation(alt)}
                        >
                          Use this one
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )
          }

          const progressFaces: Record<string, string[][]> = {}
          const undecidedFaces = new Set<string>()
          const autoFaces = new Set<string>()
          for (const f of WIZARD_FACE_ORDER) {
            const distinct = new Set(
              remaining.map((c) => faceContentKey(c.faces[f])),
            )
            progressFaces[f] = remaining[0].faces[f]
            if (distinct.size > 1) undecidedFaces.add(f)
            else if (!picked.includes(f)) autoFaces.add(f)
          }
          const decidedCount = WIZARD_FACE_ORDER.length - undecidedFaces.size
          // Every option for this face at once, at most four in a row (two on
          // a phone), so they can be compared side by side.
          const options = groupWizardOptions(remaining, askingFace)
          const columns = {
            '--wizard-columns': Math.min(4, options.length),
            '--wizard-columns-narrow': Math.min(2, options.length),
          }

          return (
            <div class="modal open">
              <div
                class="modal-content orientation-picker"
                role="dialog"
                aria-modal="true"
                tabIndex={-1}
                ref={focusModalOnOpen}
                onKeyDown={(e) =>
                  handleModalKeyDown(e, e.currentTarget, () =>
                    setOrientationWizard(null),
                  )
                }
              >
                <div class="modal-header">
                  <h2>Which way is your {FACE_LABELS[askingFace]} face?</h2>
                  <button
                    type="button"
                    class="modal-close"
                    aria-label="Close"
                    onClick={() => setOrientationWizard(null)}
                  >
                    ×
                  </button>
                </div>
                <p class="orientation-picker-note">
                  {decidedCount}/6 set · {remaining.length} left — match the
                  framed face.
                </p>
                {truncated && (
                  <p class="orientation-picker-note orientation-picker-truncated-note">
                    ⚠️ More matches exist than shown — if none fit, retake the
                    photos.
                  </p>
                )}
                <OrientationNetPreview
                  faces={progressFaces}
                  stickerColors={STICKER_HEX}
                  undecidedFaces={undecidedFaces}
                  currentFace={askingFace}
                  autoFaces={autoFaces}
                />
                <div
                  class="orientation-picker-grid orientation-wizard-options"
                  style={columns}
                >
                  {options.map((opt, i) => (
                    <button
                      key={i}
                      type="button"
                      class="orientation-picker-option orientation-wizard-option"
                      aria-label={`Option ${i + 1} of ${options.length} for the ${FACE_LABELS[askingFace]} face`}
                      disabled={wizardMorphing}
                      onClick={(e) =>
                        handleWizardPick(
                          e.currentTarget,
                          opt.candidates,
                          askingFace,
                        )
                      }
                    >
                      <FaceGrid colors={opt.grid} stickerColors={STICKER_HEX} />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )
        })()}

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

import { render, h, Fragment } from 'preact'
import { useState, useEffect, useRef } from 'preact/hooks'
import '../../web/style.css'
import {
  captureAndProcessFace, captureAndProcessImage, extractCubeFaceColors,
  runGlobalWhiteBalance, computeBackgroundGain, NEUTRAL_GAINS, CROP_JPEG_QUALITY,
  DEFAULT_SAMPLING, stickerSampleRect, colorConfidences, STICKER_COLORS, type SamplingGeometry,
  rgbToOKLCH, hueCircularRange, hueRangesOverlap, linearRange,
  type ColorDetectionResult, type FaceCaptureResult, type RGB,
} from './imageProcessing'
import { assembleCubeFromFaces, validateFaceColors, createSolvedCube, toCubeIR, solveFaceOrientations, type OrientedCandidate, type FaceKey } from './cubeAssembly'
import {
  toWRGFacelets, fromWRGFacelets, toURFFacelets, fromURFFacelets, detectNotationFormat, gridsToWRGFacelets, wrgFaceletsToGrids,
} from './notationOutput'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface CubeState {
  size: number
  captured: Record<string, boolean>
  colors?: Record<string, string[]>
}

interface FaceCaptureData {
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
  // the ring read back unreliably dark). Used to derive a per-face
  // cross-face correction gain once all 6 faces are in; see
  // computeFaceBackgroundGains.
  backgroundColor?: RGB | null
  // Capture context saved with fixtures - see FaceCaptureResult. The camera
  // settings are read at the moment of capture since exposure and white
  // balance can drift between faces. All absent for uploaded fixtures.
  frame?: FaceCaptureResult['frame']
  crop?: FaceCaptureResult['crop']
  sharpness?: number
  cameraSettings?: Partial<MediaTrackSettings>
  timestamp: number
}

// Without an explicit size most webcams default to 640x480, which leaves a
// 7x7 sticker's sample area only ~25px wide. `ideal` (not `exact`) so a
// camera that can't do 1080p still opens at the best size it offers.
const CAMERA_CONSTRAINTS: MediaTrackConstraints = {
  facingMode: 'environment',
  width: { ideal: 1920 },
  height: { ideal: 1080 },
}

// Injected at build time by vite.config.ts's `define`.
declare const __APP_VERSION__: string
declare const __APP_COMMIT__: string

// The sampling setup is a property of the user's cube and camera, not of
// one capture, so it's remembered in this browser between sessions.
const SAMPLING_STORAGE_KEY = 'cube-assembler.sampling'

function loadSampling(): SamplingGeometry {
  try {
    const saved = JSON.parse(localStorage.getItem(SAMPLING_STORAGE_KEY) ?? 'null')
    if (typeof saved?.faceMargin === 'number' && typeof saved?.stickerCore === 'number') return saved
  } catch {
    // storage blocked or corrupt - fall back to the default
  }
  return DEFAULT_SAMPLING
}

function saveSampling(sampling: SamplingGeometry) {
  try {
    localStorage.setItem(SAMPLING_STORAGE_KEY, JSON.stringify(sampling))
  } catch {
    // storage blocked - the setting just won't persist
  }
}

interface CameraInfo {
  label: string
  requested: MediaTrackConstraints
  granted: Partial<MediaTrackSettings>
  supported: Partial<MediaTrackCapabilities> | null
}

// Drops the per-browser device/group ids from settings/capabilities
// before they end up in a saved fixture - they identify the user's
// hardware and say nothing about how the photo was taken.
function withoutDeviceIds<T extends { deviceId?: unknown; groupId?: unknown }>(info: T): Omit<T, 'deviceId' | 'groupId'> {
  const { deviceId: _deviceId, groupId: _groupId, ...rest } = info
  return rest
}

interface AssemblyResult {
  type: 'start' | 'stage' | 'result' | 'error'
  total?: number
  stage?: string
  count?: number
  tested?: number
  states?: any[]
  message?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// API Calls
// ─────────────────────────────────────────────────────────────────────────────

async function generateScramble(size: number): Promise<string> {
  const res = await fetch(`/api/scramble?size=${size}`)
  const data = await res.json()
  return data.scramble || 'Failed to generate scramble'
}

async function applyAlgorithm(cube: any, alg: string, size: number): Promise<any> {
  const res = await fetch('/api/apply-alg', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cube: toCubeIR(cube, size), alg }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Apply algorithm failed (${res.status}): ${text.slice(0, 200)}`)
  }
  return res.json()
}

async function checkParity(cube: any, size: number): Promise<any> {
  const res = await fetch('/api/parity', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cube: toCubeIR(cube, size) }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Parity check failed (${res.status}): ${text.slice(0, 200)}`)
  }
  return res.json()
}

function streamAssembly(faces: any, size: number): EventSource {
  return new EventSource(
    `/api/assemble?faces=${encodeURIComponent(JSON.stringify(faces))}&size=${size}`
  )
}

// /api/apply-alg currently returns raw KPatternData (the ReScript
// kPatternDataToIR bridge is an unimplemented stub), not a usable cube
// state. Reject rather than silently corrupting `cube` with a non-cube
// object.
function extractCubeFromApplyAlgResult(result: any): any {
  if (result && result.cube && result.cube.u && result.cube.r) {
    return result.cube
  }
  throw new Error(
    'Applying algorithms is not fully implemented yet: the server returns raw ' +
    'kPatternData instead of face colors. The cube state was left unchanged.'
  )
}

const FACE_ORDER = ['U', 'R', 'F', 'D', 'L', 'B']

// Face identity (which physical face is U vs R vs F...) can't actually be
// determined from a photo — it depends on how the user is holding the cube,
// which this app has no way to verify. So capture asks for 6 neutral faces
// in a fixed order rather than claiming to know which is "the U face";
// FACE_ORDER's positions still map 1:1 to U/R/F/D/L/B internally, since
// cube assembly/notation/the server API all key off those letters.
const FACE_DISPLAY_LABEL: Record<string, string> = Object.fromEntries(
  FACE_ORDER.map((face, i) => [face, String(i + 1)])
)

const STICKER_HEX: Record<string, string> = {
  W: '#ffffff', O: '#ff8000', G: '#44ee00', R: '#ff0000', B: '#2266ff', Y: '#f4f400',
}

const COLOR_NAME: Record<string, string> = {
  W: 'White', O: 'Orange', G: 'Green', R: 'Red', B: 'Blue', Y: 'Yellow',
}

const CALIBRATION_NOTE = 'Colors double-checked by comparing all 6 sides.'

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
  puzzleSize: number
): Record<string, ColorStat> {
  const counts: Record<string, number> = { W: 0, O: 0, G: 0, R: 0, B: 0, Y: 0 }
  const oklchByColor: Record<string, { l: number; c: number; h: number }[]> = { W: [], O: [], G: [], R: [], B: [], Y: [] }
  for (const f of FACE_ORDER) {
    const grid = capturedFaces[f]?.colors
    const cellColors = capturedFaces[f]?.cellColors
    if (!grid) continue
    grid.forEach((row, r) => row.forEach((color, c) => {
      if (!(color in counts)) return
      counts[color]++
      const rgb = cellColors?.[r]?.[c]
      if (rgb) oklchByColor[color].push(rgbToOKLCH(rgb))
    }))
  }
  const hueRangeByColor: Record<string, ReturnType<typeof hueCircularRange>> = {}
  for (const color of COLOR_ORDER) hueRangeByColor[color] = hueCircularRange(oklchByColor[color].map((o) => o.h))

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

// Renders one candidate orientation as a classic unfolded cube net (cross
// layout: U above F, D below F, L/F/R/B in a row) so the customer can
// visually compare candidates against their physical cube and pick which
// one matches - used when solveFaceOrientations reports genuine
// orientation ambiguity (see its `alternatives` field).
// Named distinctly from the pre-existing main-window "Cube Net" display
// (.cube-net/.net-face/... below) - this is a small, per-alternative
// preview inside the orientation picker, not that view, and sharing its
// class names once caused this component's flex-based CSS to silently
// override the main net's grid-based cross layout (same selector, later
// in the stylesheet wins the cascade).
// Single face's grid of stickers, standalone (used both inside the net
// layout below and on its own for the orientation wizard's per-option
// choices, where only one face at a time needs showing). `undecided`
// renders a neutral placeholder instead of real colors - used for faces
// the orientation wizard hasn't pinned down yet, so the customer isn't
// shown a specific guess as if it were settled. `current` frames the face
// the wizard is asking about right now, so it's obvious which slot in the
// net the options below refer to. `auto` dims a face the wizard settled on
// its own (never asked about), so the net shows at a glance which faces the
// customer actually chose versus which were inferred from those choices.
function FaceGrid({ colors, undecided, current, auto }: { colors: string[][]; undecided?: boolean; current?: boolean; auto?: boolean }) {
  // On odd sizes the center sticker never moves when a face is turned, so
  // it's known even while the face's orientation is still undecided.
  const n = colors.length
  const centerIndex = n % 2 === 1 ? (n * n - 1) / 2 : -1
  return (
    <div
      class={`orientation-net-face${undecided ? ' orientation-net-face-undecided' : ''}${current ? ' orientation-net-face-current' : ''}${auto ? ' orientation-net-face-auto' : ''}`}
      style={{ gridTemplateColumns: `repeat(${colors.length}, 1fr)` }}
    >
      {colors.flat().map((color, i) => (
        <div
          key={i}
          class="orientation-net-sticker"
          style={undecided && i !== centerIndex ? undefined : { background: STICKER_HEX[color] ?? '#888' }}
        />
      ))}
    </div>
  )
}

// Flies a copy of `source` onto `target`'s position and size (FLIP-style,
// via a fixed-position clone so neither real element has to move). Resolves
// once the clone has landed, with a callback that removes it - the caller
// decides when, so the clone can cover the target until the real content
// has re-rendered underneath. Skipped entirely under prefers-reduced-motion.
function morphInto(source: HTMLElement, target: HTMLElement): Promise<() => void> {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return Promise.resolve(() => {})
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
      { transform: `translate(${to.left - from.left}px, ${to.top - from.top}px) scale(${scale})` },
    ],
    { duration: 450, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)', fill: 'forwards' }
  )
  const remove = () => clone.remove()
  // Browsers freeze animation timelines in background tabs, so `finished`
  // alone could leave the pick hanging until the tab is visible again -
  // force-finish after a grace period (timers still fire when hidden).
  const fallback = setTimeout(() => anim.finish(), 800)
  return anim.finished.then(
    () => { clearTimeout(fallback); return remove },
    () => { clearTimeout(fallback); return remove }
  )
}

function OrientationNetPreview({
  faces, undecidedFaces, currentFace, autoFaces,
}: {
  faces: Record<string, string[][]>
  undecidedFaces?: Set<string>
  currentFace?: string
  autoFaces?: Set<string>
}) {
  const grid = (face: string) => (
    <FaceGrid
      colors={faces[face]}
      undecided={undecidedFaces?.has(face)}
      current={face === currentFace}
      auto={autoFaces?.has(face)}
    />
  )
  return (
    <div class="orientation-net">
      <div class="orientation-net-row">
        <div class="orientation-net-spacer" />
        {grid('U')}
        <div class="orientation-net-spacer" />
        <div class="orientation-net-spacer" />
      </div>
      <div class="orientation-net-row">
        {grid('L')}
        {grid('F')}
        {grid('R')}
        {grid('B')}
      </div>
      <div class="orientation-net-row">
        <div class="orientation-net-spacer" />
        {grid('D')}
        <div class="orientation-net-spacer" />
        <div class="orientation-net-spacer" />
      </div>
    </div>
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
function handleModalKeyDown(e: KeyboardEvent, container: HTMLElement, onClose: () => void) {
  if (e.key === 'Escape') {
    e.stopPropagation()
    onClose()
    return
  }
  if (e.key !== 'Tab') return
  const focusable = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
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
// Orientation wizard: narrows solveFaceOrientations' tied `alternatives`
// down to one, one face at a time, instead of dumping every alternative
// (which can real-world number in the dozens - see cubeAssembly.ts's
// MAX_ALTERNATIVES comment) in a single overwhelming grid. At each step,
// asks about whichever not-yet-agreed-upon face currently has the most
// distinct values among the remaining candidates (the question that
// eliminates the most options), filters to the customer's answer, and
// repeats - faces that happen to already agree across all remaining
// candidates (including ones never directly asked about, resolved purely
// as a side effect of earlier answers) are shown as settled without ever
// being asked about. Terminates when exactly one candidate remains.
// ─────────────────────────────────────────────────────────────────────────────

// U last: for even sizes solveEvenSizeOrientations fixes U as its search
// anchor, so it's already unanimous across every alternative and never
// actually reaches this tiebreak - Up is given, F/R/L/D/B get asked about
// as needed. For odd sizes there's no free anchor (every face's rotation
// is a genuine unknown from its photo alone), so U is only ever actually
// asked about there if it turns out to be tied with another face on
// "most distinct values" - this ordering just makes it lose that tiebreak.
const WIZARD_FACE_ORDER: FaceKey[] = ['F', 'R', 'D', 'L', 'B', 'U']
const FACE_LABELS: Record<FaceKey, string> = { U: 'Up', R: 'Right', F: 'Front', D: 'Down', L: 'Left', B: 'Back' }

function faceContentKey(colors: string[][]): string {
  return colors.map((row) => row.join('')).join('')
}

// The face (if any) worth asking about next: the one with the most
// distinct remaining values, so the customer's answer narrows things down
// the most. Null once every face already agrees - i.e. `remaining` must
// be down to exactly one candidate (alternatives are deduped by content,
// so >1 distinct candidates can never agree on all 6 faces at once).
function pickWizardFace(remaining: OrientedCandidate[]): FaceKey | null {
  let best: FaceKey | null = null
  let bestCount = 1
  for (const face of WIZARD_FACE_ORDER) {
    const distinct = new Set(remaining.map((c) => faceContentKey(c.faces[face])))
    if (distinct.size > bestCount) {
      best = face
      bestCount = distinct.size
    }
  }
  return best
}

// Groups the remaining candidates by their value for `face`, one option
// per distinct grid - the choices shown to the customer for this step.
function groupWizardOptions(
  remaining: OrientedCandidate[], face: FaceKey
): { grid: string[][]; candidates: OrientedCandidate[] }[] {
  const groups = new Map<string, { grid: string[][]; candidates: OrientedCandidate[] }>()
  for (const c of remaining) {
    const key = faceContentKey(c.faces[face])
    if (!groups.has(key)) groups.set(key, { grid: c.faces[face], candidates: [] })
    groups.get(key)!.candidates.push(c)
  }
  return [...groups.values()]
}

// ─────────────────────────────────────────────────────────────────────────────
// App Component
// ─────────────────────────────────────────────────────────────────────────────

function App() {
  const [puzzleSize, setPuzzleSize] = useState(3)
  const [cube, setCube] = useState<any>(null)
  const [scramble, setScramble] = useState('')
  const [algorithm, setAlgorithm] = useState('')
  const [assemblyResults, setAssemblyResults] = useState<any[]>([])
  const [parity, setParity] = useState<any>(null)
  // Which highlight group (see server/Server.ts's HighlightGroup) is
  // currently moused-over in the Cube Net, if any - lets hovering one
  // implicated sticker cross-highlight every other reading that shares
  // its same color combination (e.g. all the wings that matched an
  // over-represented pair), not just itself.
  const [hoveredHighlightGroup, setHoveredHighlightGroup] = useState<string | null>(null)
  const [webcamOpen, setWebcamOpen] = useState(false)
  const [webcamFace, setWebcamFace] = useState('U')
  const [capturedFaces, setCapturedFaces] = useState<Record<string, FaceCaptureData>>({})
  const [faceConfidence, setFaceConfidence] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(false)
  const [captureMessage, setCaptureMessage] = useState('')
  const [fixtureSaveMessage, setFixtureSaveMessage] = useState('')
  const [manualColorInput, setManualColorInput] = useState('')
  const [showColorInput, setShowColorInput] = useState(false)
  const [notationFormat, setNotationFormat] = useState<'wrg' | 'urf'>('wrg')
  const [liveDetection, setLiveDetection] = useState<ColorDetectionResult | null>(null)
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
  const [orientationWizard, setOrientationWizard] = useState<{ remaining: OrientedCandidate[]; truncated: boolean; picked: FaceKey[] } | null>(null)
  // True while a picked option is animating into the net - blocks a second
  // pick from landing mid-flight.
  const [wizardMorphing, setWizardMorphing] = useState(false)
  const [reviewEditingCell, setReviewEditingCell] = useState<{ face: string; row: number; col: number } | null>(null)
  // Most laptop/webcam feeds are shown mirrored by convention (like a
  // physical mirror), which is what most users expect; default on but
  // let it be turned off for cameras that don't need it (e.g. a rear
  // phone camera fed in via some capture setups).
  const [mirrorPreview, setMirrorPreview] = useState(true)
  const [sampling, setSampling] = useState<SamplingGeometry>(loadSampling)
  const [samplingSetupOpen, setSamplingSetupOpen] = useState(false)
  // Upload Fixture option: start the review from what detection reads
  // today instead of the colors the fixture was saved with, so a capture
  // can be reviewed afresh without its earlier hand corrections.
  const [ignoreFixtureCorrections, setIgnoreFixtureCorrections] = useState(false)
  // The 6 colors as learned from this capture's own stickers (null when the
  // cross-face recalibration didn't run) - what the color-fix picker scores
  // each alternative against.
  const [learnedPalette, setLearnedPalette] = useState<Record<string, RGB> | null>(null)
  const updateSampling = (next: SamplingGeometry) => {
    setSampling(next)
    saveSampling(next)
  }
  const [globalWhiteBalanceNote, setGlobalWhiteBalanceNote] = useState<string | null>(null)
  // The per-face background-derived gains actually applied this capture
  // (see computeFaceBackgroundGains below) - kept only so a saved fixture
  // can record what correction was in play, for later debugging/analysis.
  const [appliedBackgroundGains, setAppliedBackgroundGains] = useState<Record<string, RGB> | null>(null)
  const [reviewStep, setReviewStep] = useState(0)
  // Captured once per webcam session (device label isn't available until
  // getUserMedia grants permission) - purely informational, attached to
  // saved fixtures so a color regression can be cross-checked against the
  // camera that produced it: what we asked for, what the camera granted,
  // and which controls (white balance, exposure, ...) it supports at all.
  const [cameraInfo, setCameraInfo] = useState<CameraInfo | null>(null)
  const webcamRef = useRef<HTMLVideoElement>(null)
  const sampleCanvasRef = useRef<HTMLCanvasElement | null>(null)

  // ─────────────────────────────────────────────────────────────────────────
  // Webcam Capture
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!webcamOpen || !webcamRef.current) return

    navigator.mediaDevices
      .getUserMedia({ video: CAMERA_CONSTRAINTS })
      .then((stream) => {
        if (webcamRef.current) {
          webcamRef.current.srcObject = stream
        }
        const track = stream.getVideoTracks()[0]
        if (track) {
          setCameraInfo({
            label: track.label || 'Unknown camera',
            requested: CAMERA_CONSTRAINTS,
            granted: withoutDeviceIds(track.getSettings()),
            // getCapabilities is missing in Firefox
            supported: track.getCapabilities ? withoutDeviceIds(track.getCapabilities()) : null,
          })
        }
      })
      .catch((err) => console.error('Webcam error:', err))

    return () => {
      if (webcamRef.current?.srcObject) {
        (webcamRef.current.srcObject as MediaStream).getTracks().forEach((t) => t.stop())
      }
    }
  }, [webcamOpen])

  // Live sticker-color preview: sample the video feed a few times a second
  // so the grid overlay shows detected colors before the user commits to a
  // capture, instead of only finding out the result afterward.
  useEffect(() => {
    if (!webcamOpen) {
      setLiveDetection(null)
      return
    }

    if (!sampleCanvasRef.current) {
      sampleCanvasRef.current = document.createElement('canvas')
    }
    const canvas = sampleCanvasRef.current

    const intervalId = setInterval(() => {
      const video = webcamRef.current
      if (!video || video.videoWidth === 0 || video.videoHeight === 0) return

      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      ctx.drawImage(video, 0, 0)

      try {
        setLiveDetection(extractCubeFaceColors(canvas, puzzleSize, NEUTRAL_GAINS, sampling))
      } catch {
        // Transient frame read failure (e.g. camera still warming up) — skip this tick.
      }
    }, 200)

    return () => clearInterval(intervalId)
  }, [webcamOpen, puzzleSize, sampling])

  // ─────────────────────────────────────────────────────────────────────────
  // Features: Scramble Generation (#8)
  // ─────────────────────────────────────────────────────────────────────────

  const handleGenerateScramble = async () => {
    setLoading(true)
    try {
      const newScramble = await generateScramble(puzzleSize)
      setScramble(newScramble)
    } finally {
      setLoading(false)
    }
  }

  const handleApplyScramble = async () => {
    if (!scramble || !cube) return
    setLoading(true)
    try {
      const result = await applyAlgorithm(cube, scramble, puzzleSize)
      setCube(extractCubeFromApplyAlgResult(result))
      setScramble('')
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Features: Algorithm Execution (#7)
  // ─────────────────────────────────────────────────────────────────────────

  const handleApplyAlgorithm = async () => {
    if (!algorithm || !cube) return
    setLoading(true)
    try {
      const result = await applyAlgorithm(cube, algorithm, puzzleSize)
      const newCube = extractCubeFromApplyAlgResult(result)
      setCube(newCube)
      await updateParityStatus(newCube)
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }

  const handleInvertAlgorithm = async () => {
    if (!algorithm || !cube) return
    setLoading(true)
    try {
      const inverted = algorithm
        .split(/\s+/)
        .map((m) => (m.endsWith("'") ? m.slice(0, -1) : m + "'"))
        .reverse()
        .join(' ')
      const result = await applyAlgorithm(cube, inverted, puzzleSize)
      const newCube = extractCubeFromApplyAlgResult(result)
      setCube(newCube)
      await updateParityStatus(newCube)
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }

  const handlePresetAlgorithm = (algo: string) => {
    setAlgorithm(algo)
  }

  const handleApplySolved = async () => {
    const solved = createSolvedCube(puzzleSize)
    setCube(solved)

    const solvedFaceGrid = (color: string): string[][] =>
      Array.from({ length: puzzleSize }, () => Array(puzzleSize).fill(color))
    const solvedColors: Record<string, string> = { U: 'W', R: 'R', F: 'G', D: 'Y', L: 'O', B: 'B' }

    const newCapturedFaces: Record<string, FaceCaptureData> = {}
    for (const face of FACE_ORDER) {
      newCapturedFaces[face] = {
        colors: solvedFaceGrid(solvedColors[face]),
        confidence: 1.0,
        timestamp: Date.now(),
      }
    }
    setCapturedFaces(newCapturedFaces)
    await updateParityStatus(solved)
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
      const effectiveFormat = detectNotationFormat(manualColorInput) ?? notationFormat
      const newCube = effectiveFormat === 'wrg'
        ? fromWRGFacelets(manualColorInput)
        : fromURFFacelets(manualColorInput)
      if (!newCube) {
        alert(
          effectiveFormat === 'wrg'
            ? 'Invalid facelets. Must be 6 space-separated blocks of equal, perfect-square length (9 for 3×3, 25 for 5×5, ...) using colors W, O, G, R, B, Y, in U R F D L B order.'
            : 'Invalid facelets. Must be 6 space-separated blocks of equal, perfect-square length (9 for 3×3, 25 for 5×5, ...) using letters U, R, F, D, L, B (the face each sticker matches when solved), in U R F D L B order.'
        )
        return
      }
      if (effectiveFormat !== notationFormat) setNotationFormat(effectiveFormat)

      const size = Math.sqrt(newCube.u.length)
      setPuzzleSize(size)
      setCube(newCube)

      const toGrid = (data: string[]): string[][] =>
        Array.from({ length: size }, (_, r) => data.slice(r * size, r * size + size))
      const newCapturedFaces: Record<string, FaceCaptureData> = {}
      for (const [face, data] of Object.entries(newCube)) {
        newCapturedFaces[face.toUpperCase()] = { colors: toGrid(data), confidence: 1.0, timestamp: Date.now() }
      }
      setCapturedFaces(newCapturedFaces)

      await updateParityStatus(newCube, size)
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

  const updateParityStatus = async (cubeState: any, sizeOverride?: number) => {
    try {
      const result = await checkParity(cubeState, sizeOverride ?? puzzleSize)
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
  // Features: WRG Notation Parser (#5, #6 partial)
  // ─────────────────────────────────────────────────────────────────────────

  const handleParseWRG = async (notation: string) => {
    if (!notation.trim()) return
    const res = await fetch('/api/parse-wrg', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notation, size: puzzleSize }),
    })
    const data = await res.json()
    if (data.cube) {
      setCube(data.cube)
      await updateParityStatus(data.cube)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Features: Assembly Pipeline (#6)
  // ─────────────────────────────────────────────────────────────────────────

  const handleRunAssembly = async () => {
    if (!cube) return

    const eventSource = streamAssembly([cube.u, cube.r, cube.f, cube.d, cube.l, cube.b], puzzleSize)

    eventSource.onmessage = (e) => {
      const msg = JSON.parse(e.data) as AssemblyResult
      setAssemblyResults((prev) => [...prev, msg])

      if (msg.type === 'result' && msg.states && msg.states.length > 0) {
        setCube(msg.states[0])
        updateParityStatus(msg.states[0])
      }

      if (msg.type === 'error') {
        console.error('Assembly error:', msg.message)
      }
    }

    eventSource.onerror = () => {
      eventSource.close()
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Features: Face Capture Modal (#5)
  // ─────────────────────────────────────────────────────────────────────────

  // Single capture entry point: resume at the first uncaptured face, or -
  // once all 6 are already done - clear every prior capture and start
  // completely over from U, so "Recapture Faces" actually re-walks all 6
  // faces instead of silently reusing the other 5's stale data.
  const handleOpenCapture = () => {
    const allCaptured = FACE_ORDER.every((f) => f in capturedFaces)
    if (allCaptured) {
      setCapturedFaces({})
      setFaceConfidence({})
    }
    const nextFace = allCaptured ? FACE_ORDER[0] : FACE_ORDER.find((f) => !(f in capturedFaces))!
    setWebcamFace(nextFace)
    setCaptureMessage('')
    setGlobalWhiteBalanceNote(null)
    setAppliedBackgroundGains(null)
    setWebcamOpen(true)
  }

  // Stores a capture result for `face`, opens the review dialog once all 6
  // faces are in (so the user can fix any misdetected colors before the
  // cube is assembled), and otherwise auto-advances the modal to the next
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
    cameraSettings?: Partial<MediaTrackSettings>
  ) => {
    if (!validateFaceColors(result.colors, puzzleSize)) {
      setCaptureMessage(`❌ Invalid colors detected. Confidence: ${(result.confidence * 100).toFixed(0)}%`)
      return
    }

    const newCapturedFaces = {
      ...capturedFaces,
      [face]: {
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
        timestamp: Date.now(),
      },
    }

    setCapturedFaces(newCapturedFaces)
    setFaceConfidence({ ...faceConfidence, [face]: result.confidence })
    setCaptureMessage(`✓ Face ${FACE_DISPLAY_LABEL[face]} captured (${(result.confidence * 100).toFixed(0)}% confidence)`)

    const allFacesCaptured = FACE_ORDER.every(f => f in newCapturedFaces)
    if (allFacesCaptured) {
      await finalizeAllFacesCaptured(newCapturedFaces)
    } else {
      const nextFace = FACE_ORDER.find(f => !(f in newCapturedFaces))
      if (nextFace) {
        setTimeout(() => {
          setWebcamFace(nextFace)
          setCaptureMessage('')
        }, 900)
      }
    }
  }

  // Runs once every face has a captured entry, regardless of how it got
  // there (one-by-one webcam capture or a bulk file upload) - the global
  // white-balance recalibration (learning each sticker color from all 6
  // faces together, see runGlobalWhiteBalance) only makes sense with a
  // complete set, so this is the single place both capture paths converge
  // before opening the review wizard.
  const finalizeAllFacesCaptured = async (newCapturedFaces: Record<string, FaceCaptureData>) => {
    setCaptureMessage('✓ All faces captured! Checking white balance across all stickers...')
    setLoading(true)

    const canRecalibrate = FACE_ORDER.every((f) => newCapturedFaces[f].croppedImage)
    if (canRecalibrate) {
      try {
        const images: Record<string, string> = {}
        for (const f of FACE_ORDER) images[f] = newCapturedFaces[f].croppedImage!

        // Cross-face correction from the background around the cube (see
        // computeBackgroundGain): face 1 is the reference, every other
        // face's gain rescales ITS OWN background reading to match
        // face 1's. Skipped (stays neutral) for any face whose
        // background wasn't sampleable, rather than failing the whole
        // capture over one bad reading.
        const referenceBackground = newCapturedFaces[FACE_ORDER[0]].backgroundColor
        const faceGains: Record<string, RGB> = {}
        for (const f of FACE_ORDER) {
          const bg = newCapturedFaces[f].backgroundColor
          faceGains[f] = referenceBackground && bg ? computeBackgroundGain(referenceBackground, bg) : NEUTRAL_GAINS
        }
        setAppliedBackgroundGains(faceGains)

        const wb = await runGlobalWhiteBalance(images, puzzleSize, faceGains, sampling)
        setLearnedPalette(wb.learned?.colors ?? null)
        if (wb.applied) {
          const recalibrated = { ...newCapturedFaces }
          for (const f of FACE_ORDER) {
            const det = wb.faces[f]
            recalibrated[f] = { ...recalibrated[f], colors: det.colors, detectedColors: det.colors, cellConfidences: det.cellConfidences, cellColors: det.cellColors, cellLookalikes: det.cellLookalikes, confidence: det.confidence }
          }
          setCapturedFaces(recalibrated)
          setGlobalWhiteBalanceNote(CALIBRATION_NOTE)
        } else {
          setGlobalWhiteBalanceNote(null)
        }
      } catch (err) {
        console.error('Global white balance error:', err)
        setGlobalWhiteBalanceNote(null)
        setLearnedPalette(null)
      }
    }

    setLoading(false)
    setWebcamOpen(false)
    setReviewStep(0)
    setShowReviewDialog(true)
  }

  // Restores a fixture saved earlier via handleSendFixtureToServer (see
  // server/Server.ts's POST /api/fixtures and test/fixtures/<name>/) -
  // the customer selects that directory's meta.json together with its 6
  // face-*.jpg photos (one multi-file picker covers both). Colors are
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
  const handleUploadFixture = async (e: Event) => {
    const input = e.currentTarget as HTMLInputElement
    const files = Array.from(input.files ?? [])
    if (files.length === 0) return

    setLoading(true)
    setCaptureMessage('Loading fixture...')

    try {
      const metaFile = files.find((f) => f.name.toLowerCase().endsWith('.json'))
      if (!metaFile) {
        setCaptureMessage("❌ No .json file found - select a fixture's meta.json together with its 6 face-*.jpg photos.")
        return
      }

      let meta: {
        gridSize: number
        colorsURFDLB: string
        faces: Record<string, { photo: string }>
        capture?: { backgroundWhiteBalance?: Record<string, RGB>; sampling?: SamplingGeometry }
      }
      try {
        meta = JSON.parse(await metaFile.text())
      } catch {
        setCaptureMessage(`❌ ${metaFile.name} is not valid JSON.`)
        return
      }
      const colorGrids = typeof meta.colorsURFDLB === 'string' ? wrgFaceletsToGrids(meta.colorsURFDLB) : null
      if (!meta.faces || typeof meta.gridSize !== 'number' || !colorGrids) {
        setCaptureMessage(`❌ ${metaFile.name} doesn't look like a saved fixture (missing gridSize/colorsURFDLB/faces).`)
        return
      }

      const photoFiles = files.filter((f) => f !== metaFile)
      const newEntries: Record<string, FaceCaptureData> = {}
      const missing: string[] = []
      for (const [face, faceData] of Object.entries(meta.faces)) {
        const photoFile = photoFiles.find((f) => f.name === faceData.photo)
        const colors = colorGrids[face.toUpperCase()]
        if (!photoFile || !colors || !validateFaceColors(colors, meta.gridSize)) {
          missing.push(face.toUpperCase())
          continue
        }
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result as string)
          reader.onerror = () => reject(new Error(`Could not read ${photoFile.name}`))
          reader.readAsDataURL(photoFile)
        })
        newEntries[face.toUpperCase()] = {
          colors,
          confidence: 1,
          croppedImage: dataUrl,
          timestamp: Date.now(),
        }
      }

      if (missing.length > 0) {
        setCaptureMessage(
          `❌ Missing or invalid photo/colors for face${missing.length === 1 ? '' : 's'} ${missing.join(', ')} - make sure all 6 face-*.jpg files named in ${metaFile.name} are selected too.`
        )
        return
      }

      setCaptureMessage('Detecting colors from the fixture photos...')
      const recordedGains = meta.capture?.backgroundWhiteBalance
      const images = Object.fromEntries(Object.entries(newEntries).map(([f, d]) => [f, d.croppedImage!]))
      const wb = await runGlobalWhiteBalance(images, meta.gridSize, recordedGains, meta.capture?.sampling ?? DEFAULT_SAMPLING)
      let mismatches = 0
      for (const [f, entry] of Object.entries(newEntries)) {
        const det = wb.faces[f]
        entry.detectedColors = det.colors
        entry.cellColors = det.cellColors
        entry.cellConfidences = det.cellConfidences
        entry.cellLookalikes = det.cellLookalikes
        entry.confidence = det.confidence
        entry.colors.forEach((row, r) => row.forEach((color, c) => { if (det.colors[r][c] !== color) mismatches++ }))
        if (ignoreFixtureCorrections) entry.colors = det.colors.map((row) => [...row])
      }
      setAppliedBackgroundGains(recordedGains ?? null)
      setGlobalWhiteBalanceNote(wb.applied
        ? CALIBRATION_NOTE
        : null)
      setLearnedPalette(wb.learned?.colors ?? null)

      setPuzzleSize(meta.gridSize)
      setCapturedFaces(newEntries)
      setFaceConfidence(Object.fromEntries(Object.entries(newEntries).map(([f, d]) => [f, d.confidence])))
      const stickers = `${mismatches} sticker${mismatches === 1 ? '' : 's'}`
      setCaptureMessage(mismatches === 0
        ? `✓ Loaded fixture - detection matches all stickers.`
        : ignoreFixtureCorrections
        ? `✓ Loaded fixture with detected colors only - dropped the saved choice on ${stickers}.`
        : `✓ Loaded fixture - detection differs on ${stickers} (marked in the review).`)
      setReviewStep(0)
      setShowReviewDialog(true)
    } finally {
      setLoading(false)
      input.value = ''
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Features: Post-Capture Review & Color Fix
  // ─────────────────────────────────────────────────────────────────────────

  const handleFixCellColor = (face: string, row: number, col: number, newColor: string) => {
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
    setShowReviewDialog(false)
    setWebcamFace(face)
    setCaptureMessage('')
    setWebcamOpen(true)
  }

  const handleConfirmReview = async () => {
    const faceData: Record<string, string[][]> = {}
    for (const [f, data] of Object.entries(capturedFaces)) {
      faceData[f] = data.colors
    }

    // Capture order tells us nothing about which physical face is U vs R
    // vs F etc, or which way up each was held. Odd sizes get identity for
    // free from each face's fixed center sticker; even sizes search for
    // identity jointly with rotation instead (see solveFaceOrientations).
    // Either way, use the solved result (identity by validity, not
    // capture order) instead of trusting capture order as identity.
    let orientedFaceData = faceData
    const solved = solveFaceOrientations(faceData)
    if (solved) {
      orientedFaceData = solved.faces
      // A 2x2 has no edge pieces at all - every piece is a corner - so
      // solveFaceOrientations reports edgeScore as NaN there rather than
      // a real count; only mention edges when they actually exist.
      const hasEdgeScore = !Number.isNaN(solved.edgeScore)
      if (!solved.fullyValid) {
        const edgePart = hasEdgeScore ? ` and ${solved.edgeScore}/12 edges` : ''
        // cornerScore/edgeScore can both read 8/8 and 12/12 here despite
        // fullyValid being false: those only check each position looks
        // like SOME real piece independently, not that all 8/12 are
        // DISTINCT pieces with correct orientation sums and matching
        // permutation parity (see isFullyValid in cubeAssembly.ts) - so a
        // perfect-looking score can still be a physically unreachable
        // cube, which this message calls out explicitly rather than
        // implying "8/8" alone means it's fine.
        alert(
          `⚠️ No fully valid orientation found (best: ${solved.cornerScore}/8 corners${edgePart} individually plausible, but not a physically reachable cube) — some captured colors may be misdetected. Check the assembled cube.`
        )
      } else if (solved.alternatives.length > 1) {
        // Genuine ambiguity, not a bug: the same uniquely color-identified
        // 6 photos support more than one physically-different, equally
        // valid rotation reading (see isFullyValid/OrientationSolution's
        // alternatives comment in cubeAssembly.ts) - only the person
        // holding the actual cube can say which is real, so ask instead
        // of silently picking one. Leaves the review dialog up; the
        // orientation wizard renders on top of it and calls
        // handleChooseOrientation once it narrows down to one candidate.
        setOrientationWizard({ remaining: solved.alternatives, truncated: solved.truncated, picked: [] })
        return
      }
    } else {
      alert(
        '⚠️ Could not resolve face identity/orientation (need exactly 6 captured faces, or for odd sizes a duplicate/unreadable center) — used capture order as-is; verify results carefully.'
      )
    }

    const cubeState = assembleCubeFromFaces(orientedFaceData, puzzleSize)
    setCube(cubeState)
    await updateParityStatus(cubeState)
    setShowReviewDialog(false)
  }

  // Finishes assembly once the orientation wizard has narrowed down to a
  // single candidate - mirrors handleConfirmReview's tail end exactly,
  // since this IS that same step, just with the choice already made
  // instead of auto-picking alternatives[0].
  const handleChooseOrientation = async (chosen: OrientedCandidate) => {
    setOrientationWizard(null)
    const cubeState = assembleCubeFromFaces(chosen.faces, puzzleSize)
    setCube(cubeState)
    await updateParityStatus(cubeState)
    setShowReviewDialog(false)
  }

  // Advances the orientation wizard by one answer: narrows `remaining` to
  // whichever candidates matched the customer's pick for the face just
  // asked about, then either asks the next most-informative question or,
  // once every face agrees (pickWizardFace returns null), finishes
  // assembly with the single remaining candidate.
  const handleWizardAnswer = (matched: OrientedCandidate[], face: FaceKey) => {
    if (pickWizardFace(matched) === null) {
      handleChooseOrientation(matched[0])
      return
    }
    setOrientationWizard((prev) => (prev ? { remaining: matched, truncated: prev.truncated, picked: [...prev.picked, face] } : null))
  }

  // Clicking an option face flies it into the framed slot in the progress
  // net before the answer is applied, so the customer sees exactly where
  // their pick landed. The flying clone is removed in the next task, after
  // Preact's microtask re-render has already filled the slot - so the slot
  // never flashes back to its hatched placeholder in between. (A timer,
  // not requestAnimationFrame, since rAF doesn't fire in background tabs.)
  const handleWizardPick = async (optionEl: HTMLElement, candidates: OrientedCandidate[], face: FaceKey) => {
    if (wizardMorphing) return
    const source = optionEl.querySelector<HTMLElement>('.orientation-net-face')
    const target = document.querySelector<HTMLElement>('.orientation-picker .orientation-net-face-current')
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

  // Saves this capture - each face's actual photo plus its (human-
  // reviewed/corrected) color grid - as a permanent regression fixture on
  // the server (test/fixtures/<name>/, see server/Server.ts's
  // POST /api/fixtures and test/fixtures.test.ts). Only meaningful once a
  // cube has actually been confirmed: that's the point at which
  // capturedFaces' colors reflect whatever corrections were made in the
  // review wizard, not just the raw first-pass detection.
  const handleSendFixtureToServer = async () => {
    const allCaptured = FACE_ORDER.every((f) => capturedFaces[f]?.croppedImage)
    if (!allCaptured) {
      setFixtureSaveMessage('❌ Capture and confirm all 6 faces first.')
      return
    }
    setLoading(true)
    setFixtureSaveMessage('Sending...')
    try {
      const faces: Record<string, { photo: string } & Record<string, unknown>> = {}
      for (const f of FACE_ORDER) {
        const face = capturedFaces[f]
        faces[f] = {
          photo: face.croppedImage!,
          // What the browser measured for each sticker (row-major, after the
          // face's gain) and detection's confidence in it, 0-100 - lets
          // the fixture test check its own JPEG decode reads the same.
          readings: face.cellColors?.flat().map(({ r, g, b }) => [r, g, b].map((v) => Math.round(v * 10) / 10)),
          confidences: face.cellConfidences?.flat().map((c) => Math.round(c * 100)),
          capturedAt: new Date(face.timestamp).toISOString(),
          background: face.backgroundColor,
          frame: face.frame,
          crop: face.crop,
          sharpness: face.sharpness !== undefined ? Math.round(face.sharpness * 10) / 10 : undefined,
          camera: face.cameraSettings,
        }
      }
      const meta = {
        capturedAt: new Date().toISOString(),
        app: { version: __APP_VERSION__, commit: __APP_COMMIT__ },
        userAgent: navigator.userAgent,
        devicePixelRatio: window.devicePixelRatio,
        photo: { format: 'image/jpeg', quality: CROP_JPEG_QUALITY },
        mirrored: mirrorPreview,
        camera: cameraInfo,
        // No fixed-preset/gray-world software white-balance runs at capture
        // time any more (see the "Gains" comment in imageProcessing.ts).
        // Two corrections actually run, both recorded here: the per-face
        // background-derived gain (backgroundWhiteBalance - see
        // computeBackgroundGain, "G1") applied BEFORE reclassification,
        // and the post-capture target-shift recalibration
        // (colorCalibration - learnStickerColors) applied AFTER, which
        // shifts each of the 6 reference colors to match what this
        // capture's own (already background-corrected) stickers measured.
        backgroundWhiteBalance: appliedBackgroundGains,
        // Face border and sticker gap used to sample every face (see
        // SamplingGeometry) - replayed by the fixture test.
        sampling,
        // The 6 colors learned from this capture's stickers, which every
        // sticker was classified against (null when there weren't enough
        // stickers to learn from and the canonical colors were used).
        colorCalibration: {
          applied: globalWhiteBalanceNote !== null,
          learnedColors: learnedPalette
            ? Object.fromEntries(Object.entries(learnedPalette).map(([color, { r, g, b }]) => [
                color,
                [r, g, b].map((v) => Math.round(v * 10) / 10),
              ]))
            : null,
        },
        // Per-color detected count/lightness/chroma/hue spread across all 6
        // faces at confirm time (see computeColorStats) - no longer shown
        // live in the review wizard (raw OKLCH ranges aren't actionable
        // mid-capture), but valuable here for offline analysis of a
        // reported detection problem against this exact fixture.
        colorStats: computeColorStats(capturedFaces, puzzleSize),
      }
      const res = await fetch('/api/fixtures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gridSize: puzzleSize,
          colorsURFDLB: gridsToWRGFacelets(Object.fromEntries(FACE_ORDER.map((f) => [f, capturedFaces[f].colors]))),
          // What detection said before any hand correction - the diff
          // against colorsURFDLB is exactly what a human had to fix.
          detectedURFDLB: FACE_ORDER.every((f) => capturedFaces[f].detectedColors)
            ? gridsToWRGFacelets(Object.fromEntries(FACE_ORDER.map((f) => [f, capturedFaces[f].detectedColors!])))
            : undefined,
          faces,
          meta,
        }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error ?? `Failed (${res.status})`)
      setFixtureSaveMessage(`✓ Saved as regression fixture: ${result.path}`)
    } catch (err) {
      setFixtureSaveMessage(`❌ Failed to save fixture: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setLoading(false)
    }
  }

  const handleCapturePhoto = async () => {
    if (!webcamRef.current) return

    try {
      setLoading(true)
      setCaptureMessage('Processing image...')
      const result = captureAndProcessFace(webcamRef.current, puzzleSize, NEUTRAL_GAINS, sampling)
      const track = (webcamRef.current.srcObject as MediaStream | null)?.getVideoTracks()[0]
      await applyFaceCapture(webcamFace, result, track ? withoutDeviceIds(track.getSettings()) : undefined)
    } catch (err) {
      console.error('Capture error:', err)
      setCaptureMessage(`❌ Error: ${err instanceof Error ? err.message : 'Unknown error'}`)
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

      const url = URL.createObjectURL(file)
      try {
        const img = new Image()
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve()
          img.onerror = () => reject(new Error('Could not load image file'))
          img.src = url
        })
        const result = captureAndProcessImage(img, puzzleSize, NEUTRAL_GAINS, sampling)
        await applyFaceCapture(webcamFace, result)
      } finally {
        URL.revokeObjectURL(url)
      }
    } catch (err) {
      console.error('Image import error:', err)
      setCaptureMessage(`❌ Error: ${err instanceof Error ? err.message : 'Unknown error'}`)
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
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle')
  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopyStatus('copied')
    } catch (err) {
      console.error('Copy failed:', err)
      setCopyStatus('failed')
    }
    setTimeout(() => setCopyStatus('idle'), 1500)
  }

  // ─────────────────────────────────────────────────────────────────────────
  // UI: Preset Algorithms
  // ─────────────────────────────────────────────────────────────────────────

  const presets = {
    Trigger: "R U R' U'",
    Sune: "R U R' U R U2 R'",
    Slices: "M' U M U2 M' U M",
    Rotations: "x y z",
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  const getNotationOutput = () => {
    if (!cube) return 'null'
    return notationFormat === 'wrg' ? toWRGFacelets(cube) : toURFFacelets(cube)
  }

  return (
    <div class="app-layout">
      {/* Header */}
      <header class="app-header">
        <div class="header-content">
          <h1>CubeAssembler</h1>
          <p>Assemble, validate, and solve Rubik's Cubes from face photos</p>
        </div>
      </header>

      <main class="app-main">
        {/* Puzzle Size Bar */}
        <div class="size-control-panel">
          <span class="size-control-label">Puzzle Size</span>
          <div class="size-selector">
            {[2, 3, 4, 5, 6, 7].map((size) => (
              <button
                key={size}
                class={`size-btn ${puzzleSize === size ? 'active' : ''}`}
                onClick={() => setPuzzleSize(size)}
              >
                {size}×{size}
              </button>
            ))}
          </div>
        </div>

        {/* Cube Net */}
        {cube && (() => {
          // parity.highlight (see server/Server.ts's HighlightGroup) is a
          // list of readings, each with its own `group` tag (the color
          // combination or matched piece name it read as) and the facelets
          // backing it. Multiple entries can share a `group` - e.g. every
          // wing that matched an over-represented pair - which is exactly
          // the set to cross-highlight on hover, since they're the
          // candidates for "which of these is actually the misread one".
          const highlightGroups: Array<{ group: string; facelets: { face: string; index: number }[] }> =
            parity?.highlight ?? []
          const totalHighlighted = highlightGroups.reduce((n, g) => n + g.facelets.length, 0)
          const groupAt = (face: string, index: number): string | undefined =>
            highlightGroups.find((g) => g.facelets.some((f) => f.face === face && f.index === index))?.group
          return (
          <div class="net-region">
            <h3>Cube Net</h3>
            {totalHighlighted > 0 && (
              <p class="net-highlight-note">
                ⚠ {totalHighlighted} sticker{totalHighlighted === 1 ? '' : 's'} outlined below may be involved in the
                parity problem — see the message above. Hover one to see which others share its color reading.
              </p>
            )}
            <div class="cube-net">
              {(
                [
                  ['U', cube.u, 'net-u'],
                  ['L', cube.l, 'net-l'],
                  ['F', cube.f, 'net-f'],
                  ['R', cube.r, 'net-r'],
                  ['B', cube.b, 'net-b'],
                  ['D', cube.d, 'net-d'],
                ] as [string, string[], string][]
              ).map(([label, data, cls]) => {
                // Faces are named by their lowercase CubeIR key ('u','r',...)
                // in parity.highlight, matching `cube`'s own keys - `label`
                // here is only the uppercase display letter used for the
                // net-u/net-l/... CSS class.
                const faceKey = label.toLowerCase()
                return (
                  <div class={`net-face ${cls}`} key={label}>
                    <div
                      class="net-face-grid"
                      style={{ gridTemplateColumns: `repeat(${puzzleSize}, 1fr)` }}
                    >
                      {data.map((color, i) => {
                        const group = groupAt(faceKey, i)
                        const isHoverRelated = group !== undefined && group === hoveredHighlightGroup
                        return (
                          <div
                            class={`net-cell ${group !== undefined ? 'net-cell-highlighted' : ''} ${isHoverRelated ? 'net-cell-hover-related' : ''}`}
                            key={i}
                            style={{ background: STICKER_HEX[color] || '#888' }}
                            onMouseEnter={() => { if (group !== undefined) setHoveredHighlightGroup(group) }}
                            onMouseLeave={() => setHoveredHighlightGroup(null)}
                          ></div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
          )
        })()}

        {/* Face Capture Panel */}
        <section class="face-capture-panel">
          <div class="face-capture-header">
            <h2>Capture Cube Faces</h2>
            <div class="face-capture-actions">
              <button class="btn btn-secondary btn-sm" onClick={handleApplySolved}>
                Reset to Solved
              </button>
              <button class="btn btn-secondary btn-sm" onClick={() => setShowColorInput(!showColorInput)}>
                {showColorInput ? '✕ Close' : '+ Manual Input'}
              </button>
            </div>
          </div>
          <div class="face-capture-entry">
            <button class="btn btn-primary" onClick={handleOpenCapture}>
              {FACE_ORDER.every((f) => f in capturedFaces)
                ? 'Recapture Faces'
                : FACE_ORDER.some((f) => f in capturedFaces)
                ? `Continue Capturing (${FACE_ORDER.filter((f) => f in capturedFaces).length}/${FACE_ORDER.length})`
                : 'Capture Faces'}
            </button>
            <label
              class={`btn btn-secondary ${loading ? 'btn-disabled' : ''}`}
              title="Select a fixture's meta.json together with its 6 face-*.jpg photos"
            >
              ⇪ Upload Fixture
              <input
                type="file"
                accept=".json,image/*"
                multiple
                hidden
                disabled={loading}
                onChange={handleUploadFixture}
              />
            </label>
            <label
              class="mirror-toggle"
              title="Review the fixture from what detection reads now, without the colors that were picked by hand when it was saved"
            >
              <input
                type="checkbox"
                checked={ignoreFixtureCorrections}
                onChange={(e) => setIgnoreFixtureCorrections(e.currentTarget.checked)}
              />
              Ignore saved corrections
            </label>
            {FACE_ORDER.every((f) => f in capturedFaces) && (
              <button
                class="btn btn-secondary"
                onClick={() => {
                  setReviewStep(0)
                  setShowReviewDialog(true)
                }}
              >
                ✎ Edit Colors
              </button>
            )}
            <div class="face-status-dots">
              {FACE_ORDER.map((face) => (
                <span
                  key={face}
                  class={`progress-dot ${capturedFaces[face] ? 'done' : ''}`}
                  title={`Face ${FACE_DISPLAY_LABEL[face]}${capturedFaces[face] ? ' (captured)' : ' (not captured)'}`}
                >
                  {FACE_DISPLAY_LABEL[face]}
                </span>
              ))}
            </div>
          </div>
          {/* Fixture-load/bulk-action feedback: the webcam modal has its own
              copy of this same message for the live-capture flow, but that
              modal isn't open for an upload started from this panel, so
              without this the message would update invisibly. */}
          {captureMessage && !webcamOpen && (
            <div role="status" class={`capture-message ${captureMessage.includes('✓') ? 'success' : captureMessage.includes('❌') ? 'error' : ''}`}>
              {captureMessage}
            </div>
          )}
          {showColorInput && (
            <div class="color-input-panel">
              <div class="notation-format-toggle">
                <button
                  class={`wb-btn ${notationFormat === 'wrg' ? 'active' : ''}`}
                  onClick={() => setNotationFormat('wrg')}
                >
                  WRG Facelets
                </button>
                <button
                  class={`wb-btn ${notationFormat === 'urf' ? 'active' : ''}`}
                  onClick={() => setNotationFormat('urf')}
                >
                  URF Facelets
                </button>
              </div>
              <label>
                {notationFormat === 'wrg'
                  ? `Enter WRG facelets: 6 blocks of ${puzzleSize * puzzleSize} colors (W, O, G, R, B, Y), space-separated, in U R F D L B order`
                  : `Enter URF facelets: 6 blocks of ${puzzleSize * puzzleSize} letters (U, R, F, D, L, B - the face each sticker's color matches when solved), space-separated, in U R F D L B order`}
              </label>
              <textarea
                value={manualColorInput}
                onInput={(e) => {
                  const value = e.currentTarget.value
                  setManualColorInput(value)
                  const detected = detectNotationFormat(value)
                  if (detected && detected !== notationFormat) setNotationFormat(detected)
                }}
                placeholder={notationFormat === 'wrg'
                  ? Array(6).fill('W'.repeat(puzzleSize * puzzleSize)).join(' ')
                  : ['U', 'R', 'F', 'D', 'L', 'B'].map((l) => l.repeat(puzzleSize * puzzleSize)).join(' ')}
                rows={6}
                style={{ width: '100%', marginTop: '0.5rem' }}
              />
              <div class="input-actions">
                <button
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

        {/* Controls: Algorithms, Scramble, Parity, Notation */}
        <aside class="panel panel-controls">
          <div class="control-section">
            <h2>WCA Notation</h2>
            <label>Algorithm</label>
            <input
              type="text"
              placeholder="R U R' U'  F' U F  ..."
              value={algorithm}
              onInput={(e) => setAlgorithm(e.currentTarget.value)}
            />

            <div class="algo-presets">
              {Object.entries(presets).map(([name, algo]) => (
                <button
                  class="preset-btn"
                  onClick={() => handlePresetAlgorithm(algo)}
                  key={name}
                >
                  {name}
                </button>
              ))}
            </div>

            <div class="btn-row">
              <button class="btn btn-primary" onClick={handleApplyAlgorithm} disabled={loading || !cube}>
                {loading ? '⏳ Applying...' : 'Apply Algorithm'}
              </button>
              <button class="btn btn-secondary" onClick={handleInvertAlgorithm} disabled={loading || !cube}>
                {loading ? '⏳ Inverting...' : 'Invert & Apply'}
              </button>
            </div>
          </div>

          <div class="control-section">
            <h2>Scramble</h2>
            <div class="scramble-display">{scramble || 'Press Generate to get a WCA scramble'}</div>
            <div class="btn-row">
              <button class="btn btn-primary" onClick={handleGenerateScramble} disabled={loading}>
                {loading ? '⏳ Generating...' : 'Generate WCA Scramble'}
              </button>
              <button class="btn btn-secondary" onClick={handleApplyScramble} disabled={loading || !scramble || !cube}>
                {loading ? '⏳ Applying...' : 'Apply Scramble'}
              </button>
            </div>
          </div>

          <div class="control-section">
            <h2>Parity Status</h2>
            {/* Always mounted, so screen readers announce the verdict when it
                changes - only the summary, not every individual check. */}
            <div role="status">
              {parity ? (
                <div class={`status-line ${parity.valid ? 'success' : 'error'}`}>
                  <span class={`status-dot ${parity.valid ? 'success' : 'error'}`} aria-hidden="true"></span>
                  {parity.result}
                </div>
              ) : (
                <div class="status-line">No cube loaded. Capture all 6 faces to validate.</div>
              )}
            </div>
            {parity && (
              <div class="parity-checks">
                {Object.entries(parity.checks).map(([check, valid]: [string, any]) => (
                  <div class="status-line" key={check}>
                    <span class={`status-dot ${valid ? 'success' : 'error'}`} aria-hidden="true"></span>
                    {check}: {valid ? '✓' : '✗'}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div class="control-section">
            <h2>Notation Output</h2>
            <div class="notation-format-toggle">
              <button
                class={`wb-btn ${notationFormat === 'wrg' ? 'active' : ''}`}
                onClick={() => setNotationFormat('wrg')}
              >
                WRG Facelets
              </button>
              <button
                class={`wb-btn ${notationFormat === 'urf' ? 'active' : ''}`}
                onClick={() => setNotationFormat('urf')}
              >
                URF Facelets
              </button>
            </div>
            <p class="notation-hint">
              {notationFormat === 'wrg'
                ? `WRG facelets: 6 blocks of ${puzzleSize * puzzleSize} (W O G R B Y colors), space-separated.`
                : `URF facelets: 6 blocks of ${puzzleSize * puzzleSize} (U R F D L B letters), space-separated.`}
            </p>
            <textarea readonly value={getNotationOutput()} />
            <div class="btn-row">
              <button class="btn btn-primary" onClick={() => cube && copyToClipboard(getNotationOutput())}>
                <span aria-live="polite">
                  {copyStatus === 'copied' ? '✓ Copied' : copyStatus === 'failed' ? 'Copy failed' : 'Copy to Clipboard'}
                </span>
              </button>
              {cube && (
                <button
                  class="btn btn-secondary"
                  onClick={handleSendFixtureToServer}
                  disabled={loading}
                  title="Save this capture's photos + reviewed colors on the server as a permanent regression test fixture"
                >
                  {loading ? '⏳ Sending...' : '💾 Send to Server (Save as Test Fixture)'}
                </button>
              )}
            </div>
            {fixtureSaveMessage && (
              <div role="status" class={`capture-message ${fixtureSaveMessage.includes('✓') ? 'success' : fixtureSaveMessage.includes('❌') ? 'error' : ''}`}>
                {fixtureSaveMessage}
              </div>
            )}
          </div>
        </aside>
      </main>

      {/* Webcam Modal */}
      {webcamOpen && (
        <div class="modal open">
          <div
            class="modal-content capture-modal-content"
            role="dialog"
            aria-modal="true"
            tabIndex={-1}
            ref={focusModalOnOpen}
            onKeyDown={(e) => handleModalKeyDown(e, e.currentTarget, () => setWebcamOpen(false))}
          >
            <div class="modal-header">
              <h2>Capturing: Face {FACE_DISPLAY_LABEL[webcamFace]}</h2>
              <button class="modal-close" aria-label="Close" onClick={() => setWebcamOpen(false)}>×</button>
            </div>
            <div class="capture-progress">
              <span class="capture-progress-label">
                Face {FACE_ORDER.indexOf(webcamFace) + 1} of {FACE_ORDER.length}
              </span>
              <div class="capture-progress-dots">
                {FACE_ORDER.map((face) => (
                  <span
                    key={face}
                    class={`progress-dot ${capturedFaces[face] ? 'done' : ''} ${face === webcamFace ? 'current' : ''}`}
                    title={`Face ${FACE_DISPLAY_LABEL[face]}${capturedFaces[face] ? ' (captured)' : ''} — click to jump here`}
                    onClick={() => {
                      setWebcamFace(face)
                      setCaptureMessage('')
                    }}
                  >
                    {FACE_DISPLAY_LABEL[face]}
                  </span>
                ))}
              </div>
            </div>
            <div class="capture-size-row">
              <span class="capture-size-label">Cube size:</span>
              <div class="capture-size-buttons">
                {[2, 3, 4, 5, 6, 7].map((size) => (
                  <button
                    key={size}
                    class={`wb-btn ${puzzleSize === size ? 'active' : ''}`}
                    onClick={() => {
                      if (size === puzzleSize) return
                      if (Object.keys(capturedFaces).length > 0) {
                        setCapturedFaces({})
                        setFaceConfidence({})
                        setWebcamFace(FACE_ORDER[0])
                      }
                      setPuzzleSize(size)
                    }}
                  >
                    {size}×{size}
                  </button>
                ))}
              </div>
            </div>
            <div class="capture-options-row">
              <label class="mirror-toggle">
                <input
                  type="checkbox"
                  checked={mirrorPreview}
                  onChange={(e) => setMirrorPreview(e.currentTarget.checked)}
                />
                Mirror
              </label>
              <button
                type="button"
                class={`btn btn-secondary btn-sm ${samplingSetupOpen ? 'active' : ''}`}
                aria-expanded={samplingSetupOpen}
                onClick={() => setSamplingSetupOpen((open) => !open)}
              >
                ⚙ Sampling setup
              </button>
            </div>
            {samplingSetupOpen && (
              <div class="sampling-setup">
                <label class="sampling-slider">
                  <span>
                    Border around face <output>{Math.round(sampling.faceMargin * 100)}%</output>
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={20}
                    step={1}
                    value={Math.round(sampling.faceMargin * 100)}
                    onInput={(e) => updateSampling({ ...sampling, faceMargin: Number(e.currentTarget.value) / 100 })}
                  />
                </label>
                <label class="sampling-slider">
                  <span>
                    Gap around each sticker <output>{Math.round((1 - sampling.stickerCore) * 100)}%</output>
                  </span>
                  <input
                    type="range"
                    min={10}
                    max={70}
                    step={5}
                    value={Math.round((1 - sampling.stickerCore) * 100)}
                    onInput={(e) => updateSampling({ ...sampling, stickerCore: 1 - Number(e.currentTarget.value) / 100 })}
                  />
                </label>
                <p class="sampling-setup-hint">
                  Hold a face in the square. Each small box should sit fully inside its sticker, and its outline
                  should show that sticker's color.
                </p>
                <div class="sampling-setup-actions">
                  <button type="button" class="btn btn-secondary btn-sm" onClick={() => updateSampling(DEFAULT_SAMPLING)}>
                    Reset
                  </button>
                  <button type="button" class="btn btn-primary btn-sm" onClick={() => setSamplingSetupOpen(false)}>
                    Done
                  </button>
                </div>
              </div>
            )}
            <div class="capture-video-wrapper">
              <video
                ref={webcamRef}
                autoplay
                muted
                playsinline
                class={`webcam-feed ${mirrorPreview ? 'mirrored' : ''}`}
              />
              {liveDetection && (
                // Positioned from stickerSampleRect in percent of the guide
                // square, so the overlay shows exactly what the detector
                // reads. During sampling setup it switches from per-sticker
                // confidence to the sampled zones themselves, outlined in the
                // color each one reads as.
                <div
                  class={`capture-grid-overlay ${mirrorPreview ? 'mirrored' : ''} ${samplingSetupOpen ? 'is-setup' : ''}`}
                >
                  {samplingSetupOpen && (
                    <div class="capture-grid-bounds" style={{ inset: `${sampling.faceMargin * 100}%` }} />
                  )}
                  {liveDetection.colors.map((row, r) =>
                    row.map((color, c) => {
                      const n = liveDetection.colors.length
                      const cell = stickerSampleRect(r, c, n, 100, 100, { ...sampling, stickerCore: 1 })
                      const zone = stickerSampleRect(r, c, n, 100, 100, sampling)
                      return (
                        <Fragment key={`${r}-${c}`}>
                          <div
                            class={`capture-grid-cell confidence-${confidenceTier(liveDetection.cellConfidences[r][c])}`}
                            style={{ left: `${cell.x}%`, top: `${cell.y}%`, width: `${cell.width}%`, height: `${cell.height}%` }}
                          />
                          {samplingSetupOpen && (
                            <div
                              class="capture-sample-zone"
                              style={{
                                left: `${zone.x}%`, top: `${zone.y}%`, width: `${zone.width}%`, height: `${zone.height}%`,
                                borderColor: STICKER_HEX[color] ?? '#888',
                              }}
                            />
                          )}
                        </Fragment>
                      )
                    })
                  )}
                </div>
              )}
              {/* Always-visible guide framing exactly what region gets
                  analyzed, on top of the grid so its border/dimming stays
                  visible even once per-cell colors are drawn underneath. */}
              <div class="capture-scan-frame">
                <span class="capture-scan-label">Fit face in this square</span>
              </div>
            </div>
            <p class="capture-hint-text">
              Align cube face in center
              {' — live confidence: '}
              {liveDetection ? `${(liveDetection.confidence * 100).toFixed(0)}%` : '—'}
            </p>
            <div
              role="status"
              class={`capture-message ${captureMessage ? (captureMessage.includes('✓') ? 'success' : captureMessage.includes('❌') ? 'error' : '') : 'is-empty'}`}
            >
              {captureMessage || '—'}
            </div>
            <button
              class="btn btn-primary"
              onClick={handleCapturePhoto}
              disabled={loading}
            >
              {loading ? '⏳ Processing...' : 'Capture Photo'}
            </button>

            <label>Import from image file</label>
            <input type="file" accept="image/*" onChange={handleImportImage} disabled={loading} />
          </div>
        </div>
      )}

      {/* Post-Capture Review Wizard: step through faces one at a time,
          photo on the left (clean, undecorated) and the detected colors as
          a separate interactive grid on the right — not overlaid on the
          photo, so there's always a clear, unobstructed original to check
          the detection against. */}
      {showReviewDialog && (() => {
        const face = FACE_ORDER[reviewStep]
        const data = capturedFaces[face]
        const isLast = reviewStep === FACE_ORDER.length - 1

        return (
          <div class="modal open">
            <div
              class="modal-content review-modal-content"
              role="dialog"
              aria-modal="true"
              tabIndex={-1}
              ref={focusModalOnOpen}
              onKeyDown={(e) => handleModalKeyDown(e, e.currentTarget, () => setShowReviewDialog(false))}
            >
              <div class="modal-header">
                <h2>Approve Face {FACE_DISPLAY_LABEL[face]} of {FACE_ORDER.length}</h2>
                <button class="modal-close" aria-label="Close" onClick={() => setShowReviewDialog(false)}>×</button>
              </div>
              <div class="review-progress-dots">
                {FACE_ORDER.map((f, i) => (
                  <span
                    key={f}
                    class={`progress-dot ${i < reviewStep ? 'done' : ''} ${i === reviewStep ? 'current' : ''}`}
                    onClick={() => setReviewStep(i)}
                    title={`Face ${FACE_DISPLAY_LABEL[f]}`}
                  >
                    {FACE_DISPLAY_LABEL[f]}
                  </span>
                ))}
              </div>
              {globalWhiteBalanceNote && (
                <div class="global-wb-note">✓ {globalWhiteBalanceNote}</div>
              )}
              {data && (
                <>
                  <div class="review-wizard-panes">
                    <div class="review-pane">
                      <div class="review-pane-label">Photo</div>
                      <div class="review-face-image-wrapper">
                        {data.croppedImage && (
                          <img
                            src={data.croppedImage}
                            class="review-face-image"
                            alt={`Captured photo of face ${FACE_DISPLAY_LABEL[face]}`}
                          />
                        )}
                      </div>
                    </div>
                    <div class="review-pane">
                      {(() => {
                        // A cell is worth a second look for either of two
                        // independent reasons: the classifier itself was
                        // unsure (low confidence), or the sticker sits
                        // close to the boundary with another color (see
                        // cellLookalikes) - flag both the same way so a
                        // human correcting one ambiguous sticker doesn't
                        // have to first work out which signal triggered it.
                        let flaggedCount = 0
                        let correctedCount = 0
                        for (let r = 0; r < data.colors.length; r++) {
                          for (let c = 0; c < data.colors[r].length; c++) {
                            const detected = data.detectedColors?.[r]?.[c]
                            const corrected = detected !== undefined && detected !== data.colors[r][c]
                            const lowConfidence = confidenceTier(data.cellConfidences?.[r]?.[c] ?? 1) === 'low'
                            const lookalike = data.cellLookalikes?.[r]?.[c]
                            if (corrected) correctedCount++
                            else if (lowConfidence || lookalike) flaggedCount++
                          }
                        }
                        return (
                          <div class="review-pane-label">
                            <span>Colors found</span>
                            {flaggedCount > 0 && (
                              <span class="review-flagged-count">⚠ {flaggedCount} to double-check</span>
                            )}
                            {correctedCount > 0 && (
                              <span class="review-corrected-count">✎ {correctedCount} changed by you</span>
                            )}
                          </div>
                        )
                      })()}
                      <div
                        class="review-detected-grid"
                        style={{
                          gridTemplateColumns: `repeat(${data.colors.length}, 1fr)`,
                          gridTemplateRows: `repeat(${data.colors.length}, 1fr)`,
                          '--grid-n': String(data.colors.length),
                        }}
                      >
                        {data.colors.map((row, r) =>
                          row.map((color, c) => {
                            // The final color stays the human choice; the badge only
                            // records what automatic detection had said instead. A
                            // human-set sticker is settled: detection's confidence and
                            // lookalike were about the color it saw, not this one.
                            const detected = data.detectedColors?.[r]?.[c]
                            const corrected = detected !== undefined && detected !== color
                            const confidence = corrected ? undefined : data.cellConfidences?.[r]?.[c]
                            const tier = confidenceTier(confidence ?? 1)
                            const lookalike = corrected ? null : data.cellLookalikes?.[r]?.[c] ?? null
                            const flagged = tier === 'low' || lookalike !== null
                            const name = COLOR_NAME[color] ?? color
                            const sure = confidence !== undefined ? `, ${Math.round(confidence * 100)}% sure` : ''
                            const notes = [
                              corrected ? `We saw ${COLOR_NAME[detected] ?? detected}, you picked ${name}.` : null,
                              tier === 'low' ? 'Not sure about this one.' : null,
                              lookalike ? `It looks a lot like ${COLOR_NAME[lookalike] ?? lookalike}.` : null,
                            ].filter(Boolean)
                            return (
                              <button
                                key={`${r}-${c}`}
                                class={`review-detected-cell ${flagged ? 'review-detected-cell-flagged' : ''} ${corrected ? 'review-detected-cell-corrected' : ''}`}
                                style={{ background: STICKER_HEX[color] || '#888' }}
                                onClick={() => setReviewEditingCell({ face, row: r, col: c })}
                                title={[`Row ${r + 1}, column ${c + 1}: ${name}${sure}.`, ...notes, 'Tap to change.'].join(' ')}
                              >
                                {confidence !== undefined && (
                                  <span class="review-detected-confidence">{Math.round(confidence * 100)}%</span>
                                )}
                                {/* Cells on bigger grids are too small for the badge next
                                    to the percentage - the amber ring alone marks them. */}
                                {flagged && data.colors.length <= 4 && (
                                  <span class="review-detected-cell-flag" aria-hidden="true">⚠</span>
                                )}
                                {corrected && (
                                  <span
                                    class="review-detected-cell-was"
                                    style={{ background: STICKER_HEX[detected] || '#888' }}
                                    aria-hidden="true"
                                  >
                                    {detected}
                                  </span>
                                )}
                              </button>
                            )
                          })
                        )}
                      </div>
                      <div class="review-pane-hint">Tap a sticker to fix it</div>
                    </div>
                  </div>
                  <div class="review-wizard-nav">
                    <button class="btn btn-secondary btn-sm" onClick={() => handleRetakeFace(face)}>
                      Retake this face
                    </button>
                    <div class="review-wizard-nav-spacer" />
                    <button
                      class="btn btn-secondary btn-sm"
                      onClick={() => setReviewStep((s) => Math.max(0, s - 1))}
                      disabled={reviewStep === 0}
                    >
                      ← Previous
                    </button>
                    {isLast ? (
                      <button class="btn btn-primary" onClick={handleConfirmReview}>
                        ✓ Confirm & Assemble Cube
                      </button>
                    ) : (
                      <button class="btn btn-primary" onClick={() => setReviewStep((s) => s + 1)}>
                        Approve & Next →
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )
      })()}

      {/* Orientation wizard - see orientationWizard/pickWizardFace/groupWizardOptions */}
      {orientationWizard && (() => {
        const { remaining, truncated, picked } = orientationWizard
        const askingFace = pickWizardFace(remaining)
        // handleWizardAnswer never leaves the wizard open once no face is
        // left to ask about, so this should always resolve - but fall
        // back to the net-preview picker's old "show everything" behavior
        // rather than rendering nothing if that invariant is ever wrong.
        if (!askingFace) {
          return (
            <div class="modal open">
              <div
                class="modal-content orientation-picker"
                role="dialog"
                aria-modal="true"
                tabIndex={-1}
                ref={focusModalOnOpen}
                onKeyDown={(e) => handleModalKeyDown(e, e.currentTarget, () => setOrientationWizard(null))}
              >
                <div class="modal-header">
                  <h2>Which orientation matches your cube?</h2>
                  <button class="modal-close" aria-label="Close" onClick={() => setOrientationWizard(null)}>×</button>
                </div>
                <div class="orientation-picker-grid">
                  {remaining.map((alt, i) => (
                    <div key={i} class="orientation-picker-option">
                      <OrientationNetPreview faces={alt.faces} />
                      <button class="btn btn-primary btn-sm" onClick={() => handleChooseOrientation(alt)}>
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
          const distinct = new Set(remaining.map((c) => faceContentKey(c.faces[f])))
          progressFaces[f] = remaining[0].faces[f]
          if (distinct.size > 1) undecidedFaces.add(f)
          else if (!picked.includes(f)) autoFaces.add(f)
        }
        const decidedCount = WIZARD_FACE_ORDER.length - undecidedFaces.size
        const options = groupWizardOptions(remaining, askingFace)

        return (
          <div class="modal open">
            <div
              class="modal-content orientation-picker"
              role="dialog"
              aria-modal="true"
              tabIndex={-1}
              ref={focusModalOnOpen}
              onKeyDown={(e) => handleModalKeyDown(e, e.currentTarget, () => setOrientationWizard(null))}
            >
              <div class="modal-header">
                <h2>Which way is your {FACE_LABELS[askingFace]} face?</h2>
                <button class="modal-close" aria-label="Close" onClick={() => setOrientationWizard(null)}>×</button>
              </div>
              <p class="orientation-picker-note">
                {decidedCount}/6 set · {remaining.length} left — match the framed face.
              </p>
              {truncated && (
                <p class="orientation-picker-note orientation-picker-truncated-note">
                  ⚠️ More matches exist than shown — if none fit, retake the photos.
                </p>
              )}
              <OrientationNetPreview
                faces={progressFaces}
                undecidedFaces={undecidedFaces}
                currentFace={askingFace}
                autoFaces={autoFaces}
              />
              <div class="orientation-picker-grid orientation-wizard-options">
                {options.map((opt, i) => (
                  <button
                    key={i}
                    type="button"
                    class="orientation-picker-option orientation-wizard-option"
                    aria-label={`Option ${i + 1} for the ${FACE_LABELS[askingFace]} face`}
                    disabled={wizardMorphing}
                    onClick={(e) => handleWizardPick(e.currentTarget, opt.candidates, askingFace)}
                  >
                    <FaceGrid colors={opt.grid} />
                  </button>
                ))}
              </div>
            </div>
          </div>
        )
      })()}

      {/* Color-fix palette popup */}
      {reviewEditingCell && (
        <div class="modal open color-picker-modal" onClick={() => setReviewEditingCell(null)}>
          <div
            class="modal-content color-picker-content"
            role="dialog"
            aria-modal="true"
            tabIndex={-1}
            ref={focusModalOnOpen}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => handleModalKeyDown(e, e.currentTarget, () => setReviewEditingCell(null))}
          >
            <h3>Fix color</h3>
            {(() => {
              // How well this sticker's measured color matches each option,
              // so the likely alternatives stand out.
              const { face, row, col } = reviewEditingCell
              const rgb = capturedFaces[face]?.cellColors?.[row]?.[col]
              const scores = rgb ? colorConfidences(rgb, learnedPalette ?? STICKER_COLORS) : null
              const current = capturedFaces[face]?.colors[row]?.[col]
              return (
                <div class="color-palette">
                  {['W', 'Y', 'O', 'R', 'G', 'B'].map((color) => (
                    <button
                      key={color}
                      class={`color-btn ${color === current ? 'is-current' : ''}`}
                      style={{ background: STICKER_HEX[color] }}
                      aria-pressed={color === current}
                      onClick={() => handleFixCellColor(face, row, col, color)}
                    >
                      <span class="color-btn-name">{COLOR_NAME[color]}</span>
                      {scores && <span class="color-btn-confidence">{Math.round((scores[color] ?? 0) * 100)}%</span>}
                    </button>
                  ))}
                </div>
              )
            })()}
            <button class="btn btn-secondary btn-sm" onClick={() => setReviewEditingCell(null)}>
              Cancel
            </button>
          </div>
        </div>
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
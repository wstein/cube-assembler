import { render, h, Fragment } from 'preact'
import { useState, useEffect, useRef, useMemo } from 'preact/hooks'
import '../../web/style.css'
import {
  captureAndProcessFace, captureAndProcessImage, extractCubeFaceColors, hasVisibleCubeFace,
  runGlobalWhiteBalance, NEUTRAL_GAINS, CROP_JPEG_QUALITY,
  DEFAULT_SAMPLING, MAX_BACKGROUND_GAP, STICKER_MEASUREMENT, stickerSampleRect, colorConfidences, STICKER_COLORS, type SamplingGeometry,
  rgbToOKLCH, hueCircularRange, hueRangesOverlap, linearRange,
  type ColorDetectionResult, type FaceCaptureResult, type RGB,
} from './imageProcessing'
import {
  assembleCubeFromFaces, validateFaceColors, createSolvedCube, toCubeIR, solveFaceOrientations, solveGuidedCapture,
  checkGuidedCenters, findRepeatedFaces, orientationFreeSignature, predictGuidedSideCenter,
  type OrientedCandidate, type OrientationSolution, type FaceKey, type GuidedArrangement, type GuidedCenterIssue,
} from './cubeAssembly'
import {
  parseProfileStore, activeProfile, profilesForSize, saveProfile, selectProfile, deleteProfile,
  brandProfile, CUBE_BRANDS, CUBE_STYLES, type CubeStyle,
  profilePalette, withLearnedColors, withoutLearnedColors, suggestProfile, type CubeProfile, type ProfileStore,
} from './cubeProfiles'
import { readFixtureColors } from './fixtureFormat'
import {
  toWRGFacelets, fromWRGFacelets, toURFFacelets, fromURFFacelets, detectNotationFormat, gridsToWRGFacelets,
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
  // Where the photo came from: the live camera, an imported image file, or
  // an uploaded fixture. Absent for faces without a photo (manual input).
  source?: 'camera' | 'image-file' | 'fixture'
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

// Cube profiles (see cubeProfiles.ts) are a property of the user's cubes
// and camera, not of one capture, so they're remembered between sessions.
// Kept in a cookie rather than localStorage: cookies aren't scoped by
// port, so the dev server (5173) and the Bun server (3000) share them.
const PROFILES_COOKIE = 'cube-assembler-profiles'
// Per-size sampling settings from before cube profiles existed - read once
// and migrated into generic profiles.
const LEGACY_SAMPLING_COOKIE = 'cube-assembler-sampling'
const PROFILES_COOKIE_MAX_AGE = 60 * 60 * 24 * 365 * 5
// Browsers drop cookies over ~4 KB, so refuse to save past this.
const PROFILES_COOKIE_MAX_BYTES = 3800
// Marks a downloaded settings file, so uploading some other JSON is refused.
const PROFILES_FILE_TYPE = 'cube-assembler-profiles'
const LEGACY_SAMPLING_FILE_TYPE = 'cube-assembler-sampling'

function readCookie(name: string): unknown {
  try {
    const cookie = document.cookie.split('; ').find((c) => c.startsWith(`${name}=`))
    return cookie ? JSON.parse(decodeURIComponent(cookie.slice(name.length + 1))) : null
  } catch {
    return null // corrupt cookie - treated as absent
  }
}

function loadProfileStore(): ProfileStore {
  return parseProfileStore(readCookie(PROFILES_COOKIE) ?? readCookie(LEGACY_SAMPLING_COOKIE))
}

// False when the store is too big to keep in a cookie.
function saveProfileStore(store: ProfileStore): boolean {
  const value = encodeURIComponent(JSON.stringify(store))
  if (value.length > PROFILES_COOKIE_MAX_BYTES) return false
  document.cookie = `${PROFILES_COOKIE}=${value}; path=/; max-age=${PROFILES_COOKIE_MAX_AGE}; SameSite=Lax`
  return true
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

// Guided capture: the 4 sides in turn while the cube is turned a quarter
// turn at a time (either way, same row kept on top), then top and bottom
// (see solveGuidedCapture). Which physical face is which isn't known until
// all 6 are in, so the capture slots keep the neutral U..B keys of
// FACE_ORDER (fixtures, uploads and the review key off them) and only
// their meaning is a step in this order - slot U is Side 1, R Side 2, ...
const CAPTURE_STEPS: Array<{ label: string; short: string; instruction: string }> = [
  { label: 'Side 1', short: '1', instruction: 'Hold the cube upright and show any side.' },
  { label: 'Side 2', short: '2', instruction: 'Keep the same row on top and turn the whole cube clockwise a quarter turn. Either way works.' },
  { label: 'Side 3', short: '3', instruction: 'Keep turning clockwise another quarter turn. Other directions still work.' },
  { label: 'Side 4', short: '4', instruction: 'Turn clockwise one more quarter turn. Any remaining side still works.' },
  { label: 'Top', short: '5', instruction: 'Tip the cube towards you so its top faces the camera - any angle is fine.' },
  { label: 'Bottom', short: '6', instruction: 'Bring Side 4 back to the camera, then continue tipping to the opposite face. Top and bottom may be swapped.' },
]
const stepOf = (slot: string) => CAPTURE_STEPS[FACE_ORDER.indexOf(slot)]

// Saved with fixtures captured this way, so they can be put together (and
// regression-tested) with the guided search again later.
const GUIDED_PROTOCOL = 'sides-then-top-bottom/v1'

// A capture mistake read from odd-size centers (see checkGuidedCenters),
// in words; photo indexes are capture steps.
function describeCenterIssue(issue: GuidedCenterIssue): string {
  const label = (i: number) => CAPTURE_STEPS[i].label
  switch (issue.kind) {
    case 'same-center': return `${label(issue.photos[0])} and ${label(issue.photos[1])} show the same center - the same face photographed twice?`
    case 'turned-twice': return `${label(issue.photo)} shows the face opposite ${label(issue.photo - 1)} - the cube was probably turned twice.`
    case 'not-opposite': return `${label(issue.photos[0])} and ${label(issue.photos[1])} should be opposite faces, but aren't.`
  }
}

// How a top/bottom photo was held, from the quarter turns needed to undo it.
const HELD_WORDS = ['', 'sideways', 'upside down', 'sideways']

// What the search changed to make the photos fit, in words.
function describeArrangement(a: GuidedArrangement): string[] {
  const [topFix, bottomFix] = a.capsSwapped ? [a.capRotations[1], a.capRotations[0]] : a.capRotations
  return [
    `You turned the cube to the ${a.turn} between sides.`,
    ...(a.capsSwapped ? ['Top and bottom were photographed the other way round.'] : []),
    ...(topFix ? [`The top was held ${HELD_WORDS[topFix]}.`] : []),
    ...(bottomFix ? [`The bottom was held ${HELD_WORDS[bottomFix]}.`] : []),
  ]
}
const FACE_DISPLAY_LABEL: Record<string, string> = Object.fromEntries(FACE_ORDER.map((face) => [face, stepOf(face).label]))
const FACE_SHORT_LABEL: Record<string, string> = Object.fromEntries(FACE_ORDER.map((face) => [face, stepOf(face).short]))

// How each color is drawn on screen (nets, review, picker) - slightly
// calmer than pure RGB so the six still read at a glance without glaring.
// Display only: detection never compares against these.
// Readable names for the server's parity checks (unknown ones show as-is).
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
  W: '#f7f6f1', O: '#ff7a1a', G: '#1e9e57', R: '#cf2a3a', B: '#2459d6', Y: '#f2d21b',
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
          style={(undecided && i !== centerIndex) || !color ? undefined : { background: STICKER_HEX[color] ?? '#888' }}
        />
      ))}
    </div>
  )
}

// Live net in the capture dialog: the 4 sides in the order taken, with Top
// (5) above and Bottom (6) below Side 4 (which way the cube was turned, and which
// of the two is really the top, is only worked out once all 6 are in).
// Each slot shows the colors detected for it, or a placeholder; tapping a
// slot retakes it or jumps to it.
function CaptureNet({ faces, current, size, predictedCenter, onSelect }: {
  faces: Record<string, string[][] | undefined>
  current: string
  size: number
  predictedCenter: string | null
  onSelect: (slot: string) => void
}) {
  const empty = Array.from({ length: size }, () => Array<string>(size).fill(''))
  const slot = (key: string, gridArea: string) => {
    const colors = faces[key]
    const suggested = !colors && key === current ? predictedCenter : null
    const preview = suggested ? empty.map((row) => row.slice()) : empty
    if (suggested) preview[Math.floor(size / 2)][Math.floor(size / 2)] = suggested
    return (
      <button
        type="button"
        key={key}
        class="capture-net-slot"
        style={{ gridArea }}
        data-slot={key}
        aria-label={`${FACE_DISPLAY_LABEL[key]}: ${colors ? 'captured, tap to retake' : suggested ? `suggested ${COLOR_NAME[suggested]} center, not captured yet` : 'not captured yet'}`}
        aria-current={key === current ? 'step' : undefined}
        onClick={() => onSelect(key)}
      >
        <FaceGrid colors={colors ?? preview} undecided={!colors} current={key === current} />
        <span class="capture-net-label" aria-hidden="true">{FACE_SHORT_LABEL[key]}</span>
      </button>
    )
  }
  const [s1, s2, s3, s4, top, bottom] = FACE_ORDER
  return (
    <div class="capture-net" role="group" aria-label="Captured faces">
      {slot(s1, '2 / 1')}
      {slot(s2, '2 / 2')}
      {slot(s3, '2 / 3')}
      {slot(s4, '2 / 4')}
      {slot(top, '1 / 4')}
      {slot(bottom, '3 / 4')}
    </div>
  )
}

// Small drawing next to a capture step's instruction. The arrow is painted
// on the front face in the same direction as the larger capture cue.
function TurnHint({ step }: { step: number }) {
  if (step === 0) return null
  const kind = step < 4 ? 'turn' : step === 4 ? 'tip-top' : 'tip-bottom'
  const arrowAngle = kind === 'turn' ? 270 : kind === 'tip-top' ? 180 : 0
  return (
    <svg class="turn-hint" viewBox="0 0 64 64" aria-hidden="true">
      <polygon points="16,24 42,24 52,14 26,14" class="turn-hint-face turn-hint-top" />
      <polygon points="42,24 52,14 52,40 42,50" class="turn-hint-face turn-hint-side" />
      <rect x="16" y="24" width="26" height="26" class="turn-hint-face" />
      {kind === 'turn' && <rect x="16" y="24" width="26" height="8" class="turn-hint-row" />}
      <g transform="translate(16 24) scale(.26)">
        <path
          class="turn-hint-painted-arrow"
          transform={`rotate(${arrowAngle} 50 50)`}
          d="M40 80 V43 H21 Q18 43 20 39 L45 10 Q50 5 55 10 L80 39 Q82 43 79 43 H60 V80 Q60 83 57 83 H43 Q40 83 40 80 Z"
        />
      </g>
    </svg>
  )
}

// A brief visual cue between successful captures. The turn shown is only an
// example: the guided solver determines the real face orientation afterward.
// It closes when the cube's turn animation ends, so its length lives only in
// the CSS; the timer is a fallback in case that animation never runs.
const TURN_CUE_FALLBACK_MS = 8000
function CaptureTurnOverlay({ step, startColors, viaColors, onContinue }: { step: number; startColors: string[][]; viaColors?: string[][]; onContinue: () => void }) {
  const kind = step < 4 ? 'side' : step === 4 ? 'top' : 'bottom'
  const title = kind === 'side' ? 'Turn to another side' : kind === 'top' ? 'Show a remaining face' : 'Show the last face'
  const detail = kind === 'side'
    ? 'Clockwise is suggested; either direction works.'
    : kind === 'top' ? 'Tip the cube up or down.' : 'Move through Side 4 to the opposite face.'
  const nextFace = kind === 'side' ? 'right' : kind === 'top' ? 'up' : 'back'
  const size = startColors.length
  const startStickers = startColors.flat()
  const viaStickers = viaColors?.flat()
  const directionArrow = () => (
    <svg class={`capture-turn-direction capture-turn-direction-${kind}`} viewBox="0 -10 100 100" aria-hidden="true">
      <path class="capture-turn-arrow-body" d="M41 70 V41 H24 C20 41 18 37 21 34 L45 7 C48 3 52 3 55 7 L79 34 C82 37 80 41 76 41 H59 V70 Q59 74 55 74 H45 Q41 74 41 70 Z" />
    </svg>
  )
  const face = (name: string) => (
    <div class={`capture-turn-face capture-turn-${name}`}>
      <div class="capture-turn-stickers" style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }}>
        {Array.from({ length: size * size }, (_, i) => (
          <span
            key={i}
            class={`capture-turn-sticker${name === nextFace ? ' capture-turn-sticker-next' : ''}`}
            style={name === 'front'
              ? { backgroundColor: STICKER_HEX[startStickers[i]] ?? '#888' }
              : kind === 'bottom' && name === 'down' && viaStickers
                ? { backgroundColor: STICKER_HEX[viaStickers[i]] ?? '#888' }
                : undefined}
          />
        ))}
      </div>
      {(name === 'front' || name === nextFace || (kind === 'bottom' && name === 'down')) && directionArrow()}
    </div>
  )
  return (
    <div class={`capture-turn-overlay capture-turn-${kind}`} role="status" aria-label={`${title}. ${detail}`}>
      <div class="capture-turn-scene" aria-hidden="true">
        <div class="capture-turn-cube" onAnimationEnd={(e) => { if (e.target === e.currentTarget) onContinue() }}>
          {face('front')}
          {face('back')}
          {face('right')}
          {face('left')}
          {face('up')}
          {face('down')}
        </div>
      </div>
      <div class="capture-turn-copy">
        <strong>{title}</strong>
        <span>{detail}</span>
      </div>
      <button type="button" class="capture-turn-continue" onClick={onContinue}>Continue</button>
    </div>
  )
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
      { transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width})`, transformOrigin: 'top left', opacity: 0.6 },
      { transform: 'none', transformOrigin: 'top left', opacity: 1 },
    ],
    { duration: 500, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' }
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
  const [turnOverlay, setTurnOverlay] = useState<{ step: number; startColors: string[][]; viaColors?: string[][] } | null>(null)
  const turnOverlayTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [fixtureSaveMessage, setFixtureSaveMessage] = useState('')
  const [manualColorInput, setManualColorInput] = useState('')
  const [showColorInput, setShowColorInput] = useState(false)
  const [notationFormat, setNotationFormat] = useState<'wrg' | 'urf'>('wrg')
  const [movesTab, setMovesTab] = useState<'algorithm' | 'scramble'>('algorithm')
  const [liveDetection, setLiveDetection] = useState<ColorDetectionResult | null>(null)
  const [liveFaceVisible, setLiveFaceVisible] = useState(false)
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
  // The arrangement(s) of the captured faces waiting for the customer's
  // OK (see handleConfirmReview): one to approve, a few to pick from, or a
  // closest match that isn't a valid cube. `fallback` feeds the wizard if
  // they say no.
  const [orientationApproval, setOrientationApproval] = useState<{
    candidates: OrientedCandidate[]
    arrangements?: GuidedArrangement[]
    valid: boolean
    note?: string
    fallback: OrientationSolution | null
  } | null>(null)
  // Capture-time warnings the customer chose to ignore (see captureWarning).
  const [dismissedCaptureWarnings, setDismissedCaptureWarnings] = useState<string[]>([])
  // capture.protocol of the last uploaded fixture (see isGuidedCapture).
  const [uploadedProtocol, setUploadedProtocol] = useState<string | null>(null)
  // A problem with the capture shown in the review dialog.
  const [reviewNotice, setReviewNotice] = useState<string | null>(null)
  const [reviewEditingCell, setReviewEditingCell] = useState<{ face: string; row: number; col: number } | null>(null)
  // Most laptop/webcam feeds are shown mirrored by convention (like a
  // physical mirror), which is what most users expect; default on but
  // let it be turned off for cameras that don't need it (e.g. a rear
  // phone camera fed in via some capture setups).
  const [mirrorPreview, setMirrorPreview] = useState(true)
  const [profileStore, setProfileStore] = useState<ProfileStore>(loadProfileStore)
  const profile = activeProfile(profileStore, puzzleSize)
  const sampling = profile.sampling
  // This cube's colors from its last capture, if any - what the live
  // preview and each face's first-pass colors are read against.
  const palette = useMemo(() => profilePalette(profile), [profile.id, profile.learnedAt])
  const [samplingSetupOpen, setSamplingSetupOpen] = useState(false)
  // Upload Fixture option: start the review from what detection reads
  // today instead of the colors the fixture was saved with, so a capture
  // can be reviewed afresh without its earlier hand corrections.
  const [ignoreFixtureCorrections, setIgnoreFixtureCorrections] = useState(false)
  // The 6 colors as learned from this capture's own stickers (null when the
  // cross-face recalibration didn't run) - what the color-fix picker scores
  // each alternative against.
  const [learnedPalette, setLearnedPalette] = useState<Record<string, RGB> | null>(null)
  const [samplingFileMessage, setSamplingFileMessage] = useState('')
  // The cube profile the current capture was taken with (its settings and
  // remembered colors drove detection) - or, for an uploaded fixture, the
  // one it recorded. Can differ from the dropdown if that's changed later.
  const [captureProfile, setCaptureProfile] = useState<{ id?: string; name: string } | null>(null)
  // Set after a capture whose colors clearly match another saved cube
  // better than the selected one: that cube, plus what's needed to move the
  // just-learned colors over to it (and give the selected cube its old ones
  // back) if the user switches.
  const [profileSuggestion, setProfileSuggestion] = useState<{
    suggested: CubeProfile
    previous: CubeProfile
    learned: Record<string, RGB>
    at: Date
  } | null>(null)
  const applyProfileStore = (updated: ProfileStore) => {
    if (!saveProfileStore(updated)) {
      setSamplingFileMessage('❌ Too many cube profiles to remember in this browser - delete one first')
      return
    }
    setProfileStore(updated)
  }
  const updateSampling = (next: SamplingGeometry) => applyProfileStore(saveProfile(profileStore, { ...profile, sampling: next }))
  // "New cube" form: brand and construction style, remembered while open.
  const [newCubeForm, setNewCubeForm] = useState<{ brand: string; style: CubeStyle } | null>(null)
  const handleCreateCube = () => {
    if (!newCubeForm) return
    // Its colors are its own - learned from its first capture.
    applyProfileStore(saveProfile(profileStore, brandProfile(profileStore, newCubeForm.brand, newCubeForm.style, puzzleSize)))
    setNewCubeForm(null)
    setSamplingSetupOpen(true)
  }
  // Settings file: all cube profiles, so a setup tuned in one browser or
  // on one machine can be carried to another.
  const handleDownloadSampling = () => {
    const blob = new Blob(
      [JSON.stringify({ type: PROFILES_FILE_TYPE, version: 2, ...profileStore }, null, 2)],
      { type: 'application/json' }
    )
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'cube-assembler-profiles.json'
    link.click()
    URL.revokeObjectURL(url)
    setSamplingFileMessage('✓ Cube profiles downloaded')
  }
  const handleUploadSampling = async (e: Event) => {
    const input = e.currentTarget as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    if (!file) return
    try {
      const data = JSON.parse(await file.text())
      // Files saved before cube profiles held per-size settings instead.
      const uploaded = data?.type === PROFILES_FILE_TYPE ? parseProfileStore(data)
        : data?.type === LEGACY_SAMPLING_FILE_TYPE ? parseProfileStore(data.samplingBySize)
        : null
      if (!uploaded || uploaded.profiles.length === 0) {
        setSamplingFileMessage(`❌ ${file.name} isn't a cube profiles file`)
        return
      }
      // Profiles with the same id are replaced, others kept.
      let merged = profileStore
      for (const p of uploaded.profiles) merged = saveProfile(merged, p)
      applyProfileStore({ ...merged, active: { ...merged.active, ...uploaded.active } })
      setSamplingFileMessage(`✓ Loaded ${uploaded.profiles.map((p) => p.name).join(', ')}`)
    } catch {
      setSamplingFileMessage(`❌ ${file.name} isn't valid JSON`)
    }
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
  // A face just captured, to fly from the scan square into its net slot
  // once the slot has rendered it (see CaptureNet / flyInto).
  const pendingFlyIn = useRef<{ slot: string; from: DOMRect } | null>(null)
  const sampleCanvasRef = useRef<HTMLCanvasElement | null>(null)

  const dismissTurnOverlay = () => {
    if (turnOverlayTimer.current !== null) clearTimeout(turnOverlayTimer.current)
    turnOverlayTimer.current = null
    setTurnOverlay(null)
  }

  useEffect(() => {
    if (!webcamOpen) dismissTurnOverlay()
    return () => {
      if (turnOverlayTimer.current !== null) clearTimeout(turnOverlayTimer.current)
    }
  }, [webcamOpen])

  // ─────────────────────────────────────────────────────────────────────────
  // Webcam Capture
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!webcamOpen || !webcamRef.current) return

    // The stream is kept here, not read back from the <video> on cleanup:
    // closing the dialog unmounts the video first, so it would find none
    // and leave the camera on. A stream arriving after the dialog already
    // closed is stopped right away.
    let stream: MediaStream | null = null
    let closed = false
    navigator.mediaDevices
      .getUserMedia({ video: CAMERA_CONSTRAINTS })
      .then((opened) => {
        if (closed) {
          opened.getTracks().forEach((t) => t.stop())
          return
        }
        stream = opened
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
      closed = true
      stream?.getTracks().forEach((t) => t.stop())
      if (webcamRef.current) webcamRef.current.srcObject = null
    }
  }, [webcamOpen])

  useEffect(() => {
    const fly = pendingFlyIn.current
    if (!fly || !capturedFaces[fly.slot]) return
    pendingFlyIn.current = null
    const target = document.querySelector<HTMLElement>(`.capture-net [data-slot="${fly.slot}"] .orientation-net-face`)
    if (target) flyInto(target, fly.from)
  }, [capturedFaces])

  // Live sticker-color preview: sample the video feed a few times a second
  // so the grid overlay shows detected colors before the user commits to a
  // capture, instead of only finding out the result afterward. Paused while
  // the turn cue covers the video - nobody can see the result then.
  const turnCueShowing = turnOverlay !== null
  useEffect(() => {
    if (!webcamOpen) {
      setLiveDetection(null)
      setLiveFaceVisible(false)
      return
    }
    if (turnCueShowing) return

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
        setLiveDetection(extractCubeFaceColors(canvas, puzzleSize, NEUTRAL_GAINS, sampling, palette))
        setLiveFaceVisible(hasVisibleCubeFace(canvas, puzzleSize))
      } catch {
        // Transient frame read failure (e.g. camera still warming up) — skip this tick.
      }
    }, 200)

    return () => clearInterval(intervalId)
  }, [webcamOpen, turnCueShowing, puzzleSize, sampling, palette])

  // Everything below belongs to one cube of one size, so switching sizes
  // starts over - keeping it drew e.g. a 5x5's 25 stickers per face into a
  // 6x6 net. Shared by the main size bar and the capture dialog.
  const changePuzzleSize = (size: number) => {
    if (size === puzzleSize) return
    setPuzzleSize(size)
    setCube(null)
    setScramble('')
    setAssemblyResults([])
    setParity(null)
    setHoveredHighlightGroup(null)
    setCapturedFaces({})
    setFaceConfidence({})
    setWebcamFace(FACE_ORDER[0])
    setLiveDetection(null)
    setShowReviewDialog(false)
    setReviewStep(0)
    setReviewEditingCell(null)
    setOrientationWizard(null)
    setOrientationApproval(null)
    setReviewNotice(null)
    setGlobalWhiteBalanceNote(null)
    setAppliedBackgroundGains(null)
    setLearnedPalette(null)
    setCaptureProfile(null)
    setProfileSuggestion(null)
    setCaptureMessage('')
    setFixtureSaveMessage('')
  }

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
    dismissTurnOverlay()
    const allCaptured = FACE_ORDER.every((f) => f in capturedFaces)
    if (allCaptured) {
      setCapturedFaces({})
      setFaceConfidence({})
    }
    const nextFace = allCaptured ? FACE_ORDER[0] : FACE_ORDER.find((f) => !(f in capturedFaces))!
    setWebcamFace(nextFace)
    setCaptureMessage('')
    if (allCaptured) setDismissedCaptureWarnings([])
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
    source: 'camera' | 'image-file',
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
        source,
        timestamp: Date.now(),
      },
    }

    setCapturedFaces(newCapturedFaces)
    setFaceConfidence({ ...faceConfidence, [face]: result.confidence })
    setCaptureMessage(`✓ ${FACE_DISPLAY_LABEL[face]} captured (${(result.confidence * 100).toFixed(0)}% confidence)`)

    const allFacesCaptured = FACE_ORDER.every(f => f in newCapturedFaces)
    if (allFacesCaptured) {
      await finalizeAllFacesCaptured(newCapturedFaces)
    } else {
      const nextFace = FACE_ORDER.find(f => !(f in newCapturedFaces))
      if (nextFace) {
        setWebcamFace(nextFace)
        setCaptureMessage('')
        dismissTurnOverlay()
        // The cue blocks capturing while the cube turns; without the turn it
        // would only be a wait, and the step hint already says what to do.
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
        const step = FACE_ORDER.indexOf(nextFace)
        setTurnOverlay({ step, startColors: result.colors, viaColors: step === 5 ? newCapturedFaces[FACE_ORDER[3]]?.colors : undefined })
        turnOverlayTimer.current = setTimeout(dismissTurnOverlay, TURN_CUE_FALLBACK_MS)
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

        // No per-face correction from the background around the cube any
        // more: rescaling each face to match face 1's background swapped
        // red and orange on real captures (12 stickers on a 4x4 whose
        // photos read perfectly without it, 2 on a 2x2), and every real
        // fixture reads as well or better without it. The background is
        // still recorded per face (FaceCaptureData.backgroundColor).
        setAppliedBackgroundGains(null)

        const wb = await runGlobalWhiteBalance(images, puzzleSize, undefined, sampling)
        setLearnedPalette(wb.learned?.colors ?? null)
        setCaptureProfile({ id: profile.id, name: profile.name })
        // Remember this cube's colors for its next capture - only from the
        // camera, since imported photos may be of another cube or light.
        if (wb.learned && FACE_ORDER.every((f) => newCapturedFaces[f].source === 'camera')) {
          const at = new Date()
          const suggested = suggestProfile(profileStore, profile, wb.learned.colors)
          setProfileSuggestion(suggested ? { suggested, previous: profile, learned: wb.learned.colors, at } : null)
          applyProfileStore(saveProfile(profileStore, withLearnedColors(profile, wb.learned.colors, at)))
        }
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
        colorsURFDLB?: string
        faces: Record<string, { photo: string } & Record<string, unknown>>
        capture?: {
          backgroundWhiteBalance?: Record<string, RGB>
          sampling?: SamplingGeometry
          profile?: { id?: string; name?: string } | null
          protocol?: string | null
        }
      }
      try {
        meta = JSON.parse(await metaFile.text())
      } catch {
        setCaptureMessage(`❌ ${metaFile.name} is not valid JSON.`)
        return
      }
      // Either fixture format (see readFixtureColors).
      const colorGrids = readFixtureColors(meta)?.colors ?? null
      if (!meta.faces || typeof meta.gridSize !== 'number' || !colorGrids) {
        setCaptureMessage(`❌ ${metaFile.name} doesn't look like a saved fixture (missing gridSize, faces or their colors).`)
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
          source: 'fixture',
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
      setProfileSuggestion(null)
      setUploadedProtocol(meta.capture?.protocol ?? null)
      const recordedProfile = meta.capture?.profile
      setCaptureProfile(recordedProfile?.name ? { id: recordedProfile.id, name: recordedProfile.name } : null)
      const images = Object.fromEntries(Object.entries(newEntries).map(([f, d]) => [f, d.croppedImage!]))
      // Recorded gains aren't replayed - see finalizeAllFacesCaptured.
      const wb = await runGlobalWhiteBalance(images, meta.gridSize, undefined, meta.capture?.sampling ?? DEFAULT_SAMPLING)
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
      setAppliedBackgroundGains(null)
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

  // After the per-face color review (so a misread sticker can't send a good
  // capture to the fallback): works out how the 6 photos fit together and
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
  const handleConfirmReview = () => {
    setReviewNotice(null)
    const faceData: Record<string, string[][]> = {}
    for (const f of FACE_ORDER) faceData[f] = capturedFaces[f].colors
    const free = solveFaceOrientations(faceData)
    const guided = isGuidedCapture()

    if (guided) {
      const [s1, s2, s3, s4, cap1, cap2] = FACE_ORDER.map((f) => faceData[f])
      const solution = solveGuidedCapture({ sides: [s1, s2, s3, s4], caps: [cap1, cap2] })
      if (solution?.fullyValid) {
        setOrientationApproval({ candidates: solution.alternatives, arrangements: solution.arrangements, valid: true, fallback: free })
        return
      }
      const issue = checkGuidedCenters(FACE_ORDER.map((f) => faceData[f]))[0]
      const why = issue
        ? describeCenterIssue(issue)
        : "These photos don't fit together the way they were taken - the cube may have been turned the other way partway through, or tipped over."
      if (free?.fullyValid) {
        setOrientationApproval({ candidates: free.alternatives, valid: true, note: `${why} They do fit together another way:`, fallback: null })
        return
      }
      const closest = solution ?? free
      if (closest) {
        setOrientationApproval({
          candidates: [closest.alternatives[0]],
          valid: false,
          note: `${why} No arrangement makes a valid cube, so a color was probably misread - check the colors, or use the closest match anyway.`,
          fallback: free,
        })
        return
      }
    }

    if (!free) {
      setReviewNotice("⚠️ Couldn't work out how the faces fit together (a duplicate or unreadable center?) - check the colors, or retake a face.")
      return
    }
    if (!free.fullyValid) {
      setOrientationApproval({
        candidates: [free.alternatives[0]],
        valid: false,
        note: 'No arrangement of these faces makes a valid cube, so a color was probably misread - check the colors, or use the closest match anyway.',
        fallback: free,
      })
      return
    }
    if (free.alternatives.length > 1) {
      setOrientationWizard({ remaining: free.alternatives, truncated: free.truncated, picked: [] })
      return
    }
    handleChooseOrientation(free.alternatives[0])
  }

  // Whether the current faces followed the guided protocol: a camera
  // capture, or an uploaded fixture that recorded it. Faces mixed with
  // imported photos may not have, so they use the any-order search.
  const isGuidedCapture = () =>
    FACE_ORDER.every((f) => capturedFaces[f]?.source === 'camera')
    || (FACE_ORDER.every((f) => capturedFaces[f]?.source === 'fixture') && uploadedProtocol === GUIDED_PROTOCOL)

  const predictedCenter = predictGuidedSideCenter(
    FACE_ORDER.map((f) => capturedFaces[f]?.colors),
    FACE_ORDER.indexOf(webcamFace)
  )

  // A likely capture mistake visible from odd-size centers while capturing
  // (see checkGuidedCenters) - only a hint, never blocking. Live colors are
  // first-pass readings that can confuse e.g. red and orange, so it only
  // speaks up when the centers involved were read with some confidence.
  // A whole face matching an earlier one (any size) comes first.
  const captureWarning = (() => {
    const photos = FACE_ORDER.map((f) => capturedFaces[f]?.colors)
    for (const [j, i] of findRepeatedFaces(photos)) {
      const key = `repeat:${j}:${i}`
      if (!dismissedCaptureWarnings.includes(key)) {
        return {
          text: `${CAPTURE_STEPS[i].label} looks the same as ${CAPTURE_STEPS[j].label} - the same face photographed twice?`,
          key,
          retake: i,
        }
      }
    }
    const mid = Math.floor(puzzleSize / 2)
    const sure = (i: number) => (capturedFaces[FACE_ORDER[i]]?.cellConfidences?.[mid]?.[mid] ?? 0) >= 0.6
    for (const issue of checkGuidedCenters(photos)) {
      const involved = issue.kind === 'turned-twice' ? [issue.photo - 1, issue.photo] : issue.photos
      const key = JSON.stringify(issue)
      if (involved.every(sure) && !dismissedCaptureWarnings.includes(key)) {
        return { text: describeCenterIssue(issue), key, retake: Math.max(...involved) }
      }
    }
    return null
  })()

  // "No, let me choose each side": the wizard, with every remaining
  // arrangement of the photos except the rejected ones.
  // The arrangements the wizard would offer after a "no" - empty means
  // there's nothing else to choose from, so the option isn't shown at all.
  const rejectAlternatives = (approval: NonNullable<typeof orientationApproval>): OrientedCandidate[] => {
    const rejected = new Set(approval.candidates.map((c) => orientationFreeSignature(c.faces)))
    return (approval.fallback?.alternatives ?? []).filter((c) => !rejected.has(orientationFreeSignature(c.faces)))
  }
  const handleRejectOrientation = () => {
    if (!orientationApproval) return
    const remaining = rejectAlternatives(orientationApproval)
    if (remaining.length === 0) return
    setOrientationApproval(null)
    if (remaining.length === 1 && pickWizardFace(remaining) === null) {
      handleChooseOrientation(remaining[0])
      return
    }
    setOrientationWizard({ remaining, truncated: orientationApproval.fallback!.truncated, picked: [] })
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
          source: face.source,
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
        // The commit is stamped by the server when it saves the fixture.
        app: { version: __APP_VERSION__ },
        userAgent: navigator.userAgent,
        devicePixelRatio: window.devicePixelRatio,
        photo: { format: 'image/jpeg', quality: CROP_JPEG_QUALITY },
        mirrored: mirrorPreview,
        // Only meaningful when at least one face was shot with it - not for
        // a re-saved uploaded fixture or imported image files.
        camera: FACE_ORDER.some((f) => capturedFaces[f].source === 'camera') ? cameraInfo : null,
        // The cube profile the capture was taken with - same condition as
        // camera, since a re-saved upload wasn't shot with the current one.
        profile: FACE_ORDER.some((f) => capturedFaces[f].source === 'camera') ? captureProfile : null,
        // How the photos were taken (see CAPTURE_STEPS) and the cube they
        // were approved as - the fixture test puts the photos together
        // again and checks it gets that cube.
        protocol: isGuidedCapture() ? GUIDED_PROTOCOL : null,
        // How the per-face `readings` were measured (see stickerColor).
        measurement: STICKER_MEASUREMENT,
        assembledURFDLB: cube ? toWRGFacelets(cube) : null,
        // No fixed-preset/gray-world software white-balance runs at capture
        // time any more (see the "Gains" comment in imageProcessing.ts), and
        // no per-face background gain either (backgroundWhiteBalance stays
        // null - see finalizeAllFacesCaptured; each face's background is
        // still recorded per face). What runs is the post-capture
        // recalibration (colorCalibration - learnStickerColors), which
        // learns the 6 colors from this capture's own stickers.
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
    if (!webcamRef.current || turnOverlay !== null) return
    const frame = document.querySelector('.capture-scan-frame')?.getBoundingClientRect()
    if (frame) pendingFlyIn.current = { slot: webcamFace, from: frame }

    try {
      setLoading(true)
      setCaptureMessage('Processing image...')
      const result = captureAndProcessFace(webcamRef.current, puzzleSize, NEUTRAL_GAINS, sampling, palette)
      const track = (webcamRef.current.srcObject as MediaStream | null)?.getVideoTracks()[0]
      await applyFaceCapture(webcamFace, result, 'camera', track ? withoutDeviceIds(track.getSettings()) : undefined)
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
        const result = captureAndProcessImage(img, puzzleSize, NEUTRAL_GAINS, sampling, palette)
        await applyFaceCapture(webcamFace, result, 'image-file')
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
      {/* Header: name, puzzle size and the cube profile in use */}
      <header class="app-header">
        <div class="header-content">
          <svg class="app-logo" width="32" height="32" viewBox="0 0 32 32" aria-hidden="true">
            <path d="M16 3 28 9.5v13L16 29 4 22.5v-13Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" />
            <path d="M4 9.5 16 16l12-6.5M16 16v13" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" />
            <path d="M16 3 28 9.5 16 16 4 9.5Z" fill="var(--color-accent)" />
          </svg>
          <div class="app-title">
            <h1>CubeAssembler</h1>
            <p>Photograph a cube, get its exact state</p>
          </div>
          <div class="header-spacer" />
          <div class="size-selector" role="group" aria-label="Puzzle size">
            {[2, 3, 4, 5, 6, 7].map((size) => (
              <button
                key={size}
                type="button"
                class={`size-btn ${puzzleSize === size ? 'active' : ''}`}
                aria-pressed={puzzleSize === size}
                onClick={() => changePuzzleSize(size)}
              >
                {size}×{size}
              </button>
            ))}
          </div>
          <select
            class="header-profile"
            aria-label="Cube profile"
            value={profile.id}
            onChange={(e) => applyProfileStore(selectProfile(profileStore, puzzleSize, e.currentTarget.value))}
          >
            {profilesForSize(profileStore, puzzleSize).map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
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
                  <span class={`verdict ${parity.valid ? 'is-valid' : 'is-invalid'}`}>
                    {parity.valid ? '✓ Valid cube — every check passed' : parity.result}
                    {!parity.valid && parity.detail && <span class="status-detail">: {parity.detail}</span>}
                  </span>
                )}
              </div>
              <div class="header-spacer" />
              {FACE_ORDER.every((f) => f in capturedFaces) && (
                <button
                  type="button"
                  class="btn btn-secondary btn-sm"
                  onClick={() => {
                    setReviewStep(0)
                    setShowReviewDialog(true)
                  }}
                >
                  Edit colors
                </button>
              )}
            </div>
            {cube ? (() => {
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
                  {totalHighlighted > 0 && (
                    <p class="net-highlight-note">
                      ⚠ {totalHighlighted} sticker{totalHighlighted === 1 ? '' : 's'} outlined below may be involved in the
                      problem above. Hover one to see which others share its color reading.
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
            })() : (
              <p class="empty-state">No cube yet — capture the faces, upload a fixture or type the colors.</p>
            )}
            {parity && (
              <div class="parity-checks">
                {Object.entries(parity.checks).map(([check, valid]: [string, any]) => (
                  <div class={`parity-check ${valid ? 'is-ok' : 'is-failed'}`} key={check}>
                    <span class="parity-check-name">{PARITY_CHECK_NAMES[check] ?? check}</span>
                    <span class="parity-check-result">{valid ? '✓ ok' : '✗ failed'}</span>
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
                <button type="button" class={notationFormat === 'wrg' ? 'active' : ''} aria-pressed={notationFormat === 'wrg'} onClick={() => setNotationFormat('wrg')}>
                  Colors (WRG)
                </button>
                <button type="button" class={notationFormat === 'urf' ? 'active' : ''} aria-pressed={notationFormat === 'urf'} onClick={() => setNotationFormat('urf')}>
                  Faces (URF)
                </button>
              </div>
              <div class="header-spacer" />
              {cube && (
                <button
                  type="button"
                  class="btn btn-secondary btn-sm"
                  onClick={handleSendFixtureToServer}
                  disabled={loading}
                  title="Save this capture's photos + reviewed colors on the server as a permanent regression test fixture"
                >
                  {loading ? '⏳ Saving...' : 'Save as test fixture'}
                </button>
              )}
              <button type="button" class="btn btn-primary btn-sm" onClick={() => cube && copyToClipboard(getNotationOutput())} disabled={!cube}>
                <span aria-live="polite">
                  {copyStatus === 'copied' ? '✓ Copied' : copyStatus === 'failed' ? 'Copy failed' : 'Copy'}
                </span>
              </button>
            </div>
            <textarea class="notation-output" readonly aria-label="Notation" value={cube ? getNotationOutput() : ''} />
            <p class="notation-hint">
              {notationFormat === 'wrg'
                ? `6 blocks of ${puzzleSize * puzzleSize} colors (W O G R B Y) in U R F D L B order.`
                : `6 blocks of ${puzzleSize * puzzleSize} face letters (U R F D L B) in U R F D L B order.`}
            </p>
            {fixtureSaveMessage && (
              <div role="status" class={`capture-message ${fixtureSaveMessage.includes('✓') ? 'success' : fixtureSaveMessage.includes('❌') ? 'error' : ''}`}>
                {fixtureSaveMessage}
              </div>
            )}
          </section>
        </div>

        <div class="side-column">
          {/* Getting a cube in: guided capture, fixture upload, typed colors */}
          <section class="card capture-card">
            <h2>Capture</h2>
            <button type="button" class="btn btn-primary btn-lg" onClick={handleOpenCapture}>
              <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
                <path d="M2.5 6.5A1.5 1.5 0 0 1 4 5h2.2l1.3-2h5l1.3 2H16a1.5 1.5 0 0 1 1.5 1.5V15A1.5 1.5 0 0 1 16 16.5H4A1.5 1.5 0 0 1 2.5 15Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" />
                <circle cx="10" cy="10.5" r="3" fill="none" stroke="currentColor" stroke-width="1.6" />
              </svg>
              {FACE_ORDER.every((f) => f in capturedFaces)
                ? 'Capture again'
                : FACE_ORDER.some((f) => f in capturedFaces)
                ? `Continue capturing (${FACE_ORDER.filter((f) => f in capturedFaces).length}/${FACE_ORDER.length})`
                : 'Capture faces'}
            </button>
            <p class="card-hint">Four sides while turning the cube, then top and bottom — about a minute.</p>
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
            {captureProfile && FACE_ORDER.every((f) => capturedFaces[f]?.croppedImage) && (
              <span class="capture-profile-used" title="Cube profile this capture was taken with">
                Cube: {captureProfile.name}
                {profileSuggestion && ` · looks like ${profileSuggestion.suggested.name}`}
              </span>
            )}
            <div class="card-divider" />
            <div class="capture-alternatives">
              <label
                class={`btn btn-secondary btn-sm ${loading ? 'btn-disabled' : ''}`}
                title="Select a fixture's meta.json together with its 6 face-*.jpg photos"
              >
                Upload fixture
                <input
                  type="file"
                  accept=".json,image/*"
                  multiple
                  hidden
                  disabled={loading}
                  onChange={handleUploadFixture}
                />
              </label>
              <button type="button" class="btn btn-secondary btn-sm" aria-expanded={showColorInput} onClick={() => setShowColorInput(!showColorInput)}>
                {showColorInput ? 'Close' : 'Type colors'}
              </button>
              <button type="button" class="btn btn-secondary btn-sm" onClick={handleApplySolved}>
                Solved cube
              </button>
            </div>
            <label
              class="checkbox-option"
              title="Review the fixture from what detection reads now, without the colors that were picked by hand when it was saved"
            >
              <input
                type="checkbox"
                checked={ignoreFixtureCorrections}
                onChange={(e) => setIgnoreFixtureCorrections(e.currentTarget.checked)}
              />
              Uploads ignore saved corrections
            </label>
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

          {/* Moves: an algorithm or a scramble applied to the current cube */}
          <section class="card moves-card">
            <div class="tabs" role="tablist" aria-label="Moves">
              <button type="button" role="tab" aria-selected={movesTab === 'algorithm'} class={movesTab === 'algorithm' ? 'active' : ''} onClick={() => setMovesTab('algorithm')}>
                Algorithm
              </button>
              <button type="button" role="tab" aria-selected={movesTab === 'scramble'} class={movesTab === 'scramble' ? 'active' : ''} onClick={() => setMovesTab('scramble')}>
                Scramble
              </button>
            </div>
            {movesTab === 'algorithm' ? (
              <div class="control-section" role="tabpanel">
                <label for="algorithm-input">Moves to apply</label>
                <input
                  id="algorithm-input"
                  type="text"
                  placeholder="R U R' U'  F' U F  ..."
                  value={algorithm}
                  onInput={(e) => setAlgorithm(e.currentTarget.value)}
                />
                <div class="algo-presets">
                  {Object.entries(presets).map(([name, algo]) => (
                    <button type="button" class="preset-btn" onClick={() => handlePresetAlgorithm(algo)} key={name}>
                      {name}
                    </button>
                  ))}
                </div>
                <div class="btn-row">
                  <button type="button" class="btn btn-dark" onClick={handleApplyAlgorithm} disabled={loading || !cube}>
                    {loading ? '⏳ Applying...' : 'Apply'}
                  </button>
                  <button type="button" class="btn btn-secondary" onClick={handleInvertAlgorithm} disabled={loading || !cube}>
                    {loading ? '⏳ Inverting...' : 'Apply inverse'}
                  </button>
                </div>
              </div>
            ) : (
              <div class="control-section" role="tabpanel">
                <div class="scramble-display">{scramble || 'Generate a WCA scramble for this size'}</div>
                <div class="btn-row">
                  <button type="button" class="btn btn-dark" onClick={handleGenerateScramble} disabled={loading}>
                    {loading ? '⏳ Generating...' : 'Generate'}
                  </button>
                  <button type="button" class="btn btn-secondary" onClick={handleApplyScramble} disabled={loading || !scramble || !cube}>
                    {loading ? '⏳ Applying...' : 'Apply scramble'}
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      </main>

      {/* Webcam Modal */}
      {webcamOpen && (
        <div class="modal open">
          <div
            class="modal-content capture-modal-content"
            role="dialog"
            aria-modal="true"
            aria-labelledby="capture-title"
            tabIndex={-1}
            ref={focusModalOnOpen}
            onKeyDown={(e) => handleModalKeyDown(e, e.currentTarget, () => setWebcamOpen(false))}
          >
            {/* Live view on the left, everything about the current step on the
                right - so on a laptop nothing needs a scroll. */}
            <div class="capture-live">
              <div class="capture-video-wrapper">
                <video
                  ref={webcamRef}
                  autoplay
                  muted
                  playsinline
                  class={`webcam-feed ${mirrorPreview ? 'mirrored' : ''}`}
                />
                {liveDetection && liveFaceVisible && (
                  // Positioned from stickerSampleRect in percent of the guide
                  // square, so the overlay shows exactly what the detector
                  // reads: thin cell lines, and each sampled zone outlined in the
                  // color it reads as.
                  <div
                    class={`capture-grid-overlay ${mirrorPreview ? 'mirrored' : ''}`}
                    style={liveDetection.gridOffset && {
                      '--grid-x': liveDetection.gridOffset.x,
                      '--grid-y': liveDetection.gridOffset.y,
                      '--grid-scale': liveDetection.gridOffset.scale,
                      '--grid-angle': liveDetection.gridOffset.angle,
                    }}
                  >
                    {liveDetection.colors.map((row, r) =>
                      row.map((color, c) => {
                        const n = liveDetection.colors.length
                        const outer = liveDetection.outerCellRatio ?? 1
                        const cell = stickerSampleRect(r, c, n, 100, 100, { ...sampling, stickerCore: 1 }, outer)
                        const zone = stickerSampleRect(r, c, n, 100, 100, sampling, outer)
                        return (
                          <Fragment key={`${r}-${c}`}>
                            <div
                              class="capture-grid-cell"
                              style={{ left: `${cell.x}%`, top: `${cell.y}%`, width: `${cell.width}%`, height: `${cell.height}%` }}
                            />
                            <div
                              class="capture-sample-zone"
                              style={{
                                left: `${zone.x}%`, top: `${zone.y}%`, width: `${zone.width}%`, height: `${zone.height}%`,
                                borderColor: STICKER_HEX[color] ?? '#888',
                              }}
                            />
                          </Fragment>
                        )
                      })
                    )}
                  </div>
                )}
                {(samplingSetupOpen || sampling.backgroundGap > 0) && (
                  // The band around the guide square that the background (white
                  // balance) sample skips - sized in percent of the wrapper,
                  // like the 60% guide square itself. Always shown when set, so
                  // fingers can be kept inside it while capturing.
                  <div
                    class="capture-background-gap"
                    style={{
                      width: `${60 * (1 + 2 * sampling.backgroundGap)}%`,
                      padding: `${60 * sampling.backgroundGap}%`,
                    }}
                  />
                )}
                {/* Always-visible guide framing exactly what region gets
                    analyzed, on top of the grid so its border/dimming stays
                    visible even once per-cell colors are drawn underneath. */}
                <div class="capture-scan-frame">
                  <span class="capture-scan-label">Fit face in this square</span>
                </div>
                {turnOverlay && (
                  <CaptureTurnOverlay step={turnOverlay.step} startColors={turnOverlay.startColors} viaColors={turnOverlay.viaColors} onContinue={dismissTurnOverlay} />
                )}
              </div>
              <span class="capture-live-badge" aria-hidden="true">
                <span class="capture-live-dot" />
                Live · {liveDetection ? (liveFaceVisible ? `${(liveDetection.confidence * 100).toFixed(0)}% color match` : 'Align face in guide') : '—'}
              </span>
            </div>
            <div class="capture-side">
              <div class="capture-side-header">
                <div class="capture-side-title">
                  <span class="capture-step-kicker">Step {FACE_ORDER.indexOf(webcamFace) + 1} of {FACE_ORDER.length}</span>
                  <h2 id="capture-title">{FACE_DISPLAY_LABEL[webcamFace]}{FACE_ORDER.indexOf(webcamFace) < 4 ? ' of 4' : ''}</h2>
                </div>
                <button class="modal-close" aria-label="Close" onClick={() => setWebcamOpen(false)}>×</button>
              </div>
              <p class="capture-hint-text" aria-live="polite">
                <TurnHint step={FACE_ORDER.indexOf(webcamFace)} />
                {stepOf(webcamFace).instruction}
                {predictedCenter && (
                  <span class="capture-expected-center">
                    Suggested center: <span class="capture-expected-swatch" style={{ background: STICKER_HEX[predictedCenter] }} />
                    <strong>{COLOR_NAME[predictedCenter]}</strong>
                  </span>
                )}
              </p>
              <div class="capture-progress">
                <span class="capture-progress-label">Captured so far · tap one to retake</span>
                <CaptureNet
                  faces={Object.fromEntries(FACE_ORDER.map((f) => [f, capturedFaces[f]?.colors]))}
                  current={webcamFace}
                  size={puzzleSize}
                  predictedCenter={predictedCenter}
                  onSelect={(slot) => {
                    dismissTurnOverlay()
                    setWebcamFace(slot)
                    setCaptureMessage('')
                  }}
                />
              </div>
              {/* macOS reports its Portrait video effect as backgroundBlur, and
                  the browser can't turn it off - it blurs whatever it takes for
                  background, which can include the cube held up to the camera. */}
              {cameraInfo?.granted.backgroundBlur === true && (
                <p class="capture-warning" role="note">
                  ⚠ Your camera's background blur (Portrait) is on and can blur the cube. Turn it off in Control
                  Center → Video Effects.
                </p>
              )}
              {captureWarning && (
                <div class="capture-warning capture-soft-warning" role="status">
                  <span>⚠ {captureWarning.text}</span>
                  <button
                    type="button"
                    class="btn btn-secondary btn-sm"
                    onClick={() => {
                      setWebcamFace(FACE_ORDER[captureWarning.retake])
                      setCaptureMessage('')
                    }}
                  >
                    Retake {CAPTURE_STEPS[captureWarning.retake].label}
                  </button>
                  <button
                    type="button"
                    class="link-button"
                    onClick={() => setDismissedCaptureWarnings((keys) => [...keys, captureWarning.key])}
                  >
                    Ignore
                  </button>
                </div>
              )}
              {/* Cube size, profile and camera options: folded into one summary
                  line once capturing is under way (and from the start on narrow
                  screens), so the live view and Capture button stay in reach. */}
              <details
                class="capture-settings"
                open={FACE_ORDER.every((f) => !capturedFaces[f]) && !window.matchMedia('(max-width: 600px)').matches}
              >
                <summary>
                  Cube & camera settings
                  <span class="capture-settings-summary">
                    {' '}{puzzleSize}×{puzzleSize} · {profile.name}{mirrorPreview ? ' · mirrored' : ''}
                  </span>
                </summary>
                <div class="capture-size-row">
                  <span class="capture-size-label">Cube size:</span>
                  <div class="capture-size-buttons">
                    {[2, 3, 4, 5, 6, 7].map((size) => (
                      <button
                        key={size}
                        class={`wb-btn ${puzzleSize === size ? 'active' : ''}`}
                        onClick={() => changePuzzleSize(size)}
                      >
                        {size}×{size}
                      </button>
                    ))}
                  </div>
                </div>
                <div class="capture-size-row">
                  <label class="capture-size-label" for="cube-profile">Cube:</label>
                  <select
                    id="cube-profile"
                    class="cube-profile-select"
                    value={profile.id}
                    onChange={(e) => applyProfileStore(selectProfile(profileStore, puzzleSize, e.currentTarget.value))}
                  >
                    {profilesForSize(profileStore, puzzleSize).map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    class="btn btn-secondary btn-sm"
                    aria-expanded={newCubeForm !== null}
                    onClick={() => setNewCubeForm(newCubeForm ? null : { brand: CUBE_BRANDS[0], style: 'stickerless' })}
                  >
                    ＋ New cube
                  </button>
                </div>
                {newCubeForm && (
                  <div class="capture-size-row new-cube-form">
                    <label class="capture-size-label" for="new-cube-brand">Brand:</label>
                    <select
                      id="new-cube-brand"
                      class="cube-profile-select"
                      value={newCubeForm.brand}
                      onChange={(e) => setNewCubeForm({ ...newCubeForm, brand: e.currentTarget.value })}
                    >
                      {CUBE_BRANDS.map((brand) => <option key={brand} value={brand}>{brand}</option>)}
                    </select>
                    <select
                      aria-label="Style"
                      class="cube-profile-select"
                      value={newCubeForm.style}
                      onChange={(e) => setNewCubeForm({ ...newCubeForm, style: e.currentTarget.value as CubeStyle })}
                    >
                      {Object.entries(CUBE_STYLES).map(([style, { label }]) => <option key={style} value={style}>{label}</option>)}
                    </select>
                    <button type="button" class="btn btn-primary btn-sm" onClick={handleCreateCube}>
                      Add {newCubeForm.brand} {puzzleSize}×{puzzleSize}
                    </button>
                  </div>
                )}
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
                <label class="capture-import">
                  Or use a photo file for this step
                  <input type="file" accept="image/*" onChange={handleImportImage} disabled={loading || turnOverlay !== null} />
                </label>
              </details>
              {/* Below the live view, so adjusting it never pushes the video off
                  screen (Chrome pauses muted videos that aren't visible). */}
              {samplingSetupOpen && (
                <div class="sampling-setup">
                  <label class="sampling-slider">
                    <span>Cube name</span>
                    <input
                      type="text"
                      class="cube-profile-name"
                      maxLength={60}
                      value={profile.name}
                      onChange={(e) => {
                        const name = e.currentTarget.value.trim()
                        if (name) applyProfileStore(saveProfile(profileStore, { ...profile, name }))
                      }}
                    />
                  </label>
                  <label class="sampling-slider">
                    <span>
                      Skip around the face <output>{Math.round(sampling.backgroundGap * 100)}%</output>
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={MAX_BACKGROUND_GAP * 100}
                      step={1}
                      value={Math.round(sampling.backgroundGap * 100)}
                      onInput={(e) => updateSampling({ ...sampling, backgroundGap: Number(e.currentTarget.value) / 100 })}
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
                    {profile.learnedAt ? (
                      <>
                        Colors learned from this cube's capture on {new Date(profile.learnedAt).toLocaleString()}.{' '}
                        <button
                          type="button"
                          class="link-button"
                          onClick={() => applyProfileStore(saveProfile(profileStore, withoutLearnedColors(profile)))}
                        >
                          Forget them
                        </button>
                      </>
                    ) : (
                      "This cube's colors will be learned from its first capture."
                    )}
                  </p>
                  <p class="sampling-setup-hint">
                    Hold a face in the square. Each small box should sit fully inside its sticker, and its outline
                    should show that sticker's color. The striped band around the square is left out when
                    balancing colors - widen it until it covers your fingers and the edge of the cube.
                  </p>
                  <div class="sampling-setup-actions">
                    <button type="button" class="btn btn-secondary btn-sm" onClick={handleDownloadSampling}>
                      ↓ Download
                    </button>
                    <label class="btn btn-secondary btn-sm" title="Load a settings file downloaded earlier">
                      ↑ Upload
                      <input type="file" accept=".json,application/json" hidden onChange={handleUploadSampling} />
                    </label>
                    <div class="sampling-setup-actions-spacer" />
                    {profileStore.profiles.some((p) => p.id === profile.id) && (
                      <button
                        type="button"
                        class="btn btn-secondary btn-sm"
                        title="Forget this cube's settings"
                        onClick={() => applyProfileStore(deleteProfile(profileStore, profile.id))}
                      >
                        Delete cube
                      </button>
                    )}
                    <button type="button" class="btn btn-secondary btn-sm" onClick={() => updateSampling(DEFAULT_SAMPLING)}>
                      Reset
                    </button>
                    <button type="button" class="btn btn-primary btn-sm" onClick={() => setSamplingSetupOpen(false)}>
                      Done
                    </button>
                  </div>
                  {samplingFileMessage && (
                    <p role="status" class="sampling-setup-hint">{samplingFileMessage}</p>
                  )}
                </div>
              )}
              <div class="capture-actions">
                <div
                  role="status"
                  class={`capture-message ${captureMessage ? (captureMessage.includes('✓') ? 'success' : captureMessage.includes('❌') ? 'error' : '') : 'is-empty'}`}
                >
                  {captureMessage || '—'}
                </div>
                <button
                  class="btn btn-primary"
                  onClick={handleCapturePhoto}
                  disabled={loading || turnOverlay !== null}
                >
                  {loading ? '⏳ Processing...' : `Capture ${FACE_DISPLAY_LABEL[webcamFace].toLowerCase()}`}
                </button>
              </div>
            </div>
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
              aria-labelledby="review-title"
              tabIndex={-1}
              ref={focusModalOnOpen}
              onKeyDown={(e) => handleModalKeyDown(e, e.currentTarget, () => setShowReviewDialog(false))}
            >
              <div class="review-header">
                <div class="capture-side-title">
                  <span class="capture-step-kicker">Check colors · {reviewStep + 1} of {FACE_ORDER.length}</span>
                  <h2 id="review-title">{FACE_DISPLAY_LABEL[face]}</h2>
                </div>
                <div class="review-progress-dots" role="group" aria-label="Faces">
                  {FACE_ORDER.map((f, i) => (
                    <button
                      type="button"
                      key={f}
                      class={`progress-dot ${i < reviewStep ? 'done' : ''} ${i === reviewStep ? 'current' : ''}`}
                      aria-current={i === reviewStep ? 'step' : undefined}
                      aria-label={FACE_DISPLAY_LABEL[f]}
                      onClick={() => setReviewStep(i)}
                    >
                      {FACE_SHORT_LABEL[f]}
                    </button>
                  ))}
                </div>
                <button class="modal-close" aria-label="Close" onClick={() => setShowReviewDialog(false)}>×</button>
              </div>
              {captureProfile && (
                <p class="capture-profile-used review-profile-used">
                  Cube: <strong>{captureProfile.name}</strong>
                  {profileSuggestion && <> · looks like <strong>{profileSuggestion.suggested.name}</strong></>}
                </p>
              )}
              {globalWhiteBalanceNote && (
                <div class="global-wb-note">✓ {globalWhiteBalanceNote}</div>
              )}
              {reviewNotice && <div class="capture-warning" role="alert">{reviewNotice}</div>}
              {(() => {
                // Detection always assigns every color exactly N² stickers, so
                // an imbalance here means a sticker was set to the wrong color
                // by hand - worth fixing before assembling.
                const counts: Record<string, number> = {}
                for (const f of FACE_ORDER) for (const row of capturedFaces[f]?.colors ?? []) for (const c of row) counts[c] = (counts[c] ?? 0) + 1
                const expected = puzzleSize * puzzleSize
                const off = COLOR_ORDER.filter((c) => (counts[c] ?? 0) !== expected)
                if (off.length === 0 || !FACE_ORDER.every((f) => capturedFaces[f])) return null
                return (
                  <div class="capture-warning" role="status">
                    ⚠ {off.map((c) => `${COLOR_NAME[c]} ${counts[c] ?? 0}`).join(', ')} - each color should appear{' '}
                    {expected} times. A sticker was probably set to the wrong color.
                  </div>
                )
              })()}
              {profileSuggestion && (
                <div class="profile-suggestion" role="status">
                  <span>
                    These colors look more like your <strong>{profileSuggestion.suggested.name}</strong> than{' '}
                    <strong>{profileSuggestion.previous.name}</strong>.
                  </span>
                  <button
                    type="button"
                    class="btn btn-secondary btn-sm"
                    onClick={() => {
                      const { suggested, previous, learned, at } = profileSuggestion
                      const restored = saveProfile(profileStore, previous)
                      applyProfileStore(saveProfile(restored, withLearnedColors(suggested, learned, at)))
                      setCaptureProfile({ id: suggested.id, name: suggested.name })
                      setProfileSuggestion(null)
                    }}
                  >
                    Switch to {profileSuggestion.suggested.name}
                  </button>
                  <button type="button" class="btn btn-secondary btn-sm" onClick={() => setProfileSuggestion(null)}>
                    Keep
                  </button>
                </div>
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
                            alt={`Captured photo of ${FACE_DISPLAY_LABEL[face]}`}
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
                                  <span class="review-detected-cell-flag" aria-hidden="true">!</span>
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
                    <button class="btn btn-secondary" onClick={() => handleRetakeFace(face)}>
                      Retake {FACE_DISPLAY_LABEL[face].toLowerCase()}
                    </button>
                    <div class="review-wizard-nav-spacer" />
                    <button
                      class="btn btn-secondary"
                      onClick={() => setReviewStep((s) => Math.max(0, s - 1))}
                      disabled={reviewStep === 0}
                    >
                      Previous
                    </button>
                    {isLast ? (
                      <button class="btn btn-primary btn-review-next" onClick={handleConfirmReview}>
                        Looks right — put the cube together
                      </button>
                    ) : (
                      <button class="btn btn-primary btn-review-next" onClick={() => setReviewStep((s) => s + 1)}>
                        Looks right — next side
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
      {/* Approval of how the captured faces fit together (see
          handleConfirmReview): one arrangement to confirm, a few to pick
          from, or a closest match that isn't a valid cube. */}
      {orientationApproval && !orientationWizard && (() => {
        const { candidates, arrangements, valid, note } = orientationApproval
        const close = () => setOrientationApproval(null)
        const single = candidates.length === 1
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
                  {!valid ? 'These faces don\'t make a valid cube' : single ? 'Does this match your cube?' : 'Which of these is your cube?'}
                </h2>
                <button class="modal-close" aria-label="Close" onClick={close}>×</button>
              </div>
              {note && <p class={valid ? 'orientation-approval-note' : 'capture-warning'}>{note}</p>}
              {!note && single && valid && (
                <p class="orientation-approval-note">
                  The photos fit together one way.
                  {puzzleSize % 2 === 1 && ' Hold your cube with white on top and green in front to compare.'}
                </p>
              )}
              {!single && valid && (
                <p class="orientation-approval-note">
                  The photos fit your cube in {candidates.length} different ways - pick the one that matches it.
                </p>
              )}
              {single ? (
                <div class="approval-single">
                  <div class="approval-net">
                    <OrientationNetPreview faces={candidates[0].faces} />
                  </div>
                  {arrangements?.[0] && (
                    <div class="approval-changes">
                      <span class="approval-changes-title">How the photos were put together</span>
                      <ul class="approval-checklist">
                        {describeArrangement(arrangements[0]).map((line) => (
                          <li key={line}>
                            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                              <circle cx="9" cy="9" r="8" fill="var(--color-accent-soft)" />
                              <path d="m5.5 9.2 2.3 2.3 4.7-4.8" fill="none" stroke="var(--color-accent)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
                            </svg>
                            {line}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : (
              <div class="orientation-approval-options">
                {candidates.map((candidate, i) => (
                  <div key={i} class="orientation-approval-option">
                    <OrientationNetPreview faces={candidate.faces} />
                    {arrangements?.[i] && (
                      <ul class="orientation-approval-changes">
                        {describeArrangement(arrangements[i]).map((line) => <li key={line}>{line}</li>)}
                      </ul>
                    )}
                    <button type="button" class="btn btn-primary btn-sm" onClick={() => handleChooseOrientation(candidate)}>
                      {valid ? 'This one' : 'Use it anyway'}
                    </button>
                  </div>
                ))}
              </div>
              )}
              <div class="orientation-approval-actions">
                <button type="button" class="btn btn-secondary" onClick={close}>
                  Back to the colors
                </button>
                <div class="header-spacer" />
                {rejectAlternatives(orientationApproval).length > 0 && (
                  <button type="button" class="btn btn-secondary" onClick={handleRejectOrientation}>
                    {single ? 'No, let me choose each side' : 'None of these - let me choose each side'}
                  </button>
                )}
                {single && (
                  <button type="button" class="btn btn-primary btn-review-next" onClick={() => handleChooseOrientation(candidates[0])}>
                    {valid ? 'Yes, this is my cube' : 'Use it anyway'}
                  </button>
                )}
              </div>
            </div>
          </div>
        )
      })()}

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
              const scores = rgb ? colorConfidences(rgb, learnedPalette ?? palette ?? STICKER_COLORS) : null
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

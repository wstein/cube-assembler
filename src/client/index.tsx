import { render, h, Fragment } from 'preact'
import { useState, useEffect, useRef, useMemo } from 'preact/hooks'
import '../../web/style.css'
import { AUTO_CAPTURE_MIN_CONFIDENCE, AUTO_CAPTURE_STABLE_FRAMES, TURN_CUE_CLEAR_FRAMES, agreedSize, nextAutoCaptureProgress, nextSizeVotes, nextTurnCueClearFrames, sizeDetectionActive, turnPoseChanged, type AutoCaptureProgress, type TurnCuePose } from './autoCapture'
import { oppositeFacePreview } from './capturePresentation'
import type { ReviewCapture } from './colorReviewPage'
import { ProfilesPage } from './profilesPage'
import { profilesHash, profilesTab } from './profilesRoute'
import { holdConfirmedFace, NO_HOLD, type LiveHold } from './liveHold'
import { scaleBounds, type LiveAnalysisRequest } from './liveAnalysis'
import type { LiveFrameMessage, LiveResultMessage } from './liveAnalysis.worker'
import { runFullParity, type ParityResult } from './parity'
import { WIZARD_FACE_ORDER, faceContentKey, groupWizardOptions, pickWizardFace, preferredGuidedArrangementIndex } from './orientationWizard'
import {
  faceBoundsForMode, captureAndProcessCanvas, captureAndProcessImage, extractBackgroundColor, hasVisibleCubeFace,
  runGlobalWhiteBalance, classifyAcrossFaces, computeBackgroundGains, BACKGROUND_WB_METHOD, BACKGROUND_CUBE_GAP, NEUTRAL_GAINS, CROP_JPEG_QUALITY,
  DEFAULT_SAMPLING, STICKER_MEASUREMENT, stickerSampleRect, colorConfidences, STICKER_COLORS, type SamplingGeometry,
  rgbToOKLCH, hueCircularRange, hueRangesOverlap, linearRange,
  type ColorDetectionResult, type FaceCaptureResult, type RGB,
} from './imageProcessing'
import {
  assembleCubeFromFaces, validateFaceColors, createSolvedCube, toCubeIR, solveFaceOrientations, solveGuidedCapture,
  checkGuidedCenters, findRepeatedFaces, findCapturedFaceMatch, findCaptureSlotForOrientedFace, orientationFreeSignature, captureCenterSlots, placeCapturedFace,
  type OrientedCandidate, type OrientationSolution, type FaceKey, type GuidedArrangement, type GuidedCenterIssue,
} from './cubeAssembly'
import {
  AUTO_COLORS_ID, GENERIC_COLORS_ID, activeCube, allCubes, activeColorProfile, allColorProfiles, captureColorProfileSnapshot, capturePalette, copyColorProfile, copyCubeSetting,
  convertLegacySettings, cubeGroupName, deleteCube, deleteColorProfile, genericColorProfile, groupCubesByName, isBuiltinCube, mergeSettings, saveCube, saveColorProfile,
  resolvedColorProfileSnapshot, selectCube, selectColorProfile, setAutoColorMatch, type ProfileSettings, type UsedColorProfile,
} from './profileSettings'
import { loadProfileSettings, saveProfileSettings, settingsFile, parseSettingsFile } from './profileStorage'
import { assessPalette, blendColorProfile, canCreateProfileFromCapture, matchColorProfile, matchPartialColorProfile, profileColorFitPercent, shouldBlendColorProfile, updateProfileFromCapture, type PaletteEvidence } from './colorProfileLearning'
import { readFixtureColors } from './fixtureFormat'
import { buildFixture, summarizeFixture, unzipFixture, zipFixture, type Fixture, type FixtureSummary } from './fixtureZip'
import { fixtureUploadServerAvailable, uploadFixtureToDevServer } from './fixtureUpload'
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
  // the backdrop read back unreliably dark). Used to derive a per-face
  // cross-face correction gain once all 6 faces are in; see
  // computeBackgroundGains.
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
  outOfOrder?: boolean
  timestamp: number
}

type CaptureMode = 'cv' | 'guide'

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

// v3 cube geometry and colors are stored separately; the old cookie is
// only a migration source and stays untouched for older app versions.
const LEGACY_PROFILES_COOKIE = 'cube-assembler-profiles'
// Per-size sampling settings from before cube profiles existed - migrated
// into generic profiles the same way.
const LEGACY_SAMPLING_COOKIE = 'cube-assembler-sampling'

function readCookie(name: string): unknown {
  try {
    const cookie = document.cookie.split('; ').find((c) => c.startsWith(`${name}=`))
    return cookie ? JSON.parse(decodeURIComponent(cookie.slice(name.length + 1))) : null
  } catch {
    return null // corrupt cookie - treated as absent
  }
}

function loadProfileStore(): ProfileSettings {
  const legacy = readCookie(LEGACY_PROFILES_COOKIE) ?? readCookie(LEGACY_SAMPLING_COOKIE)
  try { return loadProfileSettings(localStorage, legacy) }
  catch { return convertLegacySettings(legacy) }
}

// False when the browser won't store it (storage blocked or full).
function saveProfileStore(store: ProfileSettings): boolean {
  try { return saveProfileSettings(localStorage, store) }
  catch { return false }
}

// The cube list's first entry: the size is detected from the first face.
const AUTO_SIZE_OPTION = 'auto-size'

function CubeSelectOptions({ settings, detectedSize }: { settings: ProfileSettings; detectedSize: number | null }) {
  return <>
    <option value={AUTO_SIZE_OPTION}>{detectedSize ? `Auto · ${detectedSize}×${detectedSize}` : 'Auto'}</option>
    {groupCubesByName(settings).map((group) => (
      <optgroup label={group.name} key={group.name}>
        {group.cubes.map((cube) => (
          <option key={cube.id} value={cube.id}>{cube.size}×{cube.size}</option>
        ))}
      </optgroup>
    ))}
  </>
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
// The live preview analyzes frames scaled down to this height: detection
// found the same faces on 720p copies of 1080p frames at well under half
// the cost (see liveAnalysis.test.ts); captures still read full resolution.
const LIVE_ANALYSIS_HEIGHT = 720

function withoutDeviceIds<T extends { deviceId?: unknown; groupId?: unknown }>(info: T): Omit<T, 'deviceId' | 'groupId'> {
  const { deviceId: _deviceId, groupId: _groupId, ...rest } = info
  return rest
}

// ─────────────────────────────────────────────────────────────────────────────
// Parity Check
// ─────────────────────────────────────────────────────────────────────────────

function checkParity(cube: any, size: number): ParityResult {
  return runFullParity(toCubeIR(cube, size))
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

function captureInstruction(step: number, mirrored: boolean): string {
  if (!mirrored || step === 0) return CAPTURE_STEPS[step].instruction
  if (step === 4) return 'Tip the cube towards you so its top faces the camera. The mirrored view shows the bottom face.'
  if (step === 5) return 'Bring Side 4 back to the camera, then continue tipping to the opposite face. The mirrored view shows the top face.'
  if (step === 1) return 'Keep the same row on top and turn the whole cube counterclockwise in the mirrored view. Either direction works.'
  if (step === 2) return 'Keep turning counterclockwise in the mirrored view. Other directions still work.'
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
    case 'same-center': return `${label(issue.photos[0])} and ${label(issue.photos[1])} show the same center - the same face photographed twice?`
    case 'turned-twice': return `${label(issue.photo)} shows the face opposite ${label(issue.photo - 1)} - the cube was probably turned twice.`
    case 'not-opposite': return `${label(issue.photos[0])} and ${label(issue.photos[1])} should be opposite faces, but aren't.`
  }
}

// How a top/bottom photo was held, from the quarter turns needed to undo it.
const HELD_WORDS = ['', 'sideways', 'upside down', 'sideways']

// What the search changed to make the photos fit, in words.
function describeArrangement(a: GuidedArrangement, mirrored = false): string[] {
  const [topFix, bottomFix] = a.capsSwapped ? [a.capRotations[1], a.capRotations[0]] : a.capRotations
  const seenTurn = mirrored ? (a.turn === 'left' ? 'right' : 'left') : a.turn
  return [
    `You turned the cube to the ${seenTurn} between sides${mirrored ? ' in the mirrored view' : ''}.`,
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
// (5) above and Bottom (6) below Side 2 (which way the cube was turned, and which
// of the two is really the top, is only worked out once all 6 are in).
// Each slot shows the colors detected for it, or a placeholder; tapping a
// slot retakes it or jumps to it.
function CaptureNet({ faces, current, matchingFaces, liveMatchingFace, size, predictedCenters, mirrored, onSelect }: {
  faces: Record<string, string[][] | undefined>
  current: string
  matchingFaces: Set<string>
  liveMatchingFace: string | null
  size: number
  predictedCenters: Array<string | null>
  mirrored: boolean
  onSelect: (slot: string) => void
}) {
  const empty = Array.from({ length: size }, () => Array<string>(size).fill(''))
  const slot = (key: string, gridArea: string) => {
    const colors = faces[key]
    const suggested = !colors ? predictedCenters[FACE_ORDER.indexOf(key)] : null
    const preview = suggested ? empty.map((row) => row.slice()) : empty
    if (suggested) preview[Math.floor(size / 2)][Math.floor(size / 2)] = suggested
    const shown = colors ?? preview
    return (
      <button
        type="button"
        key={key}
        class={`capture-net-slot${matchingFaces.has(key) ? ' pattern-match' : ''}`}
        style={{ gridArea }}
        data-slot={key}
        aria-label={`${FACE_DISPLAY_LABEL[key]}: ${colors ? matchingFaces.has(key) ? `captured, pattern looks like ${key === liveMatchingFace ? 'the live face' : 'another captured face'}; tap to retake` : 'captured, tap to retake' : suggested ? `suggested ${COLOR_NAME[suggested]} center, not captured yet` : 'not captured yet'}`}
        aria-current={key === current ? 'step' : undefined}
        onClick={() => onSelect(key)}
      >
        <FaceGrid colors={shown} undecided={shown.flat().some((color) => !color)} current={key === current} />
        <span class="capture-net-label" aria-hidden="true">{FACE_SHORT_LABEL[key]}</span>
      </button>
    )
  }
  const [s1, s2, s3, s4, top, bottom] = FACE_ORDER
  return (
    <div class={`capture-net ${mirrored ? 'mirrored' : ''}`} role="group" aria-label="Captured faces">
      {slot(s1, '2 / 1')}
      {slot(s2, '2 / 2')}
      {slot(s3, '2 / 3')}
      {slot(s4, '2 / 4')}
      {slot(top, '1 / 2')}
      {slot(bottom, '3 / 2')}
    </div>
  )
}

// Small drawing next to a capture step's instruction. The arrow is painted
// on the front face in the same direction as the larger capture cue.
function TurnHint({ step, mirrored }: { step: number; mirrored: boolean }) {
  if (step === 0) return null
  const kind = step < 4 ? 'turn' : step === 4 ? 'tip-top' : 'tip-bottom'
  const arrowAngle = kind === 'turn' ? 270 : kind === 'tip-top' ? mirrored ? 0 : 180 : mirrored ? 180 : 0
  return (
    <svg class={`turn-hint ${mirrored ? 'mirrored' : ''}`} viewBox="0 0 64 64" aria-hidden="true">
      <polygon points="16,24 42,24 52,14 26,14" class="turn-hint-face turn-hint-top" />
      <polygon points="42,24 52,14 52,40 42,50" class="turn-hint-face turn-hint-side" />
      <rect x="16" y="24" width="26" height="26" class="turn-hint-face" />
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

// A visual cue between successful captures. The turn shown is only an
// example: the guided solver determines the real face orientation afterward.
function CaptureTurnOverlay({ step, startColors, viaColors, capturedColors, mirrored, onContinue }: { step: number; startColors: string[][]; viaColors?: string[][]; capturedColors: Array<string[][] | undefined>; mirrored: boolean; onContinue: () => void }) {
  const kind = step < 4 ? 'side' : step === 4 ? 'top' : 'bottom'
  const title = kind === 'side' ? 'Turn to another side' : kind === 'top' ? 'Show a remaining face' : 'Show the last face'
  const detail = kind === 'side'
    ? mirrored ? 'Counterclockwise in the mirrored view is suggested; either direction works.' : 'Clockwise is suggested; either direction works.'
    : kind === 'top'
      ? mirrored ? 'Tip to the top; the mirror shows the bottom.' : 'Tip the cube up or down.'
      : mirrored ? 'Move through Side 4; the mirror shows the top.' : 'Move through Side 4 to the opposite face.'
  const nextFace = kind === 'side' ? 'right' : kind === 'top' ? mirrored ? 'down' : 'up' : 'back'
  const viaFace = mirrored ? 'up' : 'down'
  const size = startColors.length
  const startStickers = (mirrored ? oppositeFacePreview(startColors, capturedColors) : startColors).flat()
  const viaStickers = viaColors && (mirrored ? oppositeFacePreview(viaColors, capturedColors) : viaColors).flat()
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
            class={`capture-turn-sticker${name === nextFace || name === 'front' && !startStickers[i] ? ' capture-turn-sticker-next' : ''}`}
            style={name === 'front'
              ? startStickers[i] ? { backgroundColor: STICKER_HEX[startStickers[i]] ?? '#888' } : undefined
              : kind === 'bottom' && name === viaFace && viaStickers && viaStickers[i]
                ? { backgroundColor: STICKER_HEX[viaStickers[i]] ?? '#888' }
                : undefined}
          />
        ))}
      </div>
      {(name === 'front' || name === nextFace || (kind === 'bottom' && name === viaFace)) && directionArrow()}
    </div>
  )
  return (
    <div class={`capture-turn-overlay capture-turn-${kind} ${mirrored ? 'mirrored' : ''}`} role="status" aria-label={`${title}. ${detail}`}>
      <div class={`capture-turn-scene ${mirrored ? 'mirrored' : ''}`} aria-hidden="true">
        <div class="capture-turn-cube">
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
  faces, undecidedFaces, currentFace, autoFaces, onFaceClick,
}: {
  faces: Record<string, string[][]>
  undecidedFaces?: Set<string>
  currentFace?: string
  autoFaces?: Set<string>
  onFaceClick?: (face: string) => void
}) {
  const faceGrid = (face: string) => (
    <FaceGrid
      colors={faces[face]}
      undecided={undecidedFaces?.has(face)}
      current={face === currentFace}
      auto={autoFaces?.has(face)}
    />
  )
  const grid = (face: string) => onFaceClick
    ? <button type="button" class="orientation-net-face-button" aria-label={`Check colors for ${face} face`} onClick={() => onFaceClick(face)}>{faceGrid(face)}</button>
    : faceGrid(face)
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
// File sizes for the fixture download dialog.
function formatBytes(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function focusModalOnOpen(el: HTMLElement | null) {
  if (el && !el.contains(document.activeElement)) el.focus()
}

function storedCaptureSound(): boolean {
  try { return localStorage.getItem('cube-assembler.capture-sound') !== 'off' } catch { return true }
}

const FACE_LABELS: Record<FaceKey, string> = { U: 'Up', R: 'Right', F: 'Front', D: 'Down', L: 'Left', B: 'Back' }
const ORIENTATION_CHOICES_PER_PAGE = 2

// ─────────────────────────────────────────────────────────────────────────────
// App Component
// ─────────────────────────────────────────────────────────────────────────────

function App() {
  const [puzzleSize, setPuzzleSize] = useState(3)
  const [cube, setCube] = useState<any>(null)
  const [parity, setParity] = useState<any>(null)
  // Which highlight group (see parity.ts's HighlightGroup) is
  // currently moused-over in the Cube Net, if any - lets hovering one
  // implicated sticker cross-highlight every other reading that shares
  // its same color combination (e.g. all the wings that matched an
  // over-represented pair), not just itself.
  const [hoveredHighlightGroup, setHoveredHighlightGroup] = useState<string | null>(null)
  const [webcamOpen, setWebcamOpen] = useState(false)
  const [captureMode, setCaptureMode] = useState<CaptureMode>('cv')
  const [autoCapture, setAutoCapture] = useState(true)
  const [autoCaptureFrames, setAutoCaptureFrames] = useState(0)
  const [autoCapturePaused, setAutoCapturePaused] = useState(false)
  // Auto (the default) detects the cube size from the first face (see
  // sizeDetectionActive); a size picked from the list is kept as is.
  const [autoSize, setAutoSize] = useState(true)
  const [detectedSize, setDetectedSize] = useState<number | null>(null)
  const [sizeSwitch, setSizeSwitch] = useState<{ from: number; to: number } | null>(null)
  const [captureFlash, setCaptureFlash] = useState(false)
  const [captureSound, setCaptureSound] = useState(storedCaptureSound)
  const captureAudio = useRef<AudioContext | null>(null)
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const autoCaptureInFlight = useRef(false)
  const lastCapturedColors = useRef<string[][] | null>(null)
  const lastCapturedPose = useRef<TurnCuePose | null>(null)
  const [webcamFace, setWebcamFace] = useState('U')
  const [capturedFaces, setCapturedFaces] = useState<Record<string, FaceCaptureData>>({})
  const [faceConfidence, setFaceConfidence] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(false)
  const [captureMessage, setCaptureMessage] = useState('')
  const [turnOverlay, setTurnOverlay] = useState<{ step: number; startColors: string[][]; viaColors?: string[][] } | null>(null)
  const [fixtureSaveMessage, setFixtureSaveMessage] = useState('')
  const [fixtureUploadMessage, setFixtureUploadMessage] = useState('')
  const [fixtureUploading, setFixtureUploading] = useState(false)
  const [fixtureServerReachable, setFixtureServerReachable] = useState(false)
  const [fixtureServerChecked, setFixtureServerChecked] = useState(false)
  // A fixture zip ready to download, shown first with its photos (as blob
  // URLs, revoked on close) and a summary of its meta.json.
  const [fixtureDownload, setFixtureDownload] = useState<{
    fixture: Fixture
    name: string
    zip: Uint8Array
    summary: FixtureSummary
    photoUrls: string[]
  } | null>(null)
  useEffect(() => {
    if (!fixtureDownload || !import.meta.env.DEV) return
    let active = true
    let checking = false
    const controller = new AbortController()
    const check = async () => {
      if (checking) return
      checking = true
      const reachable = await fixtureUploadServerAvailable(fetch, controller.signal)
      checking = false
      if (active) {
        setFixtureServerReachable(reachable)
        setFixtureServerChecked(true)
      }
    }
    setFixtureServerReachable(false)
    setFixtureServerChecked(false)
    void check()
    const timer = setInterval(() => void check(), 3000)
    return () => {
      active = false
      controller.abort()
      clearInterval(timer)
    }
  }, [fixtureDownload])
  const [manualColorInput, setManualColorInput] = useState('')
  const [showColorInput, setShowColorInput] = useState(false)
  const [notationFormat, setNotationFormat] = useState<'wrg' | 'urf'>('wrg')
  const [liveDetection, setLiveDetection] = useState<ColorDetectionResult | null>(null)
  const [liveFaceVisible, setLiveFaceVisible] = useState(false)
  const [liveMedianWB, setLiveMedianWB] = useState(false)
  const [liveAutoColorProfileId, setLiveAutoColorProfileId] = useState<string | null>(null)
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
  const [orientationWizard, setOrientationWizard] = useState<{ remaining: OrientedCandidate[]; truncated: boolean; picked: FaceKey[]; page?: number } | null>(null)
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
    suggestedFrom?: number
    fallback: OrientationSolution | null
    page?: number
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
  const [profileStore, setProfileStore] = useState<ProfileSettings>(loadProfileStore)
  const profile = activeCube(profileStore, puzzleSize)
  const detectingSize = sizeDetectionActive({
    autoSize, detectedSize, facesCaptured: Object.keys(capturedFaces).length, detectFace: captureMode === 'cv',
  })
  const colorProfile = activeColorProfile(profileStore)
  const sampling = profile.sampling
  const autoColorProfiles = useMemo(() => [genericColorProfile(), ...profileStore.colors], [profileStore.colors])
  const provisionalColorProfile = useMemo(() => matchPartialColorProfile(
    autoColorProfiles,
    FACE_ORDER.flatMap((face) => capturedFaces[face]?.cellColors?.flat() ?? []),
  ), [autoColorProfiles, capturedFaces])
  const palette = useMemo(() => profileStore.activeColorsId === AUTO_COLORS_ID
    ? provisionalColorProfile?.colors : capturePalette(profileStore), [profileStore, provisionalColorProfile])
  const liveAutoColorProfile = autoColorProfiles.find((candidate) => candidate.id === liveAutoColorProfileId)
  const [samplingSetupOpen, setSamplingSetupOpen] = useState(false)
  // Upload Fixture option: start the review from what detection reads
  // today instead of the colors the fixture was saved with, so a capture
  // can be reviewed afresh without its earlier hand corrections.
  const [ignoreFixtureCorrections, setIgnoreFixtureCorrections] = useState(false)
  // The 6 colors as learned from this capture's own stickers (null when the
  // cross-face recalibration didn't run) - what the color-fix picker scores
  // each alternative against.
  const [learnedPalette, setLearnedPalette] = useState<Record<string, RGB> | null>(null)
  const [pendingPalette, setPendingPalette] = useState<{ colors: Record<string, RGB>; confidentFraction: number; recalibrated: boolean } | null>(null)
  const [profileLearningOffer, setProfileLearningOffer] = useState<{
    colors: Record<string, RGB>
    evidence: PaletteEvidence
    matchedProfileId: string | null
    updatedProfileName?: string
  } | null>(null)
  const [newColorName, setNewColorName] = useState<string | null>(null)
  const [samplingFileMessage, setSamplingFileMessage] = useState('')
  // The cube geometry and colors selected when this capture was taken.
  const [captureProfile, setCaptureProfile] = useState<{ id?: string; name: string } | null>(null)
  const [resolvedColorProfile, setResolvedColorProfile] = useState<UsedColorProfile | null>(null)
  const [resolvedColorReference, setResolvedColorReference] = useState<Record<string, RGB> | null>(null)
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
      setSamplingFileMessage("❌ This browser won't keep settings (storage blocked or full) - download the settings file to save them")
    }
    setProfileStore(updated)
  }
  const updateSampling = (next: SamplingGeometry) => {
    if (isBuiltinCube(profile.id)) return
    applyProfileStore(saveCube(profileStore, { ...profile, sampling: next }))
  }
  const [newCubeName, setNewCubeName] = useState<string | null>(null)
  const [newColorProfileName, setNewColorProfileName] = useState<string | null>(null)
  const handleCreateCube = () => {
    if (!newCubeName?.trim()) return
    applyProfileStore(saveCube(profileStore, copyCubeSetting(profileStore, profile, newCubeName)))
    setNewCubeName(null)
    setSamplingSetupOpen(true)
  }
  const handleCreateNamedColors = () => {
    if (!newColorProfileName?.trim()) return
    applyProfileStore(saveColorProfile(profileStore, copyColorProfile(profileStore, colorProfile, newColorProfileName)))
    setNewColorProfileName(null)
  }
  const handleCreateColors = () => {
    if (!profileLearningOffer || !newColorName?.trim()) return
    const id = `colors-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const saved = saveColorProfile(profileStore, {
      id, name: newColorName.trim().slice(0, 60), colors: profileLearningOffer.colors,
      captures: 1, updatedAt: new Date().toISOString(),
    })
    applyProfileStore(profileStore.activeColorsId === AUTO_COLORS_ID
      ? setAutoColorMatch(selectColorProfile(saved, AUTO_COLORS_ID), id) : saved)
    setProfileLearningOffer(null)
    setNewColorName(null)
  }
  const handleUpdateColors = () => {
    const offer = profileLearningOffer
    const target = profileStore.colors.find((profile) => profile.id === offer?.matchedProfileId)
    if (!offer || !target) return
    const updated = updateProfileFromCapture(target, offer.colors, offer.evidence, new Date().toISOString())
    if (!updated) return
    const saved = saveColorProfile(profileStore, updated)
    applyProfileStore(profileStore.activeColorsId === AUTO_COLORS_ID ? setAutoColorMatch(saved, updated.id) : saved)
    setProfileLearningOffer({ ...offer, matchedProfileId: null, updatedProfileName: updated.name })
  }
  // Settings file: cubes and colors, so a setup tuned in one browser or
  // on one machine can be carried to another.
  const handleDownloadSampling = () => {
    const blob = new Blob(
      [JSON.stringify(settingsFile(profileStore), null, 2)],
      { type: 'application/json' }
    )
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'cube-assembler-settings.json'
    link.click()
    URL.revokeObjectURL(url)
    setSamplingFileMessage('✓ Settings downloaded')
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
        setSamplingFileMessage(`❌ ${file.name} isn't a settings file`)
        return
      }
      applyProfileStore(mergeSettings(profileStore, uploaded))
      setSamplingFileMessage(`✓ Loaded ${uploaded.cubes.length} cubes and ${uploaded.colors.length} color profiles`)
    } catch {
      setSamplingFileMessage(`❌ ${file.name} isn't valid JSON`)
    }
  }
  const [globalWhiteBalanceNote, setGlobalWhiteBalanceNote] = useState<string | null>(null)
  // The per-face background-derived gains actually applied this capture
  // (see computeBackgroundGains) - recorded in saved fixtures, which
  // replay them.
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
  const liveWorker = useRef<Worker | null>(null)
  useEffect(() => () => { liveWorker.current?.terminate() }, [])

  const armCaptureAudio = (enabled = captureSound) => {
    if (!enabled) return
    try {
      captureAudio.current ??= new AudioContext()
      void captureAudio.current.resume()
    } catch { /* Audio is optional if the browser has no Web Audio. */ }
  }

  const signalCapture = () => {
    setCaptureFlash(true)
    if (flashTimer.current) clearTimeout(flashTimer.current)
    flashTimer.current = setTimeout(() => setCaptureFlash(false), 220)
    const audio = captureSound ? captureAudio.current : null
    if (!audio || audio.state !== 'running') return
    const buffer = audio.createBuffer(1, Math.ceil(audio.sampleRate * 0.07), audio.sampleRate)
    const samples = buffer.getChannelData(0)
    for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1
    const click = audio.createBufferSource()
    click.buffer = buffer
    const filter = audio.createBiquadFilter()
    filter.type = 'highpass'
    filter.frequency.value = 700
    const volume = audio.createGain()
    const now = audio.currentTime
    volume.gain.setValueAtTime(0.13, now)
    volume.gain.exponentialRampToValueAtTime(0.001, now + 0.07)
    click.connect(filter).connect(volume).connect(audio.destination)
    click.start(now)
    click.stop(now + 0.07)
  }

  useEffect(() => () => {
    if (flashTimer.current) clearTimeout(flashTimer.current)
    void captureAudio.current?.close()
  }, [])

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
  // capture. Keep analyzing behind the turn cue to see the old face leave.
  const turnCueShowing = turnOverlay !== null
  useEffect(() => {
    setAutoCaptureFrames(0)
    setAutoCapturePaused(false)
    if (!webcamOpen) {
      setLiveDetection(null)
      setLiveFaceVisible(false)
      setLiveMedianWB(false)
      setLiveAutoColorProfileId(null)
      setLiveCapturedFace(null)
      return
    }
    if (loading) return

    if (!sampleCanvasRef.current) {
      sampleCanvasRef.current = document.createElement('canvas')
    }
    const canvas = sampleCanvasRef.current
    let progress: AutoCaptureProgress | null = null
    let hold: LiveHold<ColorDetectionResult> = NO_HOLD
    let turnCueClearFrames = 0
    const capturedBackgrounds = Object.fromEntries(FACE_ORDER.map((face) => [face, capturedFaces[face]?.backgroundColor ?? null]))
    let sizeVotes: Array<number | null> = []

    // Frames are analyzed in a worker, scaled down to LIVE_ANALYSIS_HEIGHT
    // there (see liveAnalysis.worker.ts), one at a time. The worker hands
    // each full-resolution frame back with its result, so a capture reads
    // the very image the detection judged.
    const worker = liveWorker.current ??= new Worker(new URL('./liveAnalysis.worker.ts', import.meta.url), { type: 'module' })
    let active = true
    let frameId = 0
    let inFlight: number | null = null

    const onResult = (event: MessageEvent<LiveResultMessage>) => {
      const full = event.data.frame
      if (!active || event.data.id !== inFlight) { full.close(); return }
      try {
        if ('error' in event.data) throw new Error(event.data.error)
        const { result } = event.data
        // Bounds in the camera frame's pixels; colors and the check come
        // from the worker's single read of the face.
        const bounds = scaleBounds(result.bounds, event.data.scale)
        const { detection, visible } = result
        setLiveMedianWB(result.backgroundColor !== null)
        setLiveAutoColorProfileId(result.colorProfileId ?? provisionalColorProfile?.id ?? null)
        if (lastCapturedColors.current) {
          const pose: TurnCuePose = {
            centerX: bounds.startX + bounds.faceWidth / 2,
            centerY: bounds.startY + bounds.faceHeight / 2,
            size: bounds.faceWidth,
            angle: bounds.angle ?? 0,
          }
          turnCueClearFrames = nextTurnCueClearFrames(
            turnCueClearFrames,
            visible && bounds.gridFound && detection.confidence >= 0.8 ? detection.colors : null,
            lastCapturedColors.current,
            visible && bounds.gridFound && lastCapturedPose.current !== null
              ? turnPoseChanged(lastCapturedPose.current, pose) : false
          )
          if (turnCueClearFrames >= TURN_CUE_CLEAR_FRAMES) {
            lastCapturedColors.current = null
            lastCapturedPose.current = null
            if (turnCueShowing) dismissTurnOverlay()
          }
          return
        }
        if (turnCueShowing) return
        if (detectingSize && result.size !== undefined) {
          sizeVotes = nextSizeVotes(sizeVotes, result.size)
          const agreed = agreedSize(sizeVotes)
          if (agreed !== null) {
            setDetectedSize(agreed)
            if (agreed !== puzzleSize) {
              setSizeSwitch({ from: puzzleSize, to: agreed })
              changePuzzleSize(agreed)
            }
            return
          }
        }
        // Detect face holds a confirmed face through a weak frame or two
        // (display only - see holdConfirmedFace); everything below still
        // judges this frame on its own.
        const shown = captureMode === 'cv' ? holdConfirmedFace(hold, detection, visible) : { hold, show: detection, visible }
        hold = shown.hold
        setLiveDetection(shown.show)
        setLiveFaceVisible(shown.visible)
        const matchedSlot = captureMode === 'cv' && visible && detection.confidence >= 0.8
          ? findCapturedFaceMatch(
              FACE_ORDER.map((face) => capturedFaces[face] && { colors: capturedFaces[face].colors }),
              { colors: detection.colors },
              FACE_ORDER.indexOf(webcamFace)
            )
          : null
        setLiveCapturedFace(matchedSlot === null ? null : FACE_ORDER[matchedSlot])
        if (captureMode === 'cv' && autoCapture && !autoCaptureInFlight.current) {
          const counted = visible && bounds.gridFound && detection.confidence >= AUTO_CAPTURE_MIN_CONFIDENCE && !detectingSize
          progress = nextAutoCaptureProgress(progress, counted ? {
            colors: detection.colors,
            confidence: detection.confidence,
            centerX: bounds.startX + bounds.faceWidth / 2,
            centerY: bounds.startY + bounds.faceHeight / 2,
            size: bounds.faceWidth,
            angle: bounds.angle ?? 0,
          } : null)
          setAutoCaptureFrames(progress?.frames ?? 0)
          setAutoCapturePaused(!counted && progress !== null)
          if (counted && progress && progress.frames >= AUTO_CAPTURE_STABLE_FRAMES) {
            autoCaptureInFlight.current = true
            progress = null
            const frame = document.querySelector('.capture-scan-frame')?.getBoundingClientRect()
            if (frame) pendingFlyIn.current = { slot: webcamFace, from: frame }
            try {
              // Capture exactly the frame whose grid and colors stayed stable:
              // its full-resolution snapshot, not a newer camera frame.
              canvas.width = full.width
              canvas.height = full.height
              canvas.getContext('2d')?.drawImage(full, 0, 0)
              const autoPalette = autoColorProfiles.find((candidate) => candidate.id === event.data.result.colorProfileId)?.colors
              const result = captureAndProcessCanvas(canvas, puzzleSize, event.data.result.gains, sampling, palette ?? autoPalette, 'aligned', bounds)
              signalCapture()
              const track = (webcamRef.current?.srcObject as MediaStream | null)?.getVideoTracks()[0]
              setLoading(true)
              setCaptureMessage('Processing image...')
              void applyFaceCapture(webcamFace, result, 'camera', track ? withoutDeviceIds(track.getSettings()) : undefined)
                .catch((err) => setCaptureMessage(`❌ Error: ${err instanceof Error ? err.message : 'Unknown error'}`))
                .finally(() => { autoCaptureInFlight.current = false; setLoading(false) })
            } catch (err) {
              autoCaptureInFlight.current = false
              setCaptureMessage(`❌ Error: ${err instanceof Error ? err.message : 'Unknown error'}`)
            }
          }
        }
      } catch {
        // Transient frame read failure (e.g. camera still warming up).
        setLiveDetection(null)
        setLiveFaceVisible(false)
        setLiveMedianWB(false)
        setLiveCapturedFace(null)
        // A transient worker failure pauses the hold. The next good frame
        // still has to match the same sticker colors.
        setAutoCapturePaused(progress !== null)
      } finally {
        full.close()
        inFlight = null
      }
    }
    worker.addEventListener('message', onResult)

    const intervalId = setInterval(async () => {
      const video = webcamRef.current
      if (inFlight || !video || video.videoWidth === 0 || video.videoHeight === 0) return
      const id = ++frameId
      inFlight = id
      try {
        const frame = await createImageBitmap(video)
        if (!active || inFlight !== id) { frame.close(); return }
        const request: LiveAnalysisRequest = {
          gridSize: puzzleSize,
          mode: captureMode === 'cv' ? 'aligned' : 'fixed',
          requireOutline: captureMode === 'cv',
          sampling,
          palette,
          autoProfiles: profileStore.activeColorsId === AUTO_COLORS_ID && !palette ? autoColorProfiles : undefined,
          capturedBackgrounds,
          detectSize: detectingSize,
        }
        worker.postMessage({ id, frame, maxHeight: LIVE_ANALYSIS_HEIGHT, request } satisfies LiveFrameMessage, [frame])
      } catch {
        if (inFlight === id) inFlight = null
      }
    }, 200)

    return () => {
      active = false
      clearInterval(intervalId)
      worker.removeEventListener('message', onResult)
      inFlight = null
    }
  }, [webcamOpen, turnCueShowing, loading, webcamFace, puzzleSize, sampling, palette, autoColorProfiles, profileStore.activeColorsId, provisionalColorProfile, captureMode, autoCapture, captureSound, capturedFaces, detectingSize])

  // Everything below belongs to one cube of one size, so switching sizes
  // starts over - keeping it drew e.g. a 5x5's 25 stickers per face into a
  // 6x6 net. Shared by the main size bar and the capture dialog.
  const changePuzzleSize = (size: number) => {
    if (size === puzzleSize) return true
    if (Object.keys(capturedFaces).length > 0 && !window.confirm('Changing cube size clears the captured faces. Continue?')) return false
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
    setAppliedBackgroundGains(null)
    setLearnedPalette(null)
    setPendingPalette(null)
    setProfileLearningOffer(null)
    setCaptureProfile(null)
    setResolvedColorProfile(null)
    setCaptureMessage('')
    setFixtureSaveMessage('')
    return true
  }

  const changeCube = (id: string) => {
    if (id === AUTO_SIZE_OPTION) {
      setAutoSize(true)
      setDetectedSize(null)
      setSizeSwitch(null)
      return true
    }
    const selected = allCubes(profileStore).find((cube) => cube.id === id)
    if (!selected) return false
    if (selected.size !== puzzleSize && !changePuzzleSize(selected.size)) return false
    setAutoSize(false)
    setSizeSwitch(null)
    applyProfileStore(selectCube(profileStore, id))
    return true
  }

  const handleApplySolved = async () => {
    const solved = createSolvedCube(puzzleSize)
    setCube(solved)
    setResolvedColorProfile(null)

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
      setResolvedColorProfile(null)

      const toGrid = (data: string[]): string[][] =>
        Array.from({ length: size }, (_, r) => data.slice(r * size, r * size + size))
      const newCapturedFaces: Record<string, FaceCaptureData> = {}
      for (const [face, data] of Object.entries(newCube)) {
        newCapturedFaces[face.toUpperCase()] = { colors: toGrid(data), confidence: 1.0, timestamp: Date.now() }
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

  const updateParityStatus = (cubeState: any, sizeOverride?: number) => {
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
      setDetectedSize(null)
      setSizeSwitch(null)
      setCapturedFaces({})
      setFaceConfidence({})
      setResolvedColorProfile(null)
      setProfileLearningOffer(null)
      setNewColorName(null)
    }
    const nextFace = startOver ? FACE_ORDER[0] : FACE_ORDER.find((f) => !(f in capturedFaces))!
    setWebcamFace(nextFace)
    setCaptureMessage('')
    if (startOver) setDismissedCaptureWarnings([])
    setGlobalWhiteBalanceNote(null)
    setAppliedBackgroundGains(null)
    setResolvedColorReference(null)
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
    cameraSettings?: Partial<MediaTrackSettings>,
    captureSize = puzzleSize
  ) => {
    if (!validateFaceColors(result.colors, captureSize)) {
      setCaptureMessage(`❌ Invalid colors detected. Confidence: ${(result.confidence * 100).toFixed(0)}%`)
      return
    }

    const requestedIndex = FACE_ORDER.indexOf(face)
    const { index: assignedIndex, unexpectedCenter } = placeCapturedFace(FACE_ORDER.map((f) => capturedFaces[f]?.colors), requestedIndex, result.colors)
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
        outOfOrder: unexpectedCenter || assignedIndex !== requestedIndex || capturedFaces[assignedFace]?.outOfOrder,
        timestamp: Date.now(),
      },
    }

    setCapturedFaces(newCapturedFaces)
    lastCapturedColors.current = source === 'camera' ? result.colors : null
    lastCapturedPose.current = source === 'camera' && result.crop
      ? { centerX: result.crop.x + result.crop.width / 2, centerY: result.crop.y + result.crop.height / 2,
          size: result.crop.width, angle: (result.crop.angle ?? 0) * Math.PI / 180 }
      : null
    setFaceConfidence({ ...faceConfidence, [assignedFace]: result.confidence })
    setCaptureMessage(`✓ ${FACE_DISPLAY_LABEL[assignedFace]} captured (${(result.confidence * 100).toFixed(0)}% confidence)`
      + (unexpectedCenter ? " - its center isn't the suggested one; check it in the review" : ''))

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
        if (source !== 'camera' || window.matchMedia('(prefers-reduced-motion: reduce)').matches
          || FACE_ORDER.some((f) => newCapturedFaces[f]?.outOfOrder)) return
        const step = FACE_ORDER.indexOf(nextFace)
        setTurnOverlay({ step, startColors: result.colors, viaColors: step === 5 ? newCapturedFaces[FACE_ORDER[3]]?.colors : undefined })
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
    setPendingPalette(null)
    setProfileLearningOffer(null)
    const automatic = profileStore.activeColorsId === AUTO_COLORS_ID
    setResolvedColorProfile(automatic ? null : resolvedColorProfileSnapshot(colorProfile, 'manual'))
    setResolvedColorReference(null)

    const canRecalibrate = FACE_ORDER.every((f) => newCapturedFaces[f].croppedImage)
    if (canRecalibrate) {
      try {
        const images: Record<string, string> = {}
        for (const f of FACE_ORDER) images[f] = newCapturedFaces[f].croppedImage!

        // Each face's backdrop brought to the median of all six (see
        // computeBackgroundGains) before the colors are learned; neutral
        // without enough backdrop readings (e.g. imported photos).
        const faceGains = computeBackgroundGains(Object.fromEntries(FACE_ORDER.map((f) => [f, newCapturedFaces[f].backgroundColor])))
        setAppliedBackgroundGains(faceGains)

        let wb = await runGlobalWhiteBalance(images, puzzleSize, faceGains ?? undefined, sampling, automatic ? undefined : palette)
        const matched = automatic && wb.learned ? matchColorProfile(profileStore.colors, wb.learned.colors) : null
        const compared = matched ?? (!automatic ? profileStore.colors.find((saved) => saved.id === colorProfile.id) : null)
        const colorFit = compared && wb.learned ? profileColorFitPercent(compared.colors, wb.learned.colors) : undefined
        if (matched) wb = classifyAcrossFaces(wb.faces, matched.colors)
        setResolvedColorReference(matched?.colors ?? (automatic ? null : palette ?? null))
        setResolvedColorProfile(automatic
          ? matched ? resolvedColorProfileSnapshot(matched, 'automatic', colorFit)
            : wb.learned ? captureColorProfileSnapshot(wb.learned.colors) : null
          : resolvedColorProfileSnapshot(colorProfile, 'manual', colorFit))
        setLearnedPalette(wb.learned?.colors ?? null)
        const confidences = FACE_ORDER.flatMap((face) => wb.faces[face]?.cellConfidences?.flat() ?? [])
        setPendingPalette(wb.learned ? {
          colors: wb.learned.colors,
          confidentFraction: confidences.length ? confidences.filter((value) => value >= 0.7).length / confidences.length : 0,
          recalibrated: wb.applied,
        } : null)
        setCaptureProfile({ id: profile.id, name: profile.name })
        // Keep calibration provisional until the customer approves the
        // complete cube in the orientation review.
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
        setPendingPalette(null)
      }
    }

    setLoading(false)
    setWebcamOpen(false)
    setReviewStep(0)
    setShowReviewDialog(true)
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
  const handleUploadFixture = async (e: Event) => {
    const input = e.currentTarget as HTMLInputElement
    const selected = Array.from(input.files ?? [])
    if (selected.length === 0) return

    setLoading(true)
    setCaptureMessage('Loading fixture...')

    try {
      const files: File[] = []
      for (const file of selected) {
        if (!file.name.toLowerCase().endsWith('.zip')) {
          files.push(file)
          continue
        }
        try {
          files.push(...unzipFixture(new Uint8Array(await file.arrayBuffer())))
        } catch (err) {
          setCaptureMessage(`❌ ${file.name} isn't a fixture zip: ${err instanceof Error ? err.message : String(err)}`)
          return
        }
      }
      const metaFile = files.find((f) => f.name.toLowerCase().endsWith('.json'))
      if (!metaFile) {
        setCaptureMessage("❌ No .json file found - select a fixture zip, or a fixture's meta.json together with its 6 face-*.jpg photos.")
        return
      }

      let meta: {
        gridSize: number
        colorsURFDLB?: string
        faces: Record<string, { photo: string } & Record<string, unknown>>
        capture?: {
          backgroundWhiteBalance?: Record<string, RGB> | null
          backgroundWhiteBalanceMethod?: string
          sampling?: SamplingGeometry
          profile?: { id?: string; name?: string } | null
          colorProfile?: UsedColorProfile | null
          colorReference?: Record<string, RGB> | null
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
      setPendingPalette(null)
      setProfileLearningOffer(null)
      setUploadedProtocol(meta.capture?.protocol ?? null)
      const recordedProfile = meta.capture?.profile
      setCaptureProfile(recordedProfile?.name ? { id: recordedProfile.id, name: recordedProfile.name } : null)
      const recordedColors = meta.capture?.colorProfile
      setResolvedColorProfile(recordedColors?.name && recordedColors.colors ? recordedColors : null)
      setResolvedColorReference(meta.capture?.colorReference ?? null)
      const images = Object.fromEntries(Object.entries(newEntries).map(([f, d]) => [f, d.croppedImage!]))
      // Background gains are replayed only if made the current way (see
      // BACKGROUND_WB_METHOD); older ones swapped red and orange.
      const recordedGains = meta.capture?.backgroundWhiteBalanceMethod === BACKGROUND_WB_METHOD
        ? meta.capture.backgroundWhiteBalance ?? null
        : null
      const wb = await runGlobalWhiteBalance(images, meta.gridSize, recordedGains ?? undefined, meta.capture?.sampling ?? DEFAULT_SAMPLING, meta.capture?.colorReference ?? undefined)
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
      setAppliedBackgroundGains(recordedGains)
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
    armCaptureAudio()
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
        const preferred = preferredGuidedArrangementIndex(solution.arrangements)
        // Keep every guided fit available after "No" even if the broader
        // orientation search was capped before it reached that fit.
        const seen = new Set<string>()
        const alternatives = [solution.alternatives[preferred], ...solution.alternatives, ...(free?.alternatives ?? [])]
          .filter((candidate) => {
            const key = FACE_ORDER.map((face) => faceContentKey(candidate.faces[face as FaceKey])).join('|')
            if (seen.has(key)) return false
            seen.add(key)
            return true
          })
        setOrientationApproval({
          candidates: [solution.alternatives[preferred]],
          arrangements: [solution.arrangements[preferred]],
          valid: true,
          suggestedFrom: solution.alternatives.length,
          fallback: { ...(free ?? solution), alternatives, truncated: Boolean(free?.truncated || solution.truncated) },
        })
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
    (FACE_ORDER.every((f) => capturedFaces[f]?.source === 'camera')
      && !FACE_ORDER.some((f) => capturedFaces[f]?.outOfOrder)
      && !checkGuidedCenters(FACE_ORDER.slice(0, 2).map((f) => capturedFaces[f]?.colors)).length)
    || (FACE_ORDER.every((f) => capturedFaces[f]?.source === 'fixture') && uploadedProtocol === GUIDED_PROTOCOL)

  const predictedCenters = captureCenterSlots(FACE_ORDER.map((f) => capturedFaces[f]?.colors))
  const predictedCenter = predictedCenters[FACE_ORDER.indexOf(webcamFace)]
  const centerRoutingActive = puzzleSize % 2 === 1
    && Boolean(capturedFaces[FACE_ORDER[0]] && capturedFaces[FACE_ORDER[1]])
    && predictedCenters.every(Boolean)
    && !capturedFaces[webcamFace]
  const capturedPhotos = FACE_ORDER.map((f) => capturedFaces[f]?.colors)
  const repeatedFaces = findRepeatedFaces(capturedPhotos)
  const matchingNetFaces = new Set(repeatedFaces.flatMap(([a, b]) => [FACE_ORDER[a], FACE_ORDER[b]]))
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
    const sure = (i: number) => (capturedFaces[FACE_ORDER[i]]?.cellConfidences?.[mid]?.[mid] ?? 0) >= 0.6
    for (const issue of checkGuidedCenters(capturedPhotos)) {
      const involved = issue.kind === 'turned-twice' ? [issue.photo - 1, issue.photo] : issue.photos
      const key = JSON.stringify(issue)
      if (involved.every(sure) && !dismissedCaptureWarnings.includes(key)) {
        return { text: describeCenterIssue(issue), key, retake: Math.max(...involved) }
      }
    }
    return null
  })()

  // "No, let me choose each side" is only offered when the photos fit
  // together some other way too; the wizard then starts from every
  // arrangement (see wizardStart).
  const rejectAlternatives = (approval: NonNullable<typeof orientationApproval>): OrientedCandidate[] => {
    const rejected = new Set(approval.candidates.map((c) => orientationFreeSignature(c.faces)))
    return (approval.fallback?.alternatives ?? []).filter((c) => !rejected.has(orientationFreeSignature(c.faces)))
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
    setOrientationWizard({ remaining: orientationApproval.fallback!.alternatives, truncated: orientationApproval.fallback!.truncated, picked: [] })
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
      try { reviewedValid = checkParity(cubeState, puzzleSize).valid } catch { /* Keep learned colors out of a failed review. */ }
      const correctedCells = FACE_ORDER.reduce((count, face) => {
        const captured = capturedFaces[face]
        if (!captured?.detectedColors) return count + puzzleSize * puzzleSize
        return count + captured.colors.reduce((sum, row, r) => sum + row.filter((color, c) =>
          color !== captured.detectedColors?.[r]?.[c]).length, 0)
      }, 0)
      const evidence = {
        reviewedValid,
        cameraOnly: FACE_ORDER.every((face) => capturedFaces[face]?.source === 'camera'),
        recalibrated: pendingPalette.recalibrated,
        confidentFraction: pendingPalette.confidentFraction,
        correctedFraction: correctedCells / (6 * puzzleSize * puzzleSize),
      }
      const automatic = profileStore.activeColorsId === AUTO_COLORS_ID
      const matched = automatic && reviewedValid && evidence.cameraOnly && evidence.recalibrated
        ? profileStore.colors.find((saved) => saved.id === resolvedColorProfile?.id) ?? null : null
      const target = matched ?? colorProfile
      const canCreate = canCreateProfileFromCapture(evidence)
      setProfileLearningOffer(canCreate ? {
        colors: pendingPalette.colors,
        evidence,
        matchedProfileId: automatic && matched && assessPalette(matched, pendingPalette.colors, evidence).accepted
          ? matched.id : null,
      } : null)
      setNewColorName(null)
      if (automatic) {
        applyProfileStore(setAutoColorMatch(profileStore, matched?.id ?? null))
      } else if (shouldBlendColorProfile(target, pendingPalette.colors, evidence, false)) {
        const next = saveColorProfile(profileStore, blendColorProfile(target, pendingPalette.colors, new Date().toISOString()))
        applyProfileStore(next)
      }
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
      handleChooseOrientation(matched[0])
      return
    }
    setOrientationWizard((prev) => (prev ? { remaining: matched, truncated: prev.truncated, picked: [...prev.picked, face], page: 0 } : null))
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

  // Packs this capture - each face's actual photo plus its (human-
  // reviewed/corrected) color grid - into a fixture zip (see fixtureZip.ts)
  // and shows what's in it before downloading (downloadFixture): unzipped
  // into test/fixtures/, it is a permanent regression fixture (see
  // test/fixtures.test.ts). Only meaningful once a
  // cube has actually been confirmed: that's the point at which
  // capturedFaces' colors reflect whatever corrections were made in the
  // review wizard, not just the raw first-pass detection.
  const handleSaveFixture = () => {
    const allCaptured = FACE_ORDER.every((f) => capturedFaces[f]?.croppedImage)
    if (!allCaptured) {
      setFixtureSaveMessage('❌ Capture and confirm all 6 faces first.')
      return
    }
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
        app: { version: __APP_VERSION__, commit: __APP_COMMIT__ },
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
        // One resolved profile for the complete capture. The actual common
        // palette learned from all six photos is recorded below.
        colorProfile: resolvedColorProfile,
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
        backgroundWhiteBalanceMethod: appliedBackgroundGains ? BACKGROUND_WB_METHOD : null,
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
      const fixture = buildFixture({
        gridSize: puzzleSize,
        colorsURFDLB: gridsToWRGFacelets(Object.fromEntries(FACE_ORDER.map((f) => [f, capturedFaces[f].colors]))),
        // What detection said before any hand correction - the diff
        // against colorsURFDLB is exactly what a human had to fix.
        detectedURFDLB: FACE_ORDER.every((f) => capturedFaces[f].detectedColors)
          ? gridsToWRGFacelets(Object.fromEntries(FACE_ORDER.map((f) => [f, capturedFaces[f].detectedColors!])))
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
        photoUrls: summary.photos.map((p) => URL.createObjectURL(new Blob([p.bytes as BlobPart], { type: p.file.endsWith('.png') ? 'image/png' : 'image/jpeg' }))),
      })
    } catch (err) {
      setFixtureSaveMessage(`❌ Failed to save fixture: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const closeFixtureDownload = () => {
    fixtureDownload?.photoUrls.forEach((url) => URL.revokeObjectURL(url))
    setFixtureDownload(null)
    setFixtureUploadMessage('')
  }

  const uploadFixture = async () => {
    if (!fixtureDownload || fixtureUploading || !fixtureServerReachable) return
    setFixtureUploading(true)
    setFixtureUploadMessage('')
    try {
      await uploadFixtureToDevServer(fixtureDownload.fixture)
      setFixtureSaveMessage(`✓ Saved ${fixtureDownload.name} to test/fixtures/`)
      closeFixtureDownload()
    } catch (error) {
      setFixtureUploadMessage(`❌ ${error instanceof Error ? error.message : String(error)}`)
      void fixtureUploadServerAvailable().then(setFixtureServerReachable)
    } finally {
      setFixtureUploading(false)
    }
  }

  const downloadFixture = () => {
    if (!fixtureDownload) return
    const url = URL.createObjectURL(new Blob([fixtureDownload.zip as BlobPart], { type: 'application/zip' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `${fixtureDownload.name}.zip`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 0)
    setFixtureSaveMessage(`✓ Downloaded ${fixtureDownload.name}.zip - unzip it into test/fixtures/ to add it to the tests`)
    closeFixtureDownload()
  }

  const handleCapturePhoto = async () => {
    if (!webcamRef.current || turnOverlay !== null) return
    const frame = document.querySelector('.capture-scan-frame')?.getBoundingClientRect()
    if (frame) pendingFlyIn.current = { slot: webcamFace, from: frame }

    try {
      setLoading(true)
      setCaptureMessage('Processing image...')
      const video = webcamRef.current
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext('2d')
      if (!ctx || !canvas.width || !canvas.height) throw new Error('Camera frame unavailable')
      ctx.drawImage(video, 0, 0)
      const geometry = captureMode === 'cv' ? 'aligned' : 'fixed'
      const bounds = faceBoundsForMode(canvas, puzzleSize, geometry)
      if (captureMode === 'cv') {
        if (!bounds.gridFound || !hasVisibleCubeFace(canvas, puzzleSize, bounds, true)) {
          throw new Error('No cube face detected. Show the face clearly or choose Guide grid.')
        }
      }
      const background = extractBackgroundColor(canvas, bounds)
      const capturedBackgrounds = Object.fromEntries(FACE_ORDER.map((face) => [face, capturedFaces[face]?.backgroundColor ?? null]))
      const gains = background ? computeBackgroundGains({ ...capturedBackgrounds, current: background })?.current ?? NEUTRAL_GAINS : NEUTRAL_GAINS
      const result: FaceCaptureResult = captureAndProcessCanvas(canvas, puzzleSize, gains, sampling,
        palette ?? liveAutoColorProfile?.colors, geometry, bounds)
      const track = (webcamRef.current.srcObject as MediaStream | null)?.getVideoTracks()[0]
      signalCapture()
      await applyFaceCapture(webcamFace, result, 'camera', track ? withoutDeviceIds(track.getSettings()) : undefined, result.colors.length)
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
        const result = captureAndProcessImage(img, puzzleSize, NEUTRAL_GAINS, sampling, palette,
          captureMode === 'cv' ? 'aligned' : 'fixed')
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
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  const getNotationOutput = () => {
    if (!cube) return 'null'
    return notationFormat === 'wrg' ? toWRGFacelets(cube) : toURFFacelets(cube)
  }

  const profilesPageTab = profilesTab(page)
  if (profilesPageTab) {
    // The last capture's faces that kept their measured sticker colors.
    const reviewCapture: ReviewCapture = {
      faces: FACE_ORDER.flatMap((face) => {
        const data = capturedFaces[face]
        return data?.cellColors && data.cellColors.length === data.colors.length
          ? [{ face, label: FACE_DISPLAY_LABEL[face], colors: data.colors, cellColors: data.cellColors }] : []
      }),
    }
    // The first captured face photo shows the Cubes tab's sticker areas.
    const photoFace = FACE_ORDER.find((face) => capturedFaces[face]?.croppedImage)
    const reviewPhoto = photoFace
      ? { size: puzzleSize, src: capturedFaces[photoFace].croppedImage!, label: `${FACE_DISPLAY_LABEL[photoFace]} face` } : null
    return <ProfilesPage tab={profilesPageTab} settings={profileStore} onChange={applyProfileStore}
      capture={reviewCapture.faces.length ? reviewCapture : null} photo={reviewPhoto} onClose={() => { location.hash = '' }}
      onExport={handleDownloadSampling} onImport={handleUploadSampling} fileMessage={samplingFileMessage} />
  }

  return (
    <div class="app-layout">
      {/* Header: name, cube geometry and color settings */}
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
          <span class="cube-current-name">{cubeGroupName(profile)}</span>
          <select
            class="header-profile"
            aria-label="Cube"
            value={autoSize ? AUTO_SIZE_OPTION : profile.id}
            onChange={(e) => { if (!changeCube(e.currentTarget.value)) e.currentTarget.value = autoSize ? AUTO_SIZE_OPTION : profile.id }}
          >
            <CubeSelectOptions settings={profileStore} detectedSize={autoSize ? detectedSize : null} />
          </select>
          <select class="header-profile" aria-label="Colors" value={profileStore.activeColorsId}
            onChange={(e) => applyProfileStore(selectColorProfile(profileStore, e.currentTarget.value))}>
            {allColorProfiles(profileStore).map((colors) => <option key={colors.id} value={colors.id}>{colors.name}</option>)}
          </select>
          <a class="color-review-link" href="#profiles">Profiles</a>
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
              // parity.highlight (see parity.ts's HighlightGroup) is a
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
                  onClick={handleSaveFixture}
                  disabled={loading}
                  title="Download this capture's photos + reviewed colors as a zip - unzipped into test/fixtures/ it becomes a regression test"
                >
                  Save as test fixture
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
            <div class="capture-card-actions">
              {FACE_ORDER.some((f) => f in capturedFaces) && !FACE_ORDER.every((f) => f in capturedFaces) && (
                <button type="button" class="btn btn-secondary btn-lg" onClick={() => handleOpenCapture(true)}>
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                    <path d="M16.5 9a6.5 6.5 0 1 0-1.4 5.1M16.5 4.5V9H12" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
                  </svg>
                  Capture again
                </button>
              )}
              <button type="button" class="btn btn-primary btn-lg" onClick={() => handleOpenCapture()}>
                <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
                  <path d="M2.5 6.5A1.5 1.5 0 0 1 4 5h2.2l1.3-2h5l1.3 2H16a1.5 1.5 0 0 1 1.5 1.5V15A1.5 1.5 0 0 1 16 16.5H4A1.5 1.5 0 0 1 2.5 15Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" />
                  <circle cx="10" cy="10.5" r="3" fill="none" stroke="currentColor" stroke-width="1.6" />
                </svg>
                {FACE_ORDER.every((f) => f in capturedFaces)
                  ? 'Capture again'
                  : FACE_ORDER.some((f) => f in capturedFaces)
                  ? `Continue (${FACE_ORDER.filter((f) => f in capturedFaces).length}/${FACE_ORDER.length})`
                  : 'Capture faces'}
              </button>
            </div>
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
              <span class="capture-profile-used">
                Cube: {captureProfile.name}
                {cube && resolvedColorProfile && <>
                  {' · '}Resolved sticker colors: {resolvedColorProfile.name}
                  {resolvedColorProfile.selection === 'automatic' ? ' (Automatic)' : ''}
                  {resolvedColorProfile.colorFitPercent !== undefined && ` · profile color fit ${resolvedColorProfile.colorFitPercent}%`}
                  <span class="capture-profile-used-detail">
                    First face: {resolvedColorProfile.selection === 'automatic' ? 'best live palette' : resolvedColorProfile.name}
                    {resolvedColorProfile.selection === 'automatic' && ' · Later previews: rechecked after each capture'}
                    {' · '}Final: {learnedPalette ? 'calibrated from all six faces' : 'six-face calibration unavailable'}
                  </span>
                </>}
              </span>
            )}
            {cube && FACE_ORDER.every((face) => capturedFaces[face]?.croppedImage) && !showReviewDialog && (
              <div class="profile-suggestion">
                {newColorName === null ? (
                  <>
                    <button type="button" class="btn btn-secondary btn-sm" disabled={!profileLearningOffer}
                      title={profileLearningOffer ? 'Save this capture’s learned sticker colors under a new name' : 'Requires a valid, confident reviewed camera capture'}
                      onClick={() => setNewColorName('')}>
                      ＋ Create sticker color profile
                    </button>
                    {profileLearningOffer?.matchedProfileId && (
                      <button type="button" class="btn btn-secondary btn-sm" onClick={handleUpdateColors}
                        title={`Update the detected ${resolvedColorProfile?.name ?? 'sticker color'} profile from this reviewed capture`}>
                        Update {resolvedColorProfile?.name ?? 'detected'} profile
                      </button>
                    )}
                    {profileLearningOffer?.updatedProfileName && <span role="status">✓ {profileLearningOffer.updatedProfileName} updated</span>}
                  </>
                ) : <>
                  <input aria-label="New sticker color profile name" maxLength={60} placeholder="e.g. GoCube" value={newColorName}
                    onInput={(e) => setNewColorName(e.currentTarget.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleCreateColors() }} />
                  <button type="button" class="btn btn-primary btn-sm" disabled={!newColorName.trim()} onClick={handleCreateColors}>Save profile</button>
                  <button type="button" class="btn btn-secondary btn-sm" onClick={() => setNewColorName(null)}>Cancel</button>
                </>}
              </div>
            )}
            <div class="card-divider" />
            <div class="capture-alternatives">
              <label
                class={`btn btn-secondary btn-sm ${loading ? 'btn-disabled' : ''}`}
                title="Select a fixture zip (from Save as test fixture), or a fixture's meta.json together with its 6 face-*.jpg photos"
              >
                Upload fixture
                <input
                  type="file"
                  accept=".zip,.json,image/*"
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
                {captureMode === 'guide' && samplingSetupOpen && (
                  // The band around the face that the background (white
                  // balance) sample skips, sized from the fixed 25% gap.
                  <div
                    class="capture-background-gap"
                    style={{
                      width: `${60 * (1 + 2 * BACKGROUND_CUBE_GAP)}%`,
                      padding: `${60 * BACKGROUND_CUBE_GAP}%`,
                    }}
                  />
                )}
                {/* Guide mode frames the exact sample square. Detect face shows
                    the wider seam search area; its moving grid marks the crop. */}
                <div class={`capture-scan-frame ${captureMode === 'cv' ? 'cv-search-frame' : ''} ${liveCapturedFace ? 'pattern-match' : ''} ${autoCapture && autoCaptureFrames > 0 ? 'capture-holding' : ''} ${captureFlash ? 'capture-flashed' : ''}`}>
                  <span class="capture-scan-label">{captureMode === 'cv' ? 'Show one face in this area' : 'Fit face in this square'}</span>
                  {captureMode === 'cv' && autoCapture && autoCaptureFrames > 0 && (
                    <svg class={`capture-progress-ring ${autoCapturePaused ? 'paused' : ''}`} viewBox="0 0 40 40" aria-hidden="true">
                      <circle class="capture-progress-track" cx="20" cy="20" r="16" />
                      <circle class="capture-progress-fill" cx="20" cy="20" r="16" style={{ strokeDashoffset: `${100.53 * (1 - autoCaptureFrames / AUTO_CAPTURE_STABLE_FRAMES)}` }} />
                    </svg>
                  )}
                </div>
                {captureFlash && <div class="capture-flash" aria-hidden="true" />}
                {turnOverlay && (
                  <CaptureTurnOverlay step={turnOverlay.step} startColors={turnOverlay.startColors} viaColors={turnOverlay.viaColors} capturedColors={Object.values(capturedFaces).map((face) => face.colors)} mirrored={mirrorPreview} onContinue={continueTurnOverlay} />
                )}
              </div>
              <span class={`capture-live-badge ${liveCapturedFace ? 'pattern-match' : ''}`} role="status">
                <span class="capture-live-dot" />
                Live · {liveCapturedFace ? `Looks like ${FACE_DISPLAY_LABEL[liveCapturedFace]} · capture allowed` : liveDetection
                  ? (liveFaceVisible ? `${(liveDetection.confidence * 100).toFixed(0)}% color match` : captureMode === 'cv' ? 'Align face in view' : 'Align face in guide')
                  : '—'}
                {profileStore.activeColorsId === AUTO_COLORS_ID && liveAutoColorProfile && ` · ${liveAutoColorProfile.name}`}
                {liveMedianWB && ' · median WB'}
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
              <div class="capture-mode-switch" role="group" aria-label="Face detection mode">
                <button type="button" class={captureMode === 'cv' ? 'active' : ''} aria-pressed={captureMode === 'cv'} onClick={() => { setCaptureMode('cv'); setLiveDetection(null); setLiveFaceVisible(false) }}>Detect face</button>
                <button type="button" class={captureMode === 'guide' ? 'active' : ''} aria-pressed={captureMode === 'guide'} onClick={() => { setCaptureMode('guide'); setLiveDetection(null); setLiveFaceVisible(false) }}>Guide grid</button>
              </div>
              <p class="capture-hint-text" aria-live="polite">
                {!centerRoutingActive && <TurnHint step={FACE_ORDER.indexOf(webcamFace)} mirrored={mirrorPreview} />}
                {centerRoutingActive ? 'Show any uncaptured face. Its center color will place it in the capture net.' : captureInstruction(FACE_ORDER.indexOf(webcamFace), mirrorPreview)}
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
                  matchingFaces={matchingNetFaces}
                  liveMatchingFace={liveCapturedFace}
                  size={puzzleSize}
                  predictedCenters={predictedCenters}
                  mirrored={mirrorPreview}
                  onSelect={(slot) => {
                    dismissTurnOverlay()
                    lastCapturedColors.current = null
                    lastCapturedPose.current = null
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
                      lastCapturedColors.current = null
                      lastCapturedPose.current = null
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
                    {' '}{autoSize && !detectedSize ? 'Auto size' : `${puzzleSize}×${puzzleSize}`} · {profile.name} · Sticker colors: {profileStore.activeColorsId === AUTO_COLORS_ID ? `Automatic · preview: ${provisionalColorProfile?.name ?? liveAutoColorProfile?.name ?? 'camera hues'}` : colorProfile.name}
                    {mirrorPreview ? ' · mirrored' : ''}
                  </span>
                </summary>
                <div class="capture-size-row">
                  <label class="capture-size-label" for="cube-profile">Cube:</label>
                  <span class="capture-size-label">{cubeGroupName(profile)}</span>
                  <select
                    id="cube-profile"
                    class="cube-profile-select"
                    value={autoSize ? AUTO_SIZE_OPTION : profile.id}
                    onChange={(e) => { if (!changeCube(e.currentTarget.value)) e.currentTarget.value = autoSize ? AUTO_SIZE_OPTION : profile.id }}
                  >
                    <CubeSelectOptions settings={profileStore} detectedSize={autoSize ? detectedSize : null} />
                  </select>
                  <button
                    type="button"
                    class="btn btn-secondary btn-sm"
                    aria-expanded={newCubeName !== null}
                    onClick={() => setNewCubeName(newCubeName === null ? `${profile.name} copy` : null)}
                  >
                    ＋ New cube
                  </button>
                  <a class="color-review-link" href={profilesHash('cubes')} onClick={() => setWebcamOpen(false)}>Manage profiles…</a>
                </div>
                <div class="capture-size-row">
                  <label class="capture-size-label" for="color-profile">Colors:</label>
                  <select id="color-profile" class="cube-profile-select" value={profileStore.activeColorsId}
                    onChange={(e) => applyProfileStore(selectColorProfile(profileStore, e.currentTarget.value))}>
                    {allColorProfiles(profileStore).map((colors) => <option key={colors.id} value={colors.id}>{colors.name}</option>)}
                  </select>
                  <button type="button" class="btn btn-secondary btn-sm"
                    aria-expanded={newColorProfileName !== null}
                    onClick={() => setNewColorProfileName(newColorProfileName === null ? '' : null)}>
                    ＋ New colors
                  </button>
                  <a class="color-review-link" href={profilesHash('colors')} onClick={() => setWebcamOpen(false)}>Manage profiles…</a>
                </div>
                {newColorProfileName !== null && (
                  <div class="capture-size-row new-cube-form">
                    <label class="capture-size-label" for="new-color-profile-name">Name:</label>
                    <input id="new-color-profile-name" class="cube-profile-name" maxLength={60}
                      placeholder="e.g. GoCube" value={newColorProfileName}
                      onInput={(e) => setNewColorProfileName(e.currentTarget.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleCreateNamedColors() }} />
                    <button type="button" class="btn btn-primary btn-sm" disabled={!newColorProfileName.trim()}
                      onClick={handleCreateNamedColors}>Add colors</button>
                  </div>
                )}
                {newCubeName !== null && (
                  <div class="capture-size-row new-cube-form">
                    <label class="capture-size-label" for="new-cube-name">Name:</label>
                    <input
                      id="new-cube-name"
                      class="cube-profile-name"
                      maxLength={60}
                      value={newCubeName}
                      onInput={(e) => setNewCubeName(e.currentTarget.value)}
                    />
                    <button type="button" class="btn btn-primary btn-sm" disabled={!newCubeName.trim()} onClick={handleCreateCube}>
                      Add cube
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
                      disabled={isBuiltinCube(profile.id)}
                      onChange={(e) => {
                        const name = e.currentTarget.value.trim()
                        if (name) applyProfileStore(saveCube(profileStore, { ...profile, name }))
                      }}
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
                      disabled={isBuiltinCube(profile.id)}
                      onInput={(e) => updateSampling({ ...sampling, stickerCore: 1 - Number(e.currentTarget.value) / 100 })}
                    />
                  </label>
                  {isBuiltinCube(profile.id) && <p class="sampling-setup-hint">To change this gap, choose New cube and save a named copy.</p>}
                  <label class="sampling-slider">
                    <span>Color profile name</span>
                    <input type="text" class="cube-profile-name" maxLength={60}
                      key={profileStore.activeColorsId}
                      defaultValue={profileStore.activeColorsId === AUTO_COLORS_ID ? 'Automatic colors' : colorProfile.name}
                      disabled={profileStore.activeColorsId === AUTO_COLORS_ID || profileStore.activeColorsId === GENERIC_COLORS_ID}
                      onBlur={(e) => {
                        const name = e.currentTarget.value.trim()
                        if (!name) e.currentTarget.value = colorProfile.name
                        else if (name !== colorProfile.name) applyProfileStore(saveColorProfile(profileStore, { ...colorProfile, name }))
                      }}
                      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }} />
                  </label>
                  <p class="sampling-setup-hint">
                    {profileStore.activeColorsId === AUTO_COLORS_ID ? (
                      'Automatic compares the live face with saved colors, then rechecks using all captured faces after each capture. Final colors are calibrated from all six faces.'
                    ) : colorProfile.updatedAt ? (
                      <>
                        Colors learned from {colorProfile.captures} {colorProfile.captures === 1 ? 'capture' : 'captures'}, last updated {new Date(colorProfile.updatedAt).toLocaleString()}.
                      </>
                    ) : profileStore.activeColorsId !== GENERIC_COLORS_ID ? (
                      'This named profile will learn from its first valid, reviewed capture.'
                    ) : (
                      'Generic colors are a read-only starting palette. A reviewed capture can be saved as new colors.'
                    )}
                  </p>
                  {profileStore.colors.some((saved) => saved.id === profileStore.activeColorsId) && (
                    <button type="button" class="link-button"
                      onClick={() => applyProfileStore(deleteColorProfile(profileStore, colorProfile.id))}>
                      Delete this color profile
                    </button>
                  )}
                  <p class="sampling-setup-hint">
                    Hold a face in the square. Each small box should sit fully inside its sticker, and its outline
                    should show that sticker's color. The outer 25% band is left out when balancing colors.
                  </p>
                  <div class="sampling-setup-actions">
                    <button type="button" class="btn btn-secondary btn-sm" onClick={handleDownloadSampling}>
                      ↓ Export cubes &amp; colors
                    </button>
                    <label class="btn btn-secondary btn-sm" title="Load a settings file downloaded earlier">
                      ↑ Import cubes &amp; colors
                      <input type="file" accept=".json,application/json" hidden onChange={handleUploadSampling} />
                    </label>
                    <div class="sampling-setup-actions-spacer" />
                    {!isBuiltinCube(profile.id) && (
                      <button
                        type="button"
                        class="btn btn-secondary btn-sm"
                        title="Forget this cube's settings"
                        onClick={() => applyProfileStore(deleteCube(profileStore, profile.id))}
                      >
                        Delete cube
                      </button>
                    )}
                    {!isBuiltinCube(profile.id) && (
                      <button type="button" class="btn btn-secondary btn-sm" onClick={() => updateSampling(DEFAULT_SAMPLING)}>
                        Reset cube gap
                      </button>
                    )}
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
                {captureMode === 'cv' && (
                  <div class="capture-feedback-settings">
                    <label class="auto-capture-toggle">
                      <input type="checkbox" checked={autoCapture} onChange={(e) => setAutoCapture(e.currentTarget.checked)} />
                      <span>{autoCapture ? `Auto capture · matching frames ${autoCaptureFrames}/${AUTO_CAPTURE_STABLE_FRAMES}${detectingSize ? ' · checking cube size' : autoCapturePaused ? ' · paused' : ''}` : 'Auto capture'}</span>
                    </label>
                    <button type="button" class="capture-sound-toggle" aria-pressed={captureSound} onClick={() => {
                      const enabled = !captureSound
                      setCaptureSound(enabled)
                      try { localStorage.setItem('cube-assembler.capture-sound', enabled ? 'on' : 'off') } catch { /* Storage is optional. */ }
                      armCaptureAudio(enabled)
                    }}>{captureSound ? '🔊 Sound on' : '🔇 Sound off'}</button>
                  </div>
                )}
                {sizeSwitch && Object.keys(capturedFaces).length === 0 && (
                  <div role="status" class="size-switch-notice">
                    <span>Detected a {sizeSwitch.to}×{sizeSwitch.to} cube - switched from {sizeSwitch.from}×{sizeSwitch.from} ({profile.name}).</span>
                    <button type="button" class="btn btn-secondary btn-sm" onClick={() => {
                      setAutoSize(false)
                      changePuzzleSize(sizeSwitch.from)
                      setSizeSwitch(null)
                    }}>Undo</button>
                  </div>
                )}
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
                  {loading ? '⏳ Processing...' : autoCapture && captureMode === 'cv' ? 'Capture now' : `Capture ${FACE_DISPLAY_LABEL[webcamFace].toLowerCase()}`}
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
        const { candidates, arrangements, valid, note, suggestedFrom } = orientationApproval
        const close = () => setOrientationApproval(null)
        const checkFace = (candidate: OrientedCandidate, face: string) => {
          const slot = findCaptureSlotForOrientedFace(
            FACE_ORDER.map((key) => capturedFaces[key]?.colors), candidate.faces[face as FaceKey]
          )
          if (slot === null) return
          setOrientationApproval(null)
          setReviewStep(slot)
          setReviewEditingCell(null)
          setReviewNotice(null)
          setShowReviewDialog(true)
        }
        const single = candidates.length === 1
        const page = Math.min(orientationApproval.page ?? 0, Math.floor((candidates.length - 1) / ORIENTATION_CHOICES_PER_PAGE))
        const first = page * ORIENTATION_CHOICES_PER_PAGE
        const shown = candidates.map((candidate, i) => ({ candidate, i })).slice(first, first + ORIENTATION_CHOICES_PER_PAGE)
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
              <p class="orientation-approval-note">Tap any face to check its colors or retake that photo.</p>
              {!note && single && valid && (
                <p class="orientation-approval-note">
                  {suggestedFrom && suggestedFrom > 1
                    ? 'This is the likely fit if you followed the turning guide. If it looks wrong, choose each side.'
                    : 'The photos fit together one way.'}
                  {puzzleSize % 2 === 1 && ' Hold your cube with white on top and green in front to compare.'}
                </p>
              )}
              {!single && valid && (
                <p class="orientation-approval-note">
                  The photos fit your cube in {candidates.length} different ways. Compare two at a time.
                </p>
              )}
              {single ? (
                <div class="approval-single">
                  <div class="approval-net">
                    <OrientationNetPreview faces={candidates[0].faces} onFaceClick={(face) => checkFace(candidates[0], face)} />
                  </div>
                  {arrangements?.[0] && (
                    <div class="approval-changes">
                      <span class="approval-changes-title">How the photos were put together</span>
                      <ul class="approval-checklist">
                        {describeArrangement(arrangements[0], mirrorPreview).map((line) => (
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
              <>
              <div class="orientation-approval-options">
                {shown.map(({ candidate, i }) => (
                  <div key={i} class="orientation-approval-option">
                    <OrientationNetPreview faces={candidate.faces} onFaceClick={(face) => checkFace(candidate, face)} />
                    {arrangements?.[i] && (
                      <ul class="orientation-approval-changes">
                        {describeArrangement(arrangements[i], mirrorPreview).map((line) => <li key={line}>{line}</li>)}
                      </ul>
                    )}
                    <button type="button" class="btn btn-primary btn-sm" onClick={() => handleChooseOrientation(candidate)}>
                      {valid ? 'This one' : 'Use it anyway'}
                    </button>
                  </div>
                ))}
              </div>
              {candidates.length > ORIENTATION_CHOICES_PER_PAGE && (
                <div class="orientation-choice-pages">
                  <button type="button" class="btn btn-secondary btn-sm" disabled={page === 0}
                    onClick={() => setOrientationApproval((prev) => prev && { ...prev, page: page - 1 })}>Previous two</button>
                  <span>Options {first + 1}–{Math.min(first + ORIENTATION_CHOICES_PER_PAGE, candidates.length)} of {candidates.length}</span>
                  <button type="button" class="btn btn-secondary btn-sm" disabled={first + ORIENTATION_CHOICES_PER_PAGE >= candidates.length}
                    onClick={() => setOrientationApproval((prev) => prev && { ...prev, page: page + 1 })}>Next two</button>
                </div>
              )}
              </>
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
                onKeyDown={(e) => handleModalKeyDown(e, e.currentTarget, () => setOrientationWizard(null))}
              >
                <div class="modal-header">
                  <h2>Which orientation matches your cube?</h2>
                  <button class="modal-close" aria-label="Close" onClick={() => setOrientationWizard(null)}>×</button>
                </div>
                <div class="orientation-picker-grid">
                  {remaining.slice(0, 1).map((alt, i) => (
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
        const page = Math.min(orientationWizard.page ?? 0, Math.floor((options.length - 1) / ORIENTATION_CHOICES_PER_PAGE))
        const first = page * ORIENTATION_CHOICES_PER_PAGE

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
                {options.slice(first, first + ORIENTATION_CHOICES_PER_PAGE).map((opt, i) => (
                  <button
                    key={first + i}
                    type="button"
                    class="orientation-picker-option orientation-wizard-option"
                    aria-label={`Option ${first + i + 1} for the ${FACE_LABELS[askingFace]} face`}
                    disabled={wizardMorphing}
                    onClick={(e) => handleWizardPick(e.currentTarget, opt.candidates, askingFace)}
                  >
                    <FaceGrid colors={opt.grid} />
                  </button>
                ))}
              </div>
              {options.length > ORIENTATION_CHOICES_PER_PAGE && (
                <div class="orientation-choice-pages">
                  <button type="button" class="btn btn-secondary btn-sm" disabled={page === 0 || wizardMorphing}
                    onClick={() => setOrientationWizard((prev) => prev && { ...prev, page: page - 1 })}>Previous two</button>
                  <span>Options {first + 1}–{Math.min(first + ORIENTATION_CHOICES_PER_PAGE, options.length)} of {options.length}</span>
                  <button type="button" class="btn btn-secondary btn-sm" disabled={first + ORIENTATION_CHOICES_PER_PAGE >= options.length || wizardMorphing}
                    onClick={() => setOrientationWizard((prev) => prev && { ...prev, page: page + 1 })}>Next two</button>
                </div>
              )}
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

      {/* What a fixture zip holds, before it's downloaded */}
      {fixtureDownload && (
        <div class="modal open">
          <div
            class="modal-content fixture-download-content"
            role="dialog"
            aria-modal="true"
            aria-labelledby="fixture-download-title"
            tabIndex={-1}
            ref={focusModalOnOpen}
            onKeyDown={(e) => handleModalKeyDown(e, e.currentTarget, closeFixtureDownload)}
          >
            <div class="modal-header">
              <h2 id="fixture-download-title">Save as test fixture</h2>
              <button class="modal-close" aria-label="Close" onClick={closeFixtureDownload}>×</button>
            </div>
            <p class="fixture-download-file">
              <code>{fixtureDownload.name}.zip</code> · {formatBytes(fixtureDownload.zip.length)}
            </p>
            <ul class="fixture-download-photos" aria-label="Photos in the zip">
              {fixtureDownload.summary.photos.map((photo, i) => (
                <li key={photo.face}>
                  <img src={fixtureDownload.photoUrls[i]} alt={`${FACE_DISPLAY_LABEL[photo.face.toUpperCase()]} photo`} />
                  <span>{FACE_DISPLAY_LABEL[photo.face.toUpperCase()]}</span>
                  <span class="fixture-download-meta">{photo.file} · {formatBytes(photo.bytes.length)}</span>
                </li>
              ))}
            </ul>
            <dl class="fixture-download-summary">
              {fixtureDownload.summary.rows.map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            <p class="fixture-download-hint">
              {import.meta.env.DEV ? <>Upload to <code>test/fixtures/</code> using the localhost server, or download the ZIP.</> : <>Unzip it into <code>test/fixtures/</code> to add it to the tests.</>}
              {' '}The main-page <strong>Upload fixture</strong> action loads it back into the app.
            </p>
            {import.meta.env.DEV && fixtureServerChecked && !fixtureServerReachable && (
              <p role="status" class="fixture-download-hint">Upload server offline · run <code>npm run fixture:server</code>.</p>
            )}
            {fixtureUploadMessage && <p role="status" class="capture-message error">{fixtureUploadMessage}</p>}
            <div class="input-actions">
              <button type="button" class="btn btn-secondary btn-sm" onClick={closeFixtureDownload}>Cancel</button>
              {import.meta.env.DEV && (
                <button type="button" class="btn btn-primary btn-sm" disabled={!fixtureServerReachable || fixtureUploading} onClick={uploadFixture}>
                  {fixtureUploading ? 'Uploading...' : fixtureServerChecked ? 'Upload to localhost' : 'Checking upload server...'}
                </button>
              )}
              <button type="button" class="btn btn-secondary btn-sm" onClick={downloadFixture}>Download zip</button>
            </div>
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

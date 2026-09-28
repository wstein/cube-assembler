import {
  ALIGNMENT_MAX_OFFSET,
  alignFace,
  faceCornersIfBetter,
  type GridAlignment,
} from './gridAlignment'
import { warpQuadToSquare } from './perspective'
import { type RGB } from './stickerColorGeometry'
import {
  linearChannelToSrgb,
  srgbChannelToLinear,
  rgbToOklab,
  rgbToOKLCH,
  NEUTRAL_GAINS,
  type Oklab,
} from './colorMath'

export interface FaceBounds {
  startX: number
  startY: number
  faceWidth: number
  faceHeight: number
  // Tilt (radians, canvas rotate() direction) about the square's center;
  // the square is read turned upright.
  angle?: number
  // A face seen at an angle: its corners (top-left, top-right, bottom-right,
  // bottom-left) in the frame's pixels. When set, the face is read
  // straightened through them (see warpQuadToSquare) instead of the square.
  corners?: [number, number][]
  // Set by seam alignment. False means the returned guide is only a
  // placeholder; Detect face must not capture it as an automatic result.
  gridFound?: boolean
  // A seam fit was rejected because its outer lines missed the face edge.
  needsRecentering?: boolean
}

interface FaceRegion extends FaceBounds {
  imageData: ImageData
}

// Fraction of the frame (of min(width,height)) the sticker guide square
// covers - the ONLY thing extractColorsFromImageData ever samples for
// classification.
const SAMPLE_FACE_FRACTION = 0.6

// Cube face is assumed centered in frame, matching the fixed guide square
// shown to the user during capture (see capture-grid-overlay in index.tsx).
// `fraction` defaults to the sticker guide square itself.
export function computeFaceBounds(
  canvas: HTMLCanvasElement,
  fraction = SAMPLE_FACE_FRACTION,
): FaceBounds {
  return guideBounds(canvas.width, canvas.height, fraction)
}

// computeFaceBounds for a frame of the given size.
export function guideBounds(
  width: number,
  height: number,
  fraction = SAMPLE_FACE_FRACTION,
): FaceBounds {
  const centerX = width / 2
  const centerY = height / 2
  const faceSize = Math.min(width, height) * fraction

  const startX = Math.max(0, centerX - faceSize / 2)
  const startY = Math.max(0, centerY - faceSize / 2)
  const endX = Math.min(width, startX + faceSize)
  const endY = Math.min(height, startY + faceSize)

  // Rounded to integers - getImageData(sx, sy, sw, sh) takes doubles, but
  // the ImageData it returns is necessarily integer-pixel-sized, so a
  // caller that reuses these fractional bounds as BOTH the getImageData
  // argument AND its own manual (row * width + col) pixel-index math (as
  // extractBackgroundColor's background-area scan did, unlike the
  // sticker-cell scan in extractColorsFromImageData, which stays safely
  // inset from any edge) risks the two disagreeing on the actual row
  // stride - drifting further off with every row until it reads past the real buffer end
  // (silently `undefined`, poisoning every downstream sum to NaN). Round
  // once here so every consumer agrees on the same integer bounds.
  return {
    startX: Math.round(startX),
    startY: Math.round(startY),
    faceWidth: Math.round(endX - startX),
    faceHeight: Math.round(endY - startY),
  }
}

// The guide square moved onto the cube's actual sticker grid (see
// findGridAlignment), so a face held a little off-center or away from the
// camera is still sampled cell by cell. Falls back to the guide itself when
// no convincing grid shows. Exported so one live frame is aligned once for
// both extractCubeFaceColors and hasVisibleCubeFace.
export function alignedFaceBounds(
  canvas: HTMLCanvasElement,
  gridSize: number,
): FaceBounds {
  const guide = computeFaceBounds(canvas)
  const ctx = canvas.getContext('2d')
  if (!ctx || guide.faceWidth !== guide.faceHeight)
    return { ...guide, gridFound: false }
  const area = alignmentArea(guide, canvas.width, canvas.height)
  const region = ctx.getImageData(
    area.x0,
    area.y0,
    area.x1 - area.x0,
    area.y1 - area.y0,
  )
  return alignedBoundsInArea(
    region.data,
    region.width,
    region.height,
    guide,
    area,
    gridSize,
    canvas.width,
    canvas.height,
  )
}

// The part of a width x height frame searched around `guide`: room for
// the largest offset plus the largest face (1.12x the guide), and for the
// corners of a tilted one.
export function alignmentArea(
  guide: FaceBounds,
  width: number,
  height: number,
): { x0: number; y0: number; x1: number; y1: number } {
  const margin = Math.ceil(
    guide.faceWidth * (ALIGNMENT_MAX_OFFSET + 0.06 + 0.2),
  )
  return {
    x0: Math.max(0, guide.startX - margin),
    y0: Math.max(0, guide.startY - margin),
    x1: Math.min(width, guide.startX + guide.faceWidth + margin),
    y1: Math.min(height, guide.startY + guide.faceHeight + margin),
  }
}

// alignFace on `data`, the alignmentArea's pixels.
export function alignFaceInArea(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  guide: FaceBounds,
  area: { x0: number; y0: number },
  gridSize: number,
): GridAlignment {
  return alignFace(
    data,
    width,
    height,
    {
      x: guide.startX - area.x0,
      y: guide.startY - area.y0,
      size: guide.faceWidth,
    },
    gridSize,
  )
}

// The frame bounds an alignment (found in `area`) leads to.
export function boundsFromAlignment(
  found: GridAlignment,
  guide: FaceBounds,
  area: { x0: number; y0: number },
  width: number,
  height: number,
  corners?: [number, number][] | null,
): FaceBounds {
  const angle = found.angle
  if (!found.aligned && !angle)
    return {
      ...guide,
      gridFound: found.seams,
      ...(found.needsRecentering && { needsRecentering: true }),
    }
  const size = Math.round(found.size)
  // Keep the square's center on the canvas; a tilted square is read through
  // a rotation, which clamps nothing else.
  const centerX = Math.min(
    width - size / 2,
    Math.max(size / 2, area.x0 + found.center[0]),
  )
  const centerY = Math.min(
    height - size / 2,
    Math.max(size / 2, area.y0 + found.center[1]),
  )
  return {
    startX: Math.round(centerX - size / 2),
    startY: Math.round(centerY - size / 2),
    faceWidth: size,
    faceHeight: size,
    ...(angle && { angle }),
    ...(corners && {
      corners: corners.map(
        ([x, y]) => [area.x0 + x, area.y0 + y] as [number, number],
      ),
    }),
    gridFound: found.seams,
    ...(found.needsRecentering && { needsRecentering: true }),
  }
}

// The face in the alignment area: its aligned square, and its corners when
// it is seen at an angle and straightening helps (see faceCornersIfBetter).
export function alignedBoundsInArea(
  region: Uint8ClampedArray,
  regionWidth: number,
  regionHeight: number,
  guide: FaceBounds,
  area: { x0: number; y0: number },
  gridSize: number,
  width: number,
  height: number,
): FaceBounds {
  const found = alignFaceInArea(
    region,
    regionWidth,
    regionHeight,
    guide,
    area,
    gridSize,
  )
  const corners =
    found.seams && found.aligned
      ? faceCornersIfBetter(region, regionWidth, regionHeight, found, gridSize)
      : null
  return boundsFromAlignment(found, guide, area, width, height, corners)
}

export type FaceGeometryMode = 'aligned' | 'fixed'

// Shared by the live overlay and both capture sources. A manual guide always
// samples its drawn square; the default scanner searches nearby grid seams.
export function faceBoundsForMode(
  canvas: HTMLCanvasElement,
  gridSize: number,
  mode: FaceGeometryMode,
): FaceBounds {
  return mode === 'fixed'
    ? computeFaceBounds(canvas)
    : alignedFaceBounds(canvas, gridSize)
}

// Draws the square of `bounds` from `canvas` onto a new canvas of its size,
// turned upright when it is tilted.
function drawFaceSquare(
  canvas: HTMLCanvasElement,
  bounds: FaceBounds,
): HTMLCanvasElement {
  const out = document.createElement('canvas')
  out.width = bounds.faceWidth
  out.height = bounds.faceHeight
  const ctx = out.getContext('2d')
  if (!ctx) {
    throw new Error('Could not get canvas context')
  }
  if (bounds.corners) {
    // Straightened through the corners, from the pixels around them.
    const xs = bounds.corners.map(([x]) => x),
      ys = bounds.corners.map(([, y]) => y)
    const x0 = Math.max(0, Math.floor(Math.min(...xs)) - 1),
      y0 = Math.max(0, Math.floor(Math.min(...ys)) - 1)
    const x1 = Math.min(canvas.width, Math.ceil(Math.max(...xs)) + 1),
      y1 = Math.min(canvas.height, Math.ceil(Math.max(...ys)) + 1)
    const source = canvas
      .getContext('2d')
      ?.getImageData(x0, y0, x1 - x0, y1 - y0)
    if (!source) throw new Error('Could not get canvas context')
    const pixels = warpQuadToSquare(
      source.data,
      source.width,
      source.height,
      bounds.corners.map(([x, y]) => [x - x0, y - y0]),
      bounds.faceWidth,
    )
    ctx.putImageData(
      new ImageData(
        pixels as Uint8ClampedArray<ArrayBuffer>,
        bounds.faceWidth,
        bounds.faceWidth,
      ),
      0,
      0,
    )
  } else if (bounds.angle) {
    ctx.translate(bounds.faceWidth / 2, bounds.faceHeight / 2)
    ctx.rotate(-bounds.angle)
    ctx.drawImage(
      canvas,
      -(bounds.startX + bounds.faceWidth / 2),
      -(bounds.startY + bounds.faceHeight / 2),
    )
  } else {
    ctx.drawImage(
      canvas,
      bounds.startX,
      bounds.startY,
      bounds.faceWidth,
      bounds.faceHeight,
      0,
      0,
      bounds.faceWidth,
      bounds.faceHeight,
    )
  }
  return out
}

export function readFaceRegion(
  canvas: HTMLCanvasElement,
  bounds: FaceBounds,
): FaceRegion {
  const drawn = Boolean(bounds.angle || bounds.corners)
  const source = drawn ? drawFaceSquare(canvas, bounds) : canvas
  const ctx = source.getContext('2d')
  if (!ctx) {
    throw new Error('Could not get canvas context')
  }
  return {
    ...bounds,
    imageData: drawn
      ? ctx.getImageData(0, 0, bounds.faceWidth, bounds.faceHeight)
      : ctx.getImageData(
          bounds.startX,
          bounds.startY,
          bounds.faceWidth,
          bounds.faceHeight,
        ),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Background-based cross-face correction
//
// The area around the cube (table, wall, backdrop) stays the SAME physical
// surface across all 6 face captures, unlike the cube's own stickers (whose
// colors are exactly what's being measured, and can't double as a
// reference). Sampling it doesn't require knowing what color it "should"
// be (unlike the gray-world estimate this replaced, which wrongly assumed
// the whole scene averages to neutral gray) - only that it's CONSTANT, so
// any difference between how one face's backdrop reads and the others' is
// illumination/camera drift rather than scene content.
// See the 2026-09-23 real-fixture design discussion ("G1").
// ─────────────────────────────────────────────────────────────────────────────

// Band around the detected cube that's always left out of the background
// sample, as a fraction of the face's side on each side: the cube's own
// body (its other sides show at any angle) and the fingers holding it sit
// right around the face, and neither is the constant backdrop the white
// balance relies on.
export const BACKGROUND_CUBE_GAP = 0.25

// Every BACKGROUND_STRIDE-th pixel in each direction is sampled - the
// trimmed mean needs a representative sample, not all ~2M pixels of a
// 1080p frame.
const BACKGROUND_STRIDE = 2

// The backdrop's color on a LIVE captured frame: the trimmed mean of the
// whole frame outside the detected face (the guide square without one),
// its rotated bounding box grown by BACKGROUND_CUBE_GAP of
// its side on each side. The whole remaining frame rather than a band near
// the cube, so one local contamination (a shadow, a reflection) is averaged
// out instead of skewing the reading. Null if the frame is too small, too
// little of it is left, or it reads too dark to be a reliable reference.
// Only meaningful on a live, uncropped canvas - a stored croppedImage (see
// cropFaceRegionToDataUrl) has no background left - so it's captured once
// at capture time (captureAndProcessCanvas / captureAndProcessImage).
export function extractBackgroundColor(
  canvas: HTMLCanvasElement,
  face: FaceBounds = computeFaceBounds(canvas),
): RGB | null {
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const { width, height } = canvas
  if (width < 40 || height < 40) return null
  return extractBackgroundColorFromPixels(
    ctx.getImageData(0, 0, width, height).data,
    width,
    height,
    face,
  )
}

// The live worker already owns the raw frame pixels, so it can take the
// same backdrop reading without creating another canvas or copying a frame.
export function extractBackgroundColorFromPixels(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  face: FaceBounds,
): RGB | null {
  if (width < 40 || height < 40) return null

  const gap = BACKGROUND_CUBE_GAP
  const turn = face.angle ?? 0
  const half =
    (face.faceWidth / 2) *
      (Math.abs(Math.cos(turn)) + Math.abs(Math.sin(turn))) +
    gap * face.faceWidth
  const cx = face.startX + face.faceWidth / 2,
    cy = face.startY + face.faceHeight / 2
  const left = cx - half,
    right = cx + half,
    top = cy - half,
    bottom = cy + half

  const pixels: RGB[] = []
  for (let y = 0; y < height; y += BACKGROUND_STRIDE) {
    const inCubeRow = y >= top && y < bottom
    for (let x = 0; x < width; x += BACKGROUND_STRIDE) {
      if (inCubeRow && x >= left && x < right) continue
      const idx = (y * width + x) * 4
      pixels.push({ r: data[idx], g: data[idx + 1], b: data[idx + 2] })
    }
  }
  // Too little backdrop left (the cube fills the frame) to stand for it.
  if (
    pixels.length <
    0.05 * (width / BACKGROUND_STRIDE) * (height / BACKGROUND_STRIDE)
  )
    return null

  const mean = trimmedMeanColor(pixels)
  if (
    !mean ||
    !Number.isFinite(mean.r) ||
    !Number.isFinite(mean.g) ||
    !Number.isFinite(mean.b)
  )
    return null
  const luminance = 0.2126 * mean.r + 0.7152 * mean.g + 0.0722 * mean.b
  if (luminance < 5) return null // too dark to be a reliable reference
  return mean
}

// Largest per-channel correction (and 1/this the smallest) a background
// gain may apply. The background patch is only a rough gray card - it
// picks up the cube's own colored reflections and exposure changes - so
// a strong gain overcorrects: the 7x7 fixture capture-2026-09-23T10-23-06
// had B's red gain at 1.56, which pushed its reds into orange territory
// (and clipped 42 sticker readings at 255), leaving a Red/Orange pair so
// close to the boundary that decoding the same JPEG with a different
// decoder flipped it. Sweeping every local fixture that recorded gains,
// 1.3 widened or kept the worst Red/Orange margin on all of them (the old
// 0.6-1.8 was the loosest), while no gain at all broke
// capture-2026-09-23T04-17-08 - so some correction is still needed.
// That limit was set on sRGB values; gains now scale linear light (see
// applyGains), where the same strength is 1.3^2.2.
const MAX_BACKGROUND_GAIN = 1.3 ** 2.2

// Clamps a background-derived gain into [1/MAX_BACKGROUND_GAIN,
// MAX_BACKGROUND_GAIN]. Exported so gains recorded by older captures
// (clamped to the old, looser range) replay with today's limit too.
// Falls back to a neutral (1) gain for any channel that comes out
// non-finite, rather than propagating NaN/Infinity into applyGains -
// which would silently corrupt every pixel it touches (NaN * anything
// is NaN) rather than merely leaving that channel uncorrected. A real
// instance of this (a getImageData/manual-indexing stride mismatch,
// since fixed at the source in computeFaceBounds) reached exactly this
// failure mode on a live capture.
export function limitBackgroundGain(gains: RGB): RGB {
  const clampGain = (g: number) =>
    Number.isFinite(g)
      ? Math.max(1 / MAX_BACKGROUND_GAIN, Math.min(MAX_BACKGROUND_GAIN, g))
      : 1
  return { r: clampGain(gains.r), g: clampGain(gains.g), b: clampGain(gains.b) }
}

// How background white balance is computed, saved with fixtures so only
// gains made this way are replayed (older captures recorded gains relative
// to face 1 over a region without a gap to the cube, which swapped red and
// orange on real captures; v1 gains were sRGB ratios, v2 are linear).
export const BACKGROUND_WB_METHOD = 'median-around-cube/v2'

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

// Per-face gains that bring each face's backdrop to the median backdrop of
// all faces - the median rather than face 1, so one odd reading (a hand in
// the frame, a shadow) moves only its own face, and the corrections stay
// small. On the saved fixtures' backdrop readings it misread 15 stickers
// against 17 without gains and 19 relative to face 1. A face without a
// backdrop reading stays neutral; null with fewer than 3 readings.
const linearRgb = (bg: RGB) => ({
  r: srgbChannelToLinear(bg.r),
  g: srgbChannelToLinear(bg.g),
  b: srgbChannelToLinear(bg.b),
})

// The median backdrop in linear light, or null with fewer than 3 readings.
function linearBackdropReference(
  backgrounds: Record<string, RGB | null | undefined>,
): RGB | null {
  const lin = Object.values(backgrounds)
    .filter((bg): bg is RGB => !!bg)
    .map(linearRgb)
  if (lin.length < 3) return null
  return {
    r: median(lin.map((bg) => bg.r)),
    g: median(lin.map((bg) => bg.g)),
    b: median(lin.map((bg) => bg.b)),
  }
}

// The backdrop every face is brought to (see computeBackgroundGains), in sRGB.
export function backdropReference(
  backgrounds: Record<string, RGB | null | undefined>,
): RGB | null {
  const reference = linearBackdropReference(backgrounds)
  return (
    reference && {
      r: linearChannelToSrgb(reference.r),
      g: linearChannelToSrgb(reference.g),
      b: linearChannelToSrgb(reference.b),
    }
  )
}

export function computeBackgroundGains(
  backgrounds: Record<string, RGB | null | undefined>,
): Record<string, RGB> | null {
  // Ratios of linear light, like the gains are applied (see applyGains).
  const reference = linearBackdropReference(backgrounds)
  if (!reference) return null
  const floor = srgbChannelToLinear(1)
  return Object.fromEntries(
    Object.entries(backgrounds).map(([face, bg]) => {
      if (!bg) return [face, NEUTRAL_GAINS]
      const l = linearRgb(bg)
      return [
        face,
        limitBackgroundGain({
          r: reference.r / Math.max(floor, l.r),
          g: reference.g / Math.max(floor, l.g),
          b: reference.b / Math.max(floor, l.b),
        }),
      ]
    }),
  )
}

// Crops just the analyzed face region out of a captured frame, for showing
// the user what was actually sampled (e.g. in a post-capture review step) —
// independent of extractCubeFaceColors, so it costs nothing on the
// high-frequency live-preview path that doesn't need an image, only text.
export const CROP_JPEG_QUALITY = 1

export function cropFaceRegionToDataUrl(
  canvas: HTMLCanvasElement,
  bounds: FaceBounds = computeFaceBounds(canvas),
): string {
  const out = drawFaceSquare(canvas, bounds)
  // Quality 1 is the only setting at which Chrome keeps full-resolution
  // color (4:4:4); anything below stores chroma at half resolution (4:2:0),
  // and decoders then disagree on how to upsample it - jpeg-js vs Chrome
  // differed by up to 25 levels at sticker edges at 0.85, by at most 3 at
  // 1. This image is the source of truth that recalibration and saved
  // fixtures re-analyze, so it's worth the ~4x size (~200 KB for a 648px
  // crop from 1080p).
  return out.toDataURL('image/jpeg', CROP_JPEG_QUALITY)
}

// Fraction of a cell's sampled pixels discarded from each luminance
// extreme before averaging - rejects glare (a specular highlight off the
// sticker's glossy plastic, reading far brighter than the sticker's true
// color) and shadow/bleed (reading far darker) outliers a plain mean
// would blend straight in, pulling the reading toward whichever extreme
// happened to be present. 15% each end (a standard "trimmed mean"
// choice) is aggressive enough to reject a real highlight streak - which
// only ever covers a minority of a sticker's sampled area - without
// discarding so much that a genuinely uniform, glare-free sticker's
// estimate gets noisier for no reason.
const OUTLIER_TRIM_FRACTION = 0.15

// Averages pixel colors after discarding the brightest/darkest tails by
// luminance, instead of a plain mean over every sampled pixel - see
// OUTLIER_TRIM_FRACTION above. Exported for direct unit testing (pure,
// DOM-free), matching how this file's other small numeric helpers are
// tested rather than only indirectly through the canvas-touching
// functions that call them.
export function trimmedMeanColor(
  pixels: RGB[],
  trimFraction = OUTLIER_TRIM_FRACTION,
): RGB | null {
  if (pixels.length === 0) return null
  const byLuminance = [...pixels].sort(
    (a, b) =>
      0.2126 * a.r +
      0.7152 * a.g +
      0.0722 * a.b -
      (0.2126 * b.r + 0.7152 * b.g + 0.0722 * b.b),
  )
  const trimCount = Math.floor(pixels.length * trimFraction)
  // Only trim when there's enough left afterward - never let trimming
  // itself produce an empty (or asymmetric/degenerate) result on a very
  // small sample.
  const kept =
    trimCount * 2 < pixels.length
      ? byLuminance.slice(trimCount, pixels.length - trimCount)
      : byLuminance
  let sumR = 0,
    sumG = 0,
    sumB = 0
  for (const p of kept) {
    sumR += p.r
    sumG += p.g
    sumB += p.b
  }
  return { r: sumR / kept.length, g: sumG / kept.length, b: sumB / kept.length }
}

// A sticker's color from its sampled pixels. Glossy stickers can mirror a
// lamp or window across half their area, and that reflection isn't just
// bright - on a real capture it turned red and orange stickers alike pale
// pink-purple (e.g. an orange read as rgb(209,134,198)), more than the
// trimmed mean's 15% tails can reject. The sticker's own color survives in
// its most colorful pixels, so a colored sticker is measured from the
// most colorful STICKER_CORE_SATURATED_FRACTION of them (ranked by RGB
// channel spread, which ranks like OKLab chroma here at a fraction of the
// cost - this runs on every live-preview frame). A near-white sticker
// (trimmed-mean chroma below STICKER_WHITE_CHROMA) keeps the trimmed mean:
// its "most colorful" pixels are only colored fringes. On the real
// fixtures this fixed a glare capture (6 misreads -> 0) and a 2x2 (2 -> 0)
// with every clean capture unchanged; 25-35% and 0.06-0.08 all scored the
// same, these are the middle.
const STICKER_CORE_SATURATED_FRACTION = 0.3
const STICKER_WHITE_CHROMA = 0.07

// Names how stickerColor measures, saved with fixtures next to their
// per-sticker readings: readings from an older measurement can't be
// compared with today's. (Fixtures without it used the plain trimmed mean.)
export const STICKER_MEASUREMENT = 'colorful-30/v1'

export function stickerColor(pixels: RGB[]): RGB | null {
  const plain = trimmedMeanColor(pixels)
  if (!plain || rgbToOKLCH(plain).c < STICKER_WHITE_CHROMA) return plain
  const spread = (c: RGB) => Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b)
  const colorful = [...pixels]
    .sort((a, b) => spread(b) - spread(a))
    .slice(0, Math.ceil(pixels.length * STICKER_CORE_SATURATED_FRACTION))
  return {
    r: colorful.reduce((sum, c) => sum + c.r, 0) / colorful.length,
    g: colorful.reduce((sum, c) => sum + c.g, 0) / colorful.length,
    b: colorful.reduce((sum, c) => sum + c.b, 0) / colorful.length,
  }
}

// Center pieces of odd cubes carry the maker's logo, often large and in a
// sticker color. On a GAN white center the blue logo pulled the cap's mean
// to blue, and stickerColor's colorful-core step then picked exactly the
// logo pixels (98% "blue"). This splits the cell into two color groups
// (2-means in OKLab, seeded by its lightest and its most colorful pixel)
// and measures only the larger one, the cap; over the wider CENTER_CORE
// the cap's plain ring outnumbers the logo (72-75% vs 25-28% on the GAN
// cap, 54-62% with the usual core). A plain sticker splits into two halves
// of its own color, so its reading barely moves.
export const CENTER_CORE = 0.85
export function centerStickerColor(pixels: RGB[]): RGB | null {
  if (pixels.length < 8) return stickerColor(pixels)
  const step = Math.max(1, Math.floor(pixels.length / 4000))
  const sample = pixels.filter((_, i) => i % step === 0)
  const lab = sample.map((p) => rgbToOklab(p))
  const chroma = (c: Oklab) => Math.hypot(c.a, c.b)
  let seeds = [
    lab.reduce((best, c) => (c.l > best.l ? c : best)),
    lab.reduce((best, c) => (chroma(c) > chroma(best) ? c : best)),
  ]
  let groups: number[] = []
  for (let iteration = 0; iteration < 8; iteration++) {
    groups = lab.map((c) => {
      const d = seeds.map(
        (seed) =>
          (c.l - seed.l) ** 2 + (c.a - seed.a) ** 2 + (c.b - seed.b) ** 2,
      )
      return d[0] <= d[1] ? 0 : 1
    })
    seeds = [0, 1].map((g) => {
      const members = lab.filter((_, i) => groups[i] === g)
      if (members.length === 0) return seeds[g]
      return {
        l: members.reduce((sum, c) => sum + c.l, 0) / members.length,
        a: members.reduce((sum, c) => sum + c.a, 0) / members.length,
        b: members.reduce((sum, c) => sum + c.b, 0) / members.length,
      }
    })
  }
  const larger =
    groups.filter((g) => g === 0).length >= groups.length / 2 ? 0 : 1
  return stickerColor(sample.filter((_, i) => groups[i] === larger))
}

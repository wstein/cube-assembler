import {
  DEFAULT_SAMPLING,
  STICKER_COLORS,
  type ColorDetectionResult,
  type RGB,
  type SamplingGeometry,
} from './stickerColorGeometry'
import {
  type LearnedColors,
  type StickerSample,
  learnStickerColors,
  clearStickerColors,
  glareStickers,
  hungarianAssignment,
  balancedAssign,
} from './stickerLearning'
import {
  NEUTRAL_GAINS,
  clusterDistance,
  CONFIDENCE_DISTANCE_SCALE,
} from './colorMath'
import { limitBackgroundGain } from './faceSampling'
import { redetectFaceColors } from './faceDetection'

export interface LearnedColorClassificationResult {
  learned: LearnedColors | null
  applied: boolean
  faces: Record<string, ColorDetectionResult>
  // Stickers glare washed out (see glareStickers).
  glare: Array<{ face: string; row: number; col: number }>
}

/**
 * Runs the full post-capture recalibration pass: redetects every face's
 * stored snapshot from scratch (ignoring whatever WB preset/auto-estimate
 * was live-applied during capture — that was only ever a capture-time aid
 * for the user, not something this pass should inherit), learns each
 * color's actual RGB from all 6 faces' stickers together
 * (learnStickerColors), then reclassifies every sticker against those
 * learned colors instead of the hardcoded canonical palette — relabeling
 * only, no re-extraction, since the raw per-cell RGB doesn't change.
 * Falls back to the neutral-gain/hardcoded-palette baseline
 * (`applied: false`) if there aren't enough stickers to cluster reliably.
 *
 * `faceGains`, when given, redetects each face with that face's own gain
 * instead of NEUTRAL_GAINS for all of them - the background-based
 * cross-face correction: face 1 is the
 * reference (gain 1,1,1), later faces get whatever gain would make their
 * OWN background patch read the same as face 1's did. A face missing from
 * `faceGains` (background unavailable that shot) falls back to neutral.
 */
// How well `rgb` matches each of the 6 colors, 0-1 on the same scale as
// cellConfidences - for showing a human how plausible each alternative is
// when fixing a sticker. `palette` is the learned colors when the
// cross-face recalibration ran, the canonical ones otherwise.
export function colorConfidences(
  rgb: RGB,
  palette: Record<string, RGB> = STICKER_COLORS,
): Record<string, number> {
  return Object.fromEntries(
    Object.entries(palette).map(([color, centroid]) => [
      color,
      Math.max(
        0,
        1 - clusterDistance(rgb, centroid) / CONFIDENCE_DISTANCE_SCALE,
      ),
    ]),
  )
}

// How different two 6-color palettes are: the mean distance between their
// same-named colors, in the clustering metric. Used to tell which saved
// cube profile a capture's learned colors most resemble.
export function paletteDistance(
  a: Record<string, RGB>,
  b: Record<string, RGB>,
): number {
  const keys = Object.keys(a).filter((k) => b[k])
  if (keys.length === 0) return Infinity
  return (
    keys.reduce((sum, k) => sum + clusterDistance(a[k], b[k]), 0) / keys.length
  )
}

// How far along the way from its own learned color to the nearest other
// one a sticker may sit before it's worth a second look: distance to its
// own color divided by distance to the nearest other. 0 is dead center,
// 1 is exactly on the boundary.
export const LOOKALIKE_RATIO = 0.6

// The nearest learned color other than `label`, and how close `rgb` is to
// the boundary with it (see LOOKALIKE_RATIO).
export function nearestOtherColor(
  rgb: RGB,
  label: string,
  colors: Record<string, RGB>,
): { color: string; ratio: number } | null {
  const own = colors[label]
  if (!own) return null
  const ownDistance = clusterDistance(rgb, own)
  let best: { color: string; distance: number } | null = null
  for (const [color, centroid] of Object.entries(colors)) {
    if (color === label) continue
    const distance = clusterDistance(rgb, centroid)
    if (!best || distance < best.distance) best = { color, distance }
  }
  return best
    ? { color: best.color, ratio: ownDistance / Math.max(best.distance, 1e-9) }
    : null
}

export async function runGlobalWhiteBalance(
  faceCroppedImages: Record<string, string>,
  gridSize: number,
  faceGains?: Record<string, RGB>,
  sampling: SamplingGeometry = DEFAULT_SAMPLING,
  referencePalette?: Record<string, RGB>,
): Promise<LearnedColorClassificationResult> {
  const baselineFaces: Record<string, ColorDetectionResult> = {}
  for (const [face, dataUrl] of Object.entries(faceCroppedImages)) {
    const gains = faceGains?.[face]
      ? limitBackgroundGain(faceGains[face])
      : NEUTRAL_GAINS
    baselineFaces[face] = await redetectFaceColors(
      dataUrl,
      gridSize,
      gains,
      sampling,
      referencePalette,
    )
  }

  return classifyAcrossFaces(baselineFaces, referencePalette)
}

// The balanced cross-face assignment behind runGlobalWhiteBalance, on
// already-measured faces. On 3x3, 5x5 and 7x7 the six centers are the six
// colors, one each, whatever the scheme or orientation. The colors are
// still learned from every sticker (centers are good anchors), but the
// centers are then assigned as a permutation - each to the learned color
// nearest its centerColor - and only the other stickers are balanced, N*N-1
// per color. A center misread past its logo was otherwise one sticker too
// many for its color, and the balance pushed the least typical real sticker
// of that color out (a blue read 19% "white").
export function classifyAcrossFaces(
  baselineFaces: Record<string, ColorDetectionResult>,
  referencePalette?: Record<string, RGB>,
): LearnedColorClassificationResult {
  const gridSize = Object.values(baselineFaces)[0]?.colors.length ?? 0
  const middle = (gridSize - 1) / 2
  const fixedCenters =
    gridSize >= 3 &&
    gridSize % 2 === 1 &&
    Object.keys(baselineFaces).length === 6
  const samples: StickerSample[] = []
  const sampleLocations: Array<{ face: string; row: number; col: number }> = []
  for (const [face, det] of Object.entries(baselineFaces)) {
    for (let r = 0; r < det.colors.length; r++) {
      for (let c = 0; c < det.colors[r].length; c++) {
        samples.push({
          rgb: det.cellColors[r][c],
          colorGuess: det.colors[r][c],
        })
        sampleLocations.push({ face, row: r, col: c })
      }
    }
  }

  // Pinned only against a real cube's colors: the idealized default swatches
  // put real yellows nearer orange. Never where a logo can sit - a blue
  // logo on a 4x4's white center read as a clear blue.
  const logoBand = (index: number) => Math.abs(index - middle) < 1
  const clear = referencePalette
    ? clearStickerColors(
        samples.map((s) => s.rgb),
        referencePalette,
      )
    : []
  const clearLabels = samples.map((_, i) =>
    logoBand(sampleLocations[i].row) && logoBand(sampleLocations[i].col)
      ? null
      : (clear[i] ?? null),
  )
  const learned = learnStickerColors(samples, referencePalette, clearLabels)
  if (!learned)
    return { learned: null, applied: false, faces: baselineFaces, glare: [] }

  // Every sticker's final color/confidence comes directly from
  // learnStickerColors()'s own balanced assignment (labelsBySampleIndex),
  // not an independent per-cell nearest-centroid lookup — that would
  // reopen the "one cluster steals another's points" problem the whole
  // balanced-assignment approach exists to close.
  const reclassifiedFaces: Record<string, ColorDetectionResult> = {}
  for (const [face, det] of Object.entries(baselineFaces)) {
    reclassifiedFaces[face] = {
      colors: det.colors.map((row) => [...row]),
      cellConfidences: det.cellConfidences.map((row) => [...row]),
      cellColors: det.cellColors,
      centerColor: det.centerColor,
      outerCellRatio: det.outerCellRatio,
      cellLookalikes: det.colors.map((row) => row.map(() => null)),
      confidence: 0,
    }
  }

  const faceTotals: Record<string, { sum: number; count: number }> = {}
  for (const face of Object.keys(baselineFaces))
    faceTotals[face] = { sum: 0, count: 0 }

  samples.forEach((_, i) => {
    const { face, row, col } = sampleLocations[i]
    const label = learned.labelsBySampleIndex[i]
    const cellConfidence = Math.max(
      0,
      1 - learned.leaveOneOutDistances[i] / CONFIDENCE_DISTANCE_SCALE,
    )

    reclassifiedFaces[face].colors[row][col] = label
    reclassifiedFaces[face].cellConfidences[row][col] = cellConfidence
    const nearest = nearestOtherColor(samples[i].rgb, label, learned.colors)
    reclassifiedFaces[face].cellLookalikes![row][col] =
      nearest && nearest.ratio >= LOOKALIKE_RATIO ? nearest.color : null
    faceTotals[face].sum += cellConfidence
    faceTotals[face].count++
  })

  if (fixedCenters) {
    const names = Object.keys(learned.colors)
    const centroids = names.map((name) => learned.colors[name])
    const label = (
      face: string,
      row: number,
      col: number,
      color: string,
      rgb: RGB,
      distance: number,
    ) => {
      const before = reclassifiedFaces[face].cellConfidences[row][col]
      const cellConfidence = Math.max(
        0,
        1 - distance / CONFIDENCE_DISTANCE_SCALE,
      )
      reclassifiedFaces[face].colors[row][col] = color
      reclassifiedFaces[face].cellConfidences[row][col] = cellConfidence
      const nearest = nearestOtherColor(rgb, color, learned.colors)
      reclassifiedFaces[face].cellLookalikes![row][col] =
        nearest && nearest.ratio >= LOOKALIKE_RATIO ? nearest.color : null
      faceTotals[face].sum += cellConfidence - before
    }
    // Centers: each color exactly once.
    const faces = Object.keys(baselineFaces)
    const evidence = faces.map(
      (face) =>
        baselineFaces[face].centerColor ??
        baselineFaces[face].cellColors[middle][middle],
    )
    const cost = evidence.map((rgb) =>
      centroids.map((centroid) => clusterDistance(rgb, centroid)),
    )
    const assignment = hungarianAssignment(cost)
    faces.forEach((face, i) =>
      label(
        face,
        middle,
        middle,
        names[assignment[i]],
        evidence[i],
        cost[i][assignment[i]],
      ),
    )
    // Everything else: balanced without the centers. Unchanged labels keep
    // their leave-one-out confidence.
    const others = samples
      .map((_, i) => i)
      .filter(
        (i) =>
          !(
            sampleLocations[i].row === middle &&
            sampleLocations[i].col === middle
          ),
      )
    const rebalanced = balancedAssign(
      others.map((i) => samples[i].rgb),
      centroids,
      others.map((i) => {
        const clear = learned.clearLabels[i]
        return clear == null ? null : names.indexOf(clear)
      }),
    )
    others.forEach((i, j) => {
      const color = names[rebalanced[j]]
      if (color === learned.labelsBySampleIndex[i]) return
      const { face, row, col } = sampleLocations[i]
      label(
        face,
        row,
        col,
        color,
        samples[i].rgb,
        clusterDistance(samples[i].rgb, centroids[rebalanced[j]]),
      )
    })
  }

  for (const [face, { sum, count }] of Object.entries(faceTotals)) {
    reclassifiedFaces[face].confidence = count > 0 ? sum / count : 0
  }

  const labels = sampleLocations.map(
    ({ face, row, col }) => reclassifiedFaces[face].colors[row][col],
  )
  const glare = glareStickers(
    samples.map((s) => s.rgb),
    labels,
    referencePalette ?? learned.colors,
  ).map((i) => sampleLocations[i])

  return { learned, applied: true, faces: reclassifiedFaces, glare }
}

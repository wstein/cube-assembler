import { cellEdges, estimateOuterCellRatio } from './gridAlignment'
import {
  DEFAULT_SAMPLING,
  stickerSampleRect,
  type ColorDetectionResult,
  type RGB,
  type SamplingGeometry,
} from './stickerColorGeometry'
import { applyGains, classifySticker, NEUTRAL_GAINS } from './colorMath'
import {
  type FaceBounds,
  type FaceGeometryMode,
  computeFaceBounds,
  faceBoundsForMode,
  alignedFaceBounds,
  readFaceRegion,
  extractBackgroundColor,
  stickerColor,
  centerStickerColor,
  CENTER_CORE,
  cropFaceRegionToDataUrl,
} from './faceSampling'

// The actual per-sticker sampling and classification logic, operating on
// already-extracted raw pixel data rather than a browser HTMLCanvasElement
// - split out from extractCubeFaceColors so it can run against a real,
// decoded photo in a test environment with no DOM/Canvas API available
// (see test/fixtures.test.ts), not just against a live canvas. `data` is
// treated as already covering exactly the face region to sample (no
// further center-cropping is applied here - extractCubeFaceColors below
// does that cropping itself before calling in, and a saved fixture photo
// is already the cropped region, per cropFaceRegionToDataUrl).
export function extractColorsFromImageData(
  data: Uint8ClampedArray,
  faceWidth: number,
  faceHeight: number,
  gridSize = 3,
  gains: RGB = NEUTRAL_GAINS,
  sampling: SamplingGeometry = DEFAULT_SAMPLING,
  palette?: Record<string, RGB>,
): ColorDetectionResult {
  // Big cubes' perimeter cubies are wider; sample the layout this face shows.
  const outerCellRatio = estimateOuterCellRatio(
    data,
    faceWidth,
    faceHeight,
    gridSize,
  )
  const colors: string[][] = []
  const cellConfidences: number[][] = []
  const cellColors: RGB[][] = []
  let centerColor: RGB | undefined
  let totalConfidence = 0

  for (let row = 0; row < gridSize; row++) {
    const rowColors: string[] = []
    const rowConfidences: number[] = []
    const rowRGB: RGB[] = []
    for (let col = 0; col < gridSize; col++) {
      // Sample only the cell's core, ignoring a dead zone around its
      // border: sticker edges are where gap-line bleed, glare off the
      // plastic bezel, and slight grid misalignment are most likely to
      // contaminate the average, so those pixels are excluded rather than
      // averaged in.
      const rect = stickerSampleRect(
        row,
        col,
        gridSize,
        faceWidth,
        faceHeight,
        sampling,
        outerCellRatio,
      )
      const cellStartX = Math.round(rect.x)
      const cellStartY = Math.round(rect.y)
      const cellW = Math.round(rect.width)
      const cellH = Math.round(rect.height)

      const pixels: RGB[] = []

      for (let y = cellStartY; y < cellStartY + cellH; y++) {
        for (let x = cellStartX; x < cellStartX + cellW; x++) {
          if (x >= 0 && x < faceWidth && y >= 0 && y < faceHeight) {
            const idx = (y * faceWidth + x) * 4
            pixels.push({ r: data[idx], g: data[idx + 1], b: data[idx + 2] })
          }
        }
      }

      const measured = stickerColor(pixels)
      if (measured) {
        const avgColor: RGB = applyGains(measured, gains)
        rowRGB.push(avgColor)
        let judged = avgColor
        if (
          gridSize % 2 === 1 &&
          gridSize >= 3 &&
          row === (gridSize - 1) / 2 &&
          col === row
        ) {
          const logoSafe = centerStickerColor(
            samplePixels(
              data,
              faceWidth,
              faceHeight,
              stickerSampleRect(
                row,
                col,
                gridSize,
                faceWidth,
                faceHeight,
                {
                  ...sampling,
                  stickerCore: Math.max(sampling.stickerCore, CENTER_CORE),
                },
                outerCellRatio,
              ),
            ),
          )
          if (logoSafe) centerColor = judged = applyGains(logoSafe, gains)
        }
        const { color: stickerColor, confidence: cellConfidence } =
          classifySticker(judged, palette)
        rowColors.push(stickerColor)
        rowConfidences.push(cellConfidence)
        totalConfidence += cellConfidence
      } else {
        rowRGB.push({ r: 255, g: 255, b: 255 })
        rowColors.push('W')
        rowConfidences.push(0)
      }
    }
    colors.push(rowColors)
    cellConfidences.push(rowConfidences)
    cellColors.push(rowRGB)
  }

  const confidence = Math.min(1, totalConfidence / (gridSize * gridSize))

  return {
    colors,
    confidence,
    cellConfidences,
    cellColors,
    ...(outerCellRatio !== 1 && { outerCellRatio }),
    ...(centerColor && { centerColor }),
  }
}

// The pixels of `rect` (clipped to the face).
function samplePixels(
  data: Uint8ClampedArray,
  faceWidth: number,
  faceHeight: number,
  rect: { x: number; y: number; width: number; height: number },
): RGB[] {
  const pixels: RGB[] = []
  const x0 = Math.round(rect.x),
    y0 = Math.round(rect.y)
  for (let y = y0; y < y0 + Math.round(rect.height); y++) {
    for (let x = x0; x < x0 + Math.round(rect.width); x++) {
      if (x >= 0 && x < faceWidth && y >= 0 && y < faceHeight) {
        const idx = (y * faceWidth + x) * 4
        pixels.push({ r: data[idx], g: data[idx + 1], b: data[idx + 2] })
      }
    }
  }
  return pixels
}

// A cropped face can be one solid color, so seams are optional when the
// uncropped camera frame shows the cube's outer silhouette instead.
// `outerCellRatio` widens the outer rows and columns (see cellEdges).
export function hasCoherentStickerInteriors(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  gridSize: number,
  outerCellRatio = 1,
): boolean {
  if (gridSize < 2 || width < gridSize * 8 || height < gridSize * 8)
    return false
  const edges = cellEdges(gridSize, outerCellRatio)
  let coherentCells = 0
  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      const samples: number[][] = []
      const cellW = (edges[col + 1] - edges[col]) * width,
        cellH = (edges[row + 1] - edges[row]) * height
      const centerX = ((edges[col] + edges[col + 1]) / 2) * width,
        centerY = ((edges[row] + edges[row + 1]) / 2) * height
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const x = Math.round(centerX + dx * 0.1 * cellW)
          const y = Math.round(centerY + dy * 0.1 * cellH)
          const index =
            (Math.min(height - 1, y) * width + Math.min(width - 1, x)) * 4
          samples.push([data[index], data[index + 1], data[index + 2]])
        }
      }
      const mean = [0, 1, 2].map(
        (channel) =>
          samples.reduce((sum, sample) => sum + sample[channel], 0) /
          samples.length,
      )
      const deviation =
        samples.reduce(
          (sum, sample) =>
            sum +
            sample.reduce(
              (diff, value, channel) => diff + Math.abs(value - mean[channel]),
              0,
            ) /
              3,
          0,
        ) / samples.length
      if (deviation <= 35) coherentCells++
    }
  }
  return coherentCells >= Math.ceil(gridSize * gridSize * 0.6)
}

// The classifier assigns a color even to a wall. Look for repeated sticker
// seams, allowing for small perspective/framing offsets around each expected
// boundary. Room edges can occasionally imitate seams, so Detect face also
// requires the outer face boundary in the full camera frame.
// `outerCellRatio` widens the outer rows and columns (see cellEdges).
export function hasPlausibleStickerFace(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  gridSize: number,
  outerCellRatio = 1,
): boolean {
  if (
    !hasCoherentStickerInteriors(data, width, height, gridSize, outerCellRatio)
  )
    return false
  const edges = cellEdges(gridSize, outerCellRatio)
  const xs = edges.map((edge) => edge * width),
    ys = edges.map((edge) => edge * height)
  // Size of the narrower cell on either side of grid line i.
  const narrower = (lines: number[], i: number) =>
    Math.min(lines[i] - lines[i - 1], lines[i + 1] - lines[i])
  const luminance = (x: number, y: number) => {
    const index =
      (Math.min(height - 1, Math.max(0, Math.round(y))) * width +
        Math.min(width - 1, Math.max(0, Math.round(x)))) *
      4
    return (
      0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2]
    )
  }
  const segmentHasSeam = (
    vertical: boolean,
    boundary: number,
    segment: number,
  ) => {
    const acrossLines = vertical ? xs : ys,
      alongLines = vertical ? ys : xs
    const across = narrower(acrossLines, boundary)
    const along = alongLines[segment + 1] - alongLines[segment]
    const edge = acrossLines[boundary]
    const center = (alongLines[segment] + alongLines[segment + 1]) / 2
    let near = 0,
      far = 0
    for (let i = -2; i <= 2; i++) {
      const offset = i * along * 0.07
      const at = (distance: number) =>
        vertical
          ? luminance(edge + distance, center + offset)
          : luminance(center + offset, edge + distance)
      near += at(-across * 0.38)
      far += at(across * 0.38)
    }
    let darkest = Infinity
    for (let shift = -4; shift <= 4; shift++) {
      let seam = 0
      for (let i = -2; i <= 2; i++) {
        const offset = i * along * 0.07
        seam += vertical
          ? luminance(edge + shift * across * 0.04, center + offset)
          : luminance(center + offset, edge + shift * across * 0.04)
      }
      darkest = Math.min(darkest, seam / 5)
    }
    return Math.min(near, far) / 5 - darkest >= 12
  }
  const hasRepeatedSeams = (vertical: boolean) => {
    let found = 0
    for (let boundary = 1; boundary < gridSize; boundary++) {
      for (let segment = 0; segment < gridSize; segment++) {
        if (segmentHasSeam(vertical, boundary, segment)) found++
      }
    }
    return found >= Math.ceil((gridSize - 1) * gridSize * 0.5)
  }
  if (hasRepeatedSeams(true) && hasRepeatedSeams(false)) return true

  // Rounded stickers expose the dark cube body mainly at four-sticker
  // intersections, even when their straight seams are too narrow or skewed
  // to align with the grid. Several real cropped captures have this shape.
  // Like a seam, the corner must also be darker than the stickers around it
  // (on average - dark blue or red stickers can be darker than a grey-lit
  // body), or light grout between wall tiles would pass as a cube body.
  let visibleIntersections = 0
  const colorAt = (x: number, y: number) => {
    const px = Math.min(width - 1, Math.max(0, Math.round(x)))
    const py = Math.min(height - 1, Math.max(0, Math.round(y)))
    const index = (py * width + px) * 4
    return [data[index], data[index + 1], data[index + 2]]
  }
  const colorDistance = (a: number[], b: number[]) =>
    (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2])) / 3
  for (let row = 1; row < gridSize; row++) {
    for (let col = 1; col < gridSize; col++) {
      const x = xs[col]
      const y = ys[row]
      const cellW = narrower(xs, col),
        cellH = narrower(ys, row)
      const neighbors = [
        colorAt(x - cellW * 0.45, y - cellH * 0.45),
        colorAt(x + cellW * 0.45, y - cellH * 0.45),
        colorAt(x - cellW * 0.45, y + cellH * 0.45),
        colorAt(x + cellW * 0.45, y + cellH * 0.45),
      ]
      const stickerLuminance =
        neighbors.reduce(
          (sum, [r, g, b]) => sum + 0.2126 * r + 0.7152 * g + 0.0722 * b,
          0,
        ) / 4
      let cornerContrast = 0
      let darkestCorner = Infinity
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const corner = colorAt(x + dx * cellW * 0.06, y + dy * cellH * 0.06)
          cornerContrast = Math.max(
            cornerContrast,
            Math.min(
              ...neighbors.map((neighbor) => colorDistance(corner, neighbor)),
            ),
          )
          darkestCorner = Math.min(
            darkestCorner,
            luminance(x + dx * cellW * 0.06, y + dy * cellH * 0.06),
          )
        }
      }
      if (cornerContrast >= 25 && darkestCorner < stickerLuminance)
        visibleIntersections++
    }
  }
  return visibleIntersections >= Math.ceil((gridSize - 1) ** 2 * 0.5)
}

export function hasVisibleCubeFace(
  canvas: HTMLCanvasElement,
  gridSize: number,
  bounds: FaceBounds = alignedFaceBounds(canvas, gridSize),
  requireOutline = false,
): boolean {
  const { imageData, faceWidth, faceHeight } = readFaceRegion(canvas, bounds)
  return faceVisibility(
    imageData.data,
    faceWidth,
    faceHeight,
    gridSize,
    () => {
      const ctx = canvas.getContext('2d')
      if (!ctx) return false
      const angle = bounds.angle ?? 0
      const cos = Math.abs(Math.cos(angle)),
        sin = Math.abs(Math.sin(angle))
      const cx = bounds.startX + faceWidth / 2,
        cy = bounds.startY + faceHeight / 2
      const margin = Math.ceil(Math.min(faceWidth, faceHeight) * 0.08) + 1
      const halfX = (cos * faceWidth + sin * faceHeight) / 2 + margin
      const halfY = (sin * faceWidth + cos * faceHeight) / 2 + margin
      const x0 = Math.max(0, Math.floor(cx - halfX)),
        y0 = Math.max(0, Math.floor(cy - halfY))
      const x1 = Math.min(canvas.width, Math.ceil(cx + halfX)),
        y1 = Math.min(canvas.height, Math.ceil(cy + halfY))
      if (x1 <= x0 || y1 <= y0) return false
      const region = ctx.getImageData(x0, y0, x1 - x0, y1 - y0)
      return outlineVisible(region.data, x1 - x0, y1 - y0, {
        ...bounds,
        startX: bounds.startX - x0,
        startY: bounds.startY - y0,
      })
    },
    requireOutline,
  ).visible
}

// The live cube check on the read square `data`, step by step: coherent
// sticker interiors, then a sticker pattern or a visible outline. Detect
// face requires the outer outline even when room lines mimic sticker seams;
// Guide grid keeps the more permissive manual check.
export function faceVisibility(
  data: Uint8ClampedArray,
  faceWidth: number,
  faceHeight: number,
  gridSize: number,
  outline: () => boolean,
  requireOutline = false,
): {
  visible: boolean
  coherent: boolean
  plausible?: boolean
  outline?: boolean
} {
  // Judge the face in the layout it is sampled in (see extractColorsFromImageData).
  const outer = estimateOuterCellRatio(data, faceWidth, faceHeight, gridSize)
  if (
    !hasCoherentStickerInteriors(data, faceWidth, faceHeight, gridSize, outer)
  )
    return { visible: false, coherent: false }
  const plausible = hasPlausibleStickerFace(
    data,
    faceWidth,
    faceHeight,
    gridSize,
    outer,
  )
  if (plausible && !requireOutline)
    return { visible: true, coherent: true, plausible: true }
  const edge = outline()
  return { visible: edge, coherent: true, plausible, outline: edge }
}

// Whether the square of `bounds` stands out from its surroundings along at
// least 3 of its sides, in the full width x height `frame`.
export function outlineVisible(
  frame: Uint8ClampedArray,
  width: number,
  height: number,
  bounds: FaceBounds,
): boolean {
  const { faceWidth, faceHeight } = bounds
  const colorAt = (x: number, y: number) => {
    const px = Math.min(width - 1, Math.max(0, Math.round(x)))
    const py = Math.min(height - 1, Math.max(0, Math.round(y)))
    const index = (py * width + px) * 4
    return [frame[index], frame[index + 1], frame[index + 2]]
  }
  const contrast = (a: number[], b: number[]) =>
    (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2])) / 3
  const inset = Math.min(faceWidth, faceHeight) * 0.06
  // The outline of the square that was read - aligned, maybe tilted - in
  // its own frame: (u, v) from its center, turned with it.
  const cx = bounds.startX + faceWidth / 2,
    cy = bounds.startY + faceHeight / 2
  const cos = Math.cos(bounds.angle ?? 0),
    sin = Math.sin(bounds.angle ?? 0)
  const at = (u: number, v: number) =>
    colorAt(cx + cos * u - sin * v, cy + sin * u + cos * v)
  const halfW = faceWidth / 2,
    halfH = faceHeight / 2
  let visibleSides = 0
  for (let side = 0; side < 4; side++) {
    let contrasted = 0
    for (let i = 1; i <= 9; i++) {
      const u = (i / 10 - 0.5) * faceWidth
      const v = (i / 10 - 0.5) * faceHeight
      const inside =
        side === 0
          ? at(-halfW + inset, v)
          : side === 1
            ? at(halfW - inset, v)
            : side === 2
              ? at(u, -halfH + inset)
              : at(u, halfH - inset)
      const outside =
        side === 0
          ? at(-halfW - inset, v)
          : side === 1
            ? at(halfW + inset, v)
            : side === 2
              ? at(u, -halfH - inset)
              : at(u, halfH + inset)
      if (contrast(inside, outside) >= 25) contrasted++
    }
    if (contrasted >= 6) visibleSides++
  }
  return visibleSides >= 3
}

export function extractCubeFaceColors(
  canvas: HTMLCanvasElement,
  gridSize = 3,
  gains: RGB = NEUTRAL_GAINS,
  sampling: SamplingGeometry = DEFAULT_SAMPLING,
  palette?: Record<string, RGB>,
  bounds: FaceBounds = alignedFaceBounds(canvas, gridSize),
): ColorDetectionResult {
  const { imageData, faceWidth, faceHeight } = readFaceRegion(canvas, bounds)
  const result = extractColorsFromImageData(
    imageData.data,
    faceWidth,
    faceHeight,
    gridSize,
    gains,
    sampling,
    palette,
  )
  return withGridOffset(result, bounds, computeFaceBounds(canvas))
}

// `result` with where its square sat relative to the guide (gridOffset), when
// it was moved off the guide - what the live overlay is drawn from.
export function withGridOffset(
  result: ColorDetectionResult,
  bounds: FaceBounds,
  guide: FaceBounds,
): ColorDetectionResult {
  if (
    bounds.startX === guide.startX &&
    bounds.startY === guide.startY &&
    bounds.faceWidth === guide.faceWidth &&
    !bounds.angle
  )
    return result
  return {
    ...result,
    gridOffset: {
      x:
        (bounds.startX +
          bounds.faceWidth / 2 -
          guide.startX -
          guide.faceWidth / 2) /
        guide.faceWidth,
      y:
        (bounds.startY +
          bounds.faceHeight / 2 -
          guide.startY -
          guide.faceHeight / 2) /
        guide.faceHeight,
      scale: bounds.faceWidth / guide.faceWidth,
      angle: ((bounds.angle ?? 0) * 180) / Math.PI,
    },
  }
}

export interface FaceCaptureResult extends ColorDetectionResult {
  croppedImage: string
  // Sampled once, live, at capture time - see extractBackgroundColor. Null
  // when the frame was too small or the background area came back unreliably dark;
  // callers should then fall back to NEUTRAL_GAINS for this face's
  // cross-face correction rather than treating it as a hard error.
  backgroundColor: RGB | null
  // Where croppedImage came from, for saved fixtures: the full frame's size
  // and the crop rectangle within it (the rest of the frame is dropped for
  // privacy, so this is the only record of how it was framed).
  frame: { width: number; height: number }
  // `angle`: degrees the crop was turned upright by, about its center.
  // `corners`: where it was straightened from, for a face seen at an angle.
  crop: {
    x: number
    y: number
    width: number
    height: number
    angle?: number
    corners?: number[][]
  }
  // measureSharpness of the cropped face region.
  sharpness: number
}

// Focus measure for a photo: variance of the Laplacian of its luminance
// (a standard blur metric - edges produce large Laplacian values, so a
// sharp image has a wide spread and a blurred one a narrow spread). Only
// comparable between photos of similar content and size, e.g. the 6 faces
// of one capture or recaptures of the same cube; saved with fixtures so an
// out-of-focus face can be spotted.
export function measureSharpness(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): number {
  if (width < 3 || height < 3) return 0
  const luma = new Float32Array(width * height)
  for (let i = 0; i < width * height; i++) {
    luma[i] =
      0.2126 * data[i * 4] + 0.7152 * data[i * 4 + 1] + 0.0722 * data[i * 4 + 2]
  }
  let sum = 0
  let sumSq = 0
  let count = 0
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x
      const laplacian =
        luma[i - 1] +
        luma[i + 1] +
        luma[i - width] +
        luma[i + width] -
        4 * luma[i]
      sum += laplacian
      sumSq += laplacian * laplacian
      count++
    }
  }
  const mean = sum / count
  return sumSq / count - mean * mean
}

function describeCrop(
  canvas: HTMLCanvasElement,
  bounds: FaceBounds,
): Pick<FaceCaptureResult, 'frame' | 'crop' | 'sharpness'> {
  const { imageData, startX, startY, faceWidth, faceHeight } = readFaceRegion(
    canvas,
    bounds,
  )
  return {
    frame: { width: canvas.width, height: canvas.height },
    crop: {
      x: startX,
      y: startY,
      width: faceWidth,
      height: faceHeight,
      ...(bounds.angle && { angle: (bounds.angle * 180) / Math.PI }),
      ...(bounds.corners && {
        corners: bounds.corners.map(([x, y]) => [
          Math.round(x * 10) / 10,
          Math.round(y * 10) / 10,
        ]),
      }),
    },
    sharpness: measureSharpness(imageData.data, faceWidth, faceHeight),
  }
}

// Use the already checked live frame for automatic capture. Reading the video
// again after the stability check could capture a different, moving face.
export function captureAndProcessCanvas(
  canvas: HTMLCanvasElement,
  gridSize = 3,
  gains: RGB = NEUTRAL_GAINS,
  sampling: SamplingGeometry = DEFAULT_SAMPLING,
  palette?: Record<string, RGB>,
  geometry: FaceGeometryMode = 'aligned',
  checkedBounds?: FaceBounds,
): FaceCaptureResult {
  // croppedImage is always the raw, un-gained frame — it's the source of
  // truth photo, re-analyzed independently by the post-capture global
  // recalibration pass (redetectFaceColors / runGlobalWhiteBalance),
  // which always starts over from NEUTRAL_GAINS regardless of what `gains`
  // was passed in here (see the "Gains" comment above) - unless a
  // background-derived correction is supplied for this face instead (see
  // runGlobalWhiteBalance's faceGains parameter).
  // One aligned square for the colors, the saved photo and its crop record,
  // so everything later re-analyzed from the photo sees the same face.
  const bounds = checkedBounds ?? faceBoundsForMode(canvas, gridSize, geometry)
  if (geometry === 'aligned' && !bounds.gridFound)
    throw new Error(
      'No aligned face found. Show a face in the camera view or choose Guide grid.',
    )
  return {
    ...extractCubeFaceColors(
      canvas,
      gridSize,
      gains,
      sampling,
      palette,
      bounds,
    ),
    croppedImage: cropFaceRegionToDataUrl(canvas, bounds),
    backgroundColor: extractBackgroundColor(canvas, bounds),
    ...describeCrop(canvas, bounds),
  }
}

export function captureAndProcessImage(
  img: HTMLImageElement,
  gridSize = 3,
  gains: RGB = NEUTRAL_GAINS,
  sampling: SamplingGeometry = DEFAULT_SAMPLING,
  palette?: Record<string, RGB>,
  geometry: FaceGeometryMode = 'aligned',
): FaceCaptureResult {
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Could not get canvas context')
  }

  ctx.drawImage(img, 0, 0)
  // One aligned square for the colors, the saved photo and its crop record,
  // so everything later re-analyzed from the photo sees the same face.
  const bounds = faceBoundsForMode(canvas, gridSize, geometry)
  if (geometry === 'aligned' && !bounds.gridFound)
    throw new Error(
      'No aligned face found in the image. Choose another image or Guide grid.',
    )
  return {
    ...extractCubeFaceColors(
      canvas,
      gridSize,
      gains,
      sampling,
      palette,
      bounds,
    ),
    croppedImage: cropFaceRegionToDataUrl(canvas, bounds),
    backgroundColor: extractBackgroundColor(canvas, bounds),
    ...describeCrop(canvas, bounds),
  }
}

function loadImageFromDataUrl(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not load stored face image'))
    img.src = dataUrl
  })
}

// Re-runs color classification on an already-captured face snapshot (the
// croppedImage stored at capture time) with a new set of gains — used by
// the post-capture global white-balance step to redetect every face's
// colors after computing a correction from all 6 faces' stickers together.
// Since croppedImage is already cropped to just the sample region, this
// draws it directly (no re-cropping) rather than reusing
// captureAndProcessImage, which would crop an already-cropped image.
export async function redetectFaceColors(
  croppedImageDataUrl: string,
  gridSize: number,
  gains: RGB,
  sampling: SamplingGeometry = DEFAULT_SAMPLING,
  palette?: Record<string, RGB>,
): Promise<ColorDetectionResult> {
  const img = await loadImageFromDataUrl(croppedImageDataUrl)
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Could not get canvas context')
  }
  ctx.drawImage(img, 0, 0)

  // extractCubeFaceColors expects to crop its own centered 60% guide-square
  // region out of a full frame, but croppedImageDataUrl IS already that
  // region — so temporarily present it as a frame where the "guide square"
  // covers the whole canvas by padding it out to ~1/0.6 of its size first.
  const pad = 1 / 0.6
  const padded = document.createElement('canvas')
  padded.width = Math.round(canvas.width * pad)
  padded.height = Math.round(canvas.height * pad)
  const pctx = padded.getContext('2d')
  if (!pctx) {
    throw new Error('Could not get canvas context')
  }
  const offsetX = (padded.width - canvas.width) / 2
  const offsetY = (padded.height - canvas.height) / 2
  pctx.drawImage(canvas, offsetX, offsetY)

  // The stored photo was cropped to the aligned square at capture time -
  // sample exactly the guide here instead of aligning it a second time.
  return extractCubeFaceColors(
    padded,
    gridSize,
    gains,
    sampling,
    palette,
    computeFaceBounds(padded),
  )
}

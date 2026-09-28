// Where the sticker grid really sits inside the capture search area:
// src/core/vision/GridAlignment.res.
import {
  defaultScaleRange,
  type faceSquare,
  findGridAlignment as findGridAlignmentRes,
  type gridAlignment,
} from '../core/vision/GridAlignment.gen'

export {
  acceptFaceCorners,
  alignFace,
  alignmentMaxOffset as ALIGNMENT_MAX_OFFSET,
  cornersConsistent,
  estimateFaceCorners,
  estimateOuterCellRatio,
  estimateTilt,
  type faceSquare as FaceSquare,
  type gridAlignment as GridAlignment,
} from '../core/vision/GridAlignment.gen'
export { cellEdges } from './stickerColorGeometry'

export function findGridAlignment(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  guide: faceSquare,
  gridSize: number,
  angle = 0,
  scaleRange: [number, number] = defaultScaleRange,
): gridAlignment {
  return findGridAlignmentRes(
    data,
    width,
    height,
    guide,
    gridSize,
    angle,
    scaleRange,
  )
}

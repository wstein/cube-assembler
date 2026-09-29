// The 3D view's shared helpers: src/core/view/CubeViewState.res.
export {
  autoRotateRadiansPerMs as AUTO_ROTATE_RADIANS_PER_MS,
  autoRotateResumeDelayMs as AUTO_ROTATE_RESUME_DELAY_MS,
  defaultStickerHex as DEFAULT_STICKER_HEX,
  getDefaultZoom,
  facePreset,
  isometricAngles,
  isometricPitch as ISOMETRIC_PITCH,
  isometricYaw as ISOMETRIC_YAW,
  rotateYaw,
  tiltPitch,
  wheelZoom,
  getFaceletColor,
  getFaceSeams,
  hexToRgb,
  rotateVec,
} from '../../core/view/CubeViewState.gen'

export type { face as ViewFace } from '../../core/view/CubeViewState.gen'

export type Point = [number, number]

export interface MeshData {
  positions: Float32Array
  normals: Float32Array
  colors: Float32Array
  occlusion: Float32Array
  indices: Uint16Array | Uint32Array
  vertexCount: number
  indexCount: number
}

export {
  applyCubeLayerMove,
  applyCubeMove,
  cubeStateToFaces,
  facesToCubeState,
  formatCubeTurn,
  generateScrambleMoves,
  recordTurn,
  type CubeTurn,
} from '../../cube/cubeMoves'

// The 3D cube's triangle mesh: src/core/view/CubeMesh.res.
import type { CubeState } from '../cube/cubeAssembly'
import { buildCubeMesh as buildCubeMeshRes } from '../core/view/CubeMesh.gen'
import { DEFAULT_STICKER_HEX, type MeshData } from './cubeView3DState'

export type { turningLayer as TurningLayer } from '../core/view/CubeMesh.gen'

export function buildCubeMesh(
  cube: CubeState,
  n: number,
  palette: Record<string, string> = DEFAULT_STICKER_HEX,
  stickerless = true,
  turn?: Parameters<typeof buildCubeMeshRes>[4],
): MeshData {
  const mesh = buildCubeMeshRes(cube, n, palette, stickerless, turn)
  // ReScript keeps the index array opaque: a Uint32Array past 65535
  // vertices, else a Uint16Array.
  return {
    ...mesh,
    indices: mesh.indices as unknown as Uint16Array | Uint32Array,
  }
}

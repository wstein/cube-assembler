// The 3D cube's triangle mesh: src/core/view/CubeMesh.res.
import type { CubeState } from '../cube/cubeAssembly'
import { buildCubeMesh as buildCubeMeshRes } from '../core/view/CubeMesh.gen'
import { builtinColorProfiles } from './profileSettings'
import { DEFAULT_STICKER_HEX, type MeshData } from './cubeView3DState'

export type { turningLayer as TurningLayer } from '../core/view/CubeMesh.gen'

// Stickerless pieces are colored plastic. Use the built-in Matte capture
// colors instead of the brighter palette used for stickers and the net.
const mattePlasticColors = builtinColorProfiles().find(
  (profile) => profile.name === 'Matte',
)?.colors
const mattePlasticPalette = mattePlasticColors
  ? Object.fromEntries(
      Object.entries(mattePlasticColors).map(([key, { r, g, b }]) => [
        key,
        `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`,
      ]),
    )
  : DEFAULT_STICKER_HEX

export function buildCubeMesh(
  cube: CubeState,
  n: number,
  palette: Record<string, string> = DEFAULT_STICKER_HEX,
  stickerless = true,
  turn?: Parameters<typeof buildCubeMeshRes>[4],
): MeshData {
  const mesh = buildCubeMeshRes(
    cube,
    n,
    stickerless ? mattePlasticPalette : palette,
    stickerless,
    turn,
  )
  // ReScript keeps the index array opaque: a Uint32Array past 65535
  // vertices, else a Uint16Array.
  return {
    ...mesh,
    indices: mesh.indices as unknown as Uint16Array | Uint32Array,
  }
}

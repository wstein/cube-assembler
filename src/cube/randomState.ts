// Typed entry point for the random cube state (RandomState.res).
import { randomCube as randomCubeRes } from './RandomState.gen'
import type { CubeState } from './cubeAssembly'

// A valid cube of `size` layers with every piece in a random place and
// orientation; the same seed gives the same cube.
export function randomCube(size: number, seed: number): CubeState {
  return randomCubeRes(size, seed)
}

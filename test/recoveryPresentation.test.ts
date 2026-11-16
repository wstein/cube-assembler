import { expect, it } from 'vitest'
import {
  captureFrame,
  initializeMapping,
  transformFaces,
} from '../src/client/capture/captureFaceMapping'
import {
  cubeFaces,
  presentationCube,
} from '../src/client/capture/recoveryPresentation'
import type { CaptureRecovery } from '../src/client/capture/captureRecovery'
import { assembleCubeFromFaces } from '../src/cube/cubeAssembly'
import { rotateCube, turnFace, type Faces } from '../src/cube/cubeGeometry'

it('presents all 24 frames and converts completed turns back without changing app authority', () => {
  const n = 3
  const raw = Object.fromEntries(
    ['U', 'R', 'F', 'D', 'L', 'B'].map((f, i) => [
      f,
      Array.from({ length: n }, () =>
        Array<string>(n).fill(['W', 'R', 'G', 'Y', 'O', 'B'][i]),
      ),
    ]),
  ) as Faces
  const faces = turnFace(turnFace(raw, 'R', 1), 'U', 1)
  const cube = assembleCubeFromFaces(faces, n)
  const snapshot = JSON.stringify(cube)
  for (let index = 0; index < 24; index++) {
    const mapping = initializeMapping(raw, null)
    const pose = captureFrame(raw, mapping, 'F', 'U')!
    const inverse = Array.from({ length: 24 }, (_, i) => i).find(
      (i) =>
        JSON.stringify(transformFaces(transformFaces(faces, index)!, i)) ===
        JSON.stringify(faces),
    )!
    const record: CaptureRecovery = {
      stateRelation: 'capture',
      version: 1,
      transformConvention: 'cube-geometry-orientations/v1',
      mapping,
      view: 'capture',
      captureFrame: {
        frontSlot: 'F',
        upSlot: 'U',
        confirmed: true,
        photoTransforms: pose.mapping,
        displayTransform: index,
        canonicalTransform: inverse,
        mirrored: false,
        protocol: null,
        turnDirection: 'unknown',
        capOrder: 'unknown',
        displayedArrows: [],
        guideObservations: [],
      },
    }
    const displayed = presentationCube(cube, n, record)
    expect(presentationCube(displayed, n, record, true)).toEqual(cube)
    const after = turnFace(cubeFaces(displayed, n), 'F', 1)
    const canonicalAfter = presentationCube(
      assembleCubeFromFaces(after, n),
      n,
      record,
      true,
    )
    const undone = turnFace(
      cubeFaces(presentationCube(canonicalAfter, n, record), n),
      'F',
      -1,
    )
    expect(
      presentationCube(assembleCubeFromFaces(undone, n), n, record, true),
    ).toEqual(cube)
    expect(JSON.stringify(cube)).toBe(snapshot)
  }
  expect(rotateCube(faces, 'x', 4)).toEqual(faces)
})

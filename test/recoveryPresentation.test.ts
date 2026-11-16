import { expect, it } from 'vitest'
import {
  captureFrame,
  initializeMapping,
  transformFaces,
} from '../src/client/capture/captureFaceMapping'
import {
  cubeFaces,
  presentationCube,
  presentationMoves,
  presentationColorFrame,
  sameCubeState,
} from '../src/client/capture/recoveryPresentation'
import type { CaptureRecovery } from '../src/client/capture/captureRecovery'
import { assembleCubeFromFaces } from '../src/cube/cubeAssembly'
import { applyCubeLayerMove } from '../src/cube/cubeMoves'
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

it('exports replayable logical moves and color frames across every presentation', () => {
  const faces = Object.fromEntries(
    ['U', 'R', 'F', 'D', 'L', 'B'].map((f) => [f, [[f]]]),
  ) as Faces
  for (let index = 0; index < 24; index++) {
    const inverse = Array.from({ length: 24 }, (_, i) => i).find(
      (i) =>
        JSON.stringify(transformFaces(transformFaces(faces, index)!, i)) ===
        JSON.stringify(faces),
    )!
    const record = {
      view: 'capture',
      captureFrame: { displayTransform: index, canonicalTransform: inverse },
    } as CaptureRecovery
    for (const size of [2, 3, 4, 7, 8]) {
      const unique = Object.fromEntries(
        Object.keys(faces).map((f) => [
          f,
          Array.from({ length: size }, (_, r) =>
            Array.from({ length: size }, (_, c) => `${f}${r}${c}`),
          ),
        ]),
      ) as Faces
      const original = assembleCubeFromFaces(unique, size)
      for (const face of ['U', 'R', 'F', 'D', 'L', 'B'] as const) {
        const move = { face, depth: size, width: size - 1, turns: -1 }
        const mapped = presentationMoves([move], record, true)[0]
        const shown = presentationCube(original, size, record)
        const turned = applyCubeLayerMove(
          shown,
          size,
          move.face,
          move.depth,
          move.turns,
          move.width,
        )
        expect(
          applyCubeLayerMove(
            original,
            size,
            mapped.face,
            mapped.depth,
            mapped.turns,
            mapped.width!,
          ),
        ).toEqual(presentationCube(turned, size, record, true))
        expect(presentationMoves([mapped], record)).toEqual([move])
      }
    }
    const frame = { u: 'U', r: 'R', f: 'F', d: 'D', l: 'L', b: 'B' }
    expect(
      presentationColorFrame(
        presentationColorFrame(frame, record),
        record,
        true,
      ),
    ).toEqual(frame)
  }
})

it('detects local viewer edits by value and recognizes undo without reference identity', () => {
  const cube = assembleCubeFromFaces(
    Object.fromEntries(
      ['U', 'R', 'F', 'D', 'L', 'B'].map((f) => [
        f,
        Array.from({ length: 3 }, () => Array(3).fill(f)),
      ]),
    ) as Faces,
    3,
  )
  const moved = applyCubeLayerMove(cube, 3, 'F', 1, 1, 1)
  expect(sameCubeState(cube, structuredClone(cube))).toBe(true)
  expect(sameCubeState(cube, moved)).toBe(false)
  expect(sameCubeState(cube, applyCubeLayerMove(moved, 3, 'F', 1, -1, 1))).toBe(
    true,
  )
})

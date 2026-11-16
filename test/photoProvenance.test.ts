import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { strFromU8, unzipSync } from 'fflate'
import { expect, it } from 'vitest'
import { netPhotos } from '../src/client/capture/approvalPhotos'
import { readPhotoIdentity } from '../src/client/capture/photoIdentity'
import { CapturePhotoBinding } from '../src/client/capture/photoProvenance'
import type { FaceCaptureData } from '../src/client/capture/captureTypes'
import type { OrientedCandidate } from '../src/cube/cubeAssembly'
import {
  readFixtureColors,
  readFixtureAssembled,
} from '../src/client/fixtures/fixtureFormat'
const slots = ['U', 'R', 'F', 'D', 'L', 'B']
function capturedFixture() {
  const zip = unzipSync(
    readFileSync('test/fixtures/photo-identity-4x4-2026-11-16T21-28-43.zip'),
  )
  expect(createHash('sha256').update(zip['meta.json']).digest('hex')).toBe(
    '5c246ab802bead2279758cf3957cdfd3feedb4bfbfaf4701550dd103b73a1897',
  )
  const meta = JSON.parse(strFromU8(zip['meta.json']))
  const raw = readFixtureColors(meta)!
  const captured: Record<string, FaceCaptureData> = Object.fromEntries(
    slots.map((slot) => [
      slot,
      {
        photoIdentity: {
          photoId: `fixture-${slot}`,
          sourceHash: createHash('sha256')
            .update(zip[`face-${slot.toLowerCase()}.jpg`])
            .digest('hex'),
          sourceGrid: raw.colors[slot],
        },
        colors: raw.colors[slot],
        confidence: 1,
        timestamp: 0,
        croppedImage: `data:image/jpeg;base64,${Buffer.from(zip[`face-${slot.toLowerCase()}.jpg`]).toString('base64')}`,
      },
    ]),
  )
  const net = readFixtureAssembled(meta)!
  const candidate = {
    faces: net,
    rotations: [],
  } as unknown as OrientedCandidate
  const binding = new CapturePhotoBinding()
  binding.bind(candidate, meta.capture.faceRecovery.mapping, captured, 4, 0)
  return { meta, captured, candidate, binding }
}
it('keeps six distinct source photos for the displayed checker-pattern cube', () => {
  const { captured, candidate, binding } = capturedFixture()
  const photos = netPhotos(
    captured,
    slots,
    binding.evidence(candidate, captured, 4),
  )
  expect(new Set(Object.values(photos).map((photo) => photo?.slot)).size).toBe(
    6,
  )
})
it('shows the original Down photo rather than a color-identical Up logo photo', () => {
  const { captured, candidate, binding } = capturedFixture()
  const photos = netPhotos(
    captured,
    slots,
    binding.evidence(candidate, captured, 4),
  )
  expect(photos.U?.image).toBe(captured.L.croppedImage)
  expect(photos.D?.image).toBe(captured.B.croppedImage)
  expect(photos.F?.image).toBe(captured.D.croppedImage)
  expect(photos.B?.image).toBe(captured.R.croppedImage)
})

it('does not infer an unknown source from identical colors', () => {
  const { captured } = capturedFixture()
  expect(
    Object.values(netPhotos(captured, slots, undefined)).every(
      (photo) => photo === null,
    ),
  ).toBe(true)
})
it('invalidates an old candidate after a reviewed color change without changing raw identity', () => {
  const { captured, candidate, binding } = capturedFixture()
  const revised = {
    ...captured,
    U: { ...captured.U, colors: captured.U.colors.map((row) => [...row]) },
  }
  revised.U.colors[0][0] = 'W'
  expect(
    Object.values(
      netPhotos(revised, slots, binding.evidence(candidate, revised, 4)),
    ).every((photo) => photo === null),
  ).toBe(true)
  expect(revised.U.photoIdentity).toBe(captured.U.photoIdentity)
})

it('restores declared photo identity only when the actual JPEG hash agrees', async () => {
  const { captured } = capturedFixture()
  const original = captured.L
  const restored = await readPhotoIdentity(
    original.croppedImage!,
    original.colors,
    4,
    'L',
    JSON.parse(JSON.stringify(original.photoIdentity)),
  )
  expect(restored).toEqual(original.photoIdentity)
  await expect(
    readPhotoIdentity(
      captured.B.croppedImage!,
      original.colors,
      4,
      'L',
      original.photoIdentity,
    ),
  ).rejects.toThrow('Invalid photo identity')
})

it('keeps photo identity for every explicit quarter turn on all six faces', () => {
  const { captured, meta } = capturedFixture()
  for (const turns of [0, 1, 2, 3]) {
    const binding = new CapturePhotoBinding()
    const candidate = {
      faces: {},
      rotations: [],
    } as unknown as OrientedCandidate
    const mapping = meta.capture.faceRecovery.mapping.map(
      (entry: { slot: string; target: 'U' | 'R' | 'F' | 'D' | 'L' | 'B' }) => ({
        ...entry,
        quarterTurns: turns,
      }),
    )
    binding.bind(candidate, mapping, captured, 4)
    const photos = netPhotos(
      captured,
      slots,
      binding.evidence(candidate, captured, 4),
    )
    for (const entry of mapping) {
      expect(photos[entry.target]?.image).toBe(
        captured[entry.slot].croppedImage,
      )
      expect(photos[entry.target]?.turns).toBe(turns)
    }
  }
})

it('never resolves an approved slot onto a retaken photo with a new identity', () => {
  const { captured, candidate, binding, meta } = capturedFixture()
  const original = binding.evidence(candidate, captured, 4)!.candidate
  const retaken = {
    ...captured,
    L: {
      ...captured.L,
      photoIdentity: {
        ...captured.L.photoIdentity!,
        photoId: 'new-photo-same-checker',
      },
    },
  }
  expect(binding.currentEvidence(original, retaken, 4)).toBeUndefined()
  // Re-reading the same producer is not a new observation of its mapping.
  binding.bind(candidate, meta.capture.faceRecovery.mapping, retaken, 4, 0)
  expect(binding.evidence(candidate, retaken, 4)?.candidate).toBeUndefined()
})
it('can project the same approved raw photos after color review without renewing puzzle validity', () => {
  const { captured, candidate, binding } = capturedFixture()
  const original = binding.evidence(candidate, captured, 4)!.candidate
  const reviewed = {
    ...captured,
    U: {
      ...captured.U,
      colors: captured.U.colors.map((row) => row.map(() => 'Y')),
    },
  }
  const identity = binding.currentEvidence(original, reviewed, 4)
  expect(netPhotos(reviewed, slots, identity).D?.image).toBe(
    captured.B.croppedImage,
  )
  expect(binding.evidence(candidate, reviewed, 4)?.candidate).toBeUndefined()
})

it('does not initialize a capture from an unselected empty main-net render', () => {
  const binding = new CapturePhotoBinding()
  expect(binding.currentEvidence(undefined, {}, 3)).toBeUndefined()
  const { captured, candidate, meta } = capturedFixture()
  binding.bind(candidate, meta.capture.faceRecovery.mapping, captured, 4)
  expect(
    Object.values(
      netPhotos(captured, slots, binding.evidence(candidate, captured, 4)),
    ).filter(Boolean),
  ).toHaveLength(6)
})

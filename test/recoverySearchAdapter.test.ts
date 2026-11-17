import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { unzipSync, strFromU8 } from 'fflate'
import { expect, it } from 'vitest'
import { Recovery, snapshot } from '@puzlwerk/capture-recovery'
import { CapturePhotoBinding } from '../src/client/capture/photoProvenance'
import {
  recoveryChecker,
  recoveryRequest,
  type CapturedPhotos,
} from '../src/client/capture/recoverySearchAdapter'
import { readFixtureColors } from '../src/client/fixtures/fixtureFormat'

function fixture(name: string) {
  const zip = unzipSync(readFileSync(`test/fixtures/${name}.zip`))
  const meta = JSON.parse(strFromU8(zip['meta.json']))
  const parsed = readFixtureColors(meta)!
  const faces: CapturedPhotos = Object.fromEntries(
    ['U', 'R', 'F', 'D', 'L', 'B'].map((slot) => [
      slot,
      {
        colors: parsed.colors[slot],
        confidence: 1,
        timestamp: 0,
        photoIdentity: {
          photoId: `actual-${slot}`,
          sourceHash: createHash('sha256')
            .update(zip[`face-${slot.toLowerCase()}.jpg`])
            .digest('hex'),
          sourceGrid: parsed.colors[slot],
        },
      },
    ]),
  )
  const binding = new CapturePhotoBinding()
  const capture = binding.update(faces, 4)!
  return { capture, faces, binding }
}

for (const name of [
  'photo-identity-4x4-2026-11-16T21-28-43',
  'capture-conflict-4x4-2026-11-16T19-08-19',
]) {
  it(`reports a capped empty prefix honestly, then assesses real matches with the same legacy checker: ${name}`, () => {
    const { capture, faces } = fixture(name)
    const checker = recoveryChecker(faces, 4)
    const prefix = Recovery.findMatchingCube(
      capture,
      recoveryRequest(capture, faces, 'findMatchingCube', 1000),
      checker,
    )
    expect(prefix.ok).toBe(true)
    if (!prefix.ok) throw Error(prefix.error)
    const empty = Recovery.describeSession(prefix.value)
    expect(empty.candidates).toHaveLength(0)
    expect(empty.truncated).toBe(true)
    expect(
      Recovery.selectedCandidate(Recovery.beginReview(prefix.value)),
    ).toBeUndefined()
    const full = Recovery.findMatchingCube(
      capture,
      recoveryRequest(capture, faces),
      checker,
    )
    if (!full.ok) throw Error(full.error)
    const result = Recovery.describeSession(full.value)
    expect(result.candidates).toHaveLength(8)
    expect(result.truncated).toBe(true)
    for (const item of result.candidates) {
      const projected = Recovery.projectCandidate(
        full.value,
        item.candidate.candidateId,
      )!
      expect(checker(item.candidate, projected).feasibility.status).toBe('pass')
      expect(new Set(projected.map((p) => p.photoId)).size).toBe(6)
      for (const p of projected)
        expect(p.sourceHash).toBe(
          snapshot(capture).observations.find(
            (photo) => photo.photoId === p.photoId,
          )!.sourceHash,
        )
    }
  })
}

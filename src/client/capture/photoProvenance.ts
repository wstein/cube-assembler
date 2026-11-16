import {
  createCapture,
  createCandidate,
  describeCandidate,
  createCandidateFromSlots,
  invalidateCapture,
  snapshot,
  photoForFace,
  synchronizeObservations,
  type capture,
  type candidate,
} from '@puzlwerk/capture-recovery'
import type { OrientedCandidate } from '../../cube/cubeAssembly'
import type { FaceMapping } from './captureFaceMapping'
import type { FaceCaptureData } from './captureTypes'

export interface CandidatePhotoEvidence {
  capture: capture
  candidate: candidate | undefined
}

// Browser object association only. PuzlWerk validates every snapshot, source
// identity, revision and canonical projection; this registry never uses colors
// or image similarity to find a source photo.
export class CapturePhotoBinding {
  private current: capture | undefined
  private faces: Record<string, FaceCaptureData> | undefined
  private candidates = new WeakMap<OrientedCandidate, candidate>()
  private producers = new WeakMap<object, candidate>()
  private error: string | null = null

  reset() {
    this.current = undefined
    this.faces = undefined
    this.candidates = new WeakMap()
    this.producers = new WeakMap()
    this.error = null
  }

  update(faces: Record<string, FaceCaptureData>, size: number) {
    if (this.faces === faces) return this.error ? undefined : this.current
    this.faces = faces
    if (!this.current) {
      const initial = createCapture({
        captureId: crypto.randomUUID(),
        revision: 0,
        size,
        observations: [],
      })
      if (!initial.ok) {
        this.error = initial.error
        return undefined
      }
      this.current = initial.value
    }
    const observations = Object.entries(faces).flatMap(([slot, face]) =>
      face.photoIdentity
        ? [
            {
              ...face.photoIdentity,
              slot,
              revision: 0,
              guideProtocol: face.captureGuide?.protocol,
              guideStep: face.captureGuide?.step,
              mirrored: face.captureGuide?.mirrored,
            },
          ]
        : [],
    )
    const revision = snapshot(this.current).revision
    const changed = synchronizeObservations(
      this.current,
      revision,
      observations,
    )
    if (!changed.ok) {
      this.error = changed.error
      return undefined
    }
    // A new browser data event can include reviewed colors. Keep immutable raw
    // observations and ask Core to invalidate any previous candidate revision.
    const invalidated = invalidateCapture(
      changed.value,
      snapshot(changed.value).revision,
    )
    if (!invalidated.ok) {
      this.error = invalidated.error
      return undefined
    }
    this.current = invalidated.value
    this.error = null
    return this.current
  }

  bind(
    displayed: OrientedCandidate,
    mapping: FaceMapping,
    faces: Record<string, FaceCaptureData>,
    size: number,
    legacyIndex?: number,
    producer: object = displayed,
  ) {
    const capture = this.update(faces, size)
    if (!capture) return
    const previous = this.producers.get(producer)
    if (previous) {
      const checked = this.currentEvidence(previous, faces, size)
      if (checked?.candidate) this.candidates.set(displayed, checked.candidate)
      return
    }
    const proof = createCandidateFromSlots(capture, {
      candidateId: crypto.randomUUID(),
      captureRevision: snapshot(capture).revision,
      mappingFrame: 'canonical',
      canonicalTransform: undefined,
      legacyTransform:
        legacyIndex === undefined
          ? undefined
          : { convention: 'cube-geometry-orientations/v1', index: legacyIndex },
      mapping,
    })
    if (proof.ok) {
      this.candidates.set(displayed, proof.value)
      this.producers.set(producer, proof.value)
    }
  }

  evidence(
    displayed: OrientedCandidate,
    faces: Record<string, FaceCaptureData>,
    size: number,
  ): CandidatePhotoEvidence | undefined {
    const capture = this.update(faces, size)
    const candidate = this.candidates.get(displayed)
    return capture
      ? {
          capture,
          candidate: photoForFace(capture, candidate, 'U')
            ? candidate
            : undefined,
        }
      : undefined
  }

  // An approved photo binding can be projected after color review only by
  // retaining its exact photo IDs. A retake cannot be rebound by its slot.
  currentEvidence(
    approved: candidate | undefined,
    faces: Record<string, FaceCaptureData>,
    size: number,
  ): CandidatePhotoEvidence | undefined {
    if (!approved) return undefined
    const capture = this.update(faces, size)
    if (!capture) return undefined
    const checked = createCandidate(capture, {
      ...describeCandidate(approved),
      captureRevision: snapshot(capture).revision,
    })
    return checked.ok ? { capture, candidate: checked.value } : undefined
  }

  get issue() {
    return this.error
  }
}

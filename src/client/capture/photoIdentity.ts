import {
  createCapture,
  snapshot,
  verifySourceHash,
  type observation,
} from '@puzlwerk/capture-recovery'

// Browser I/O records the original observation once. PuzlWerk owns its
// subsequent identity, revision and projection decisions.
export type PhotoIdentity = Readonly<
  Pick<observation, 'photoId' | 'sourceHash' | 'sourceGrid'>
>

export async function createPhotoIdentity(
  image: string,
  sourceGrid: string[][],
): Promise<PhotoIdentity> {
  const bytes = await (await fetch(image)).arrayBuffer()
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return {
    photoId: crypto.randomUUID(),
    sourceHash: Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, '0'),
    ).join(''),
    sourceGrid,
  }
}

// Untrusted fixture metadata is accepted only by the shared Core validator and
// only when its recorded hash matches the actual uploaded JPEG bytes.
export async function readPhotoIdentity(
  image: string,
  sourceGrid: string[][],
  size: number,
  slot: string,
  persisted: unknown,
): Promise<PhotoIdentity> {
  const actual = await createPhotoIdentity(image, sourceGrid)
  if (persisted === undefined) return actual
  try {
    const identity = persisted as PhotoIdentity
    const capture = createCapture({
      captureId: crypto.randomUUID(),
      revision: 0,
      size,
      observations: [
        {
          ...identity,
          slot,
          revision: 0,
          guideProtocol: undefined,
          guideStep: undefined,
          mirrored: undefined,
        },
      ],
    })
    if (!capture.ok) throw new Error(capture.error)
    if (!verifySourceHash(capture.value, identity.photoId, actual.sourceHash))
      throw new Error('Original photo hash mismatch')
    const saved = snapshot(capture.value).observations[0]
    return {
      photoId: saved.photoId,
      sourceHash: saved.sourceHash,
      sourceGrid: saved.sourceGrid,
    }
  } catch {
    throw new Error(`Invalid photo identity for ${slot}`)
  }
}

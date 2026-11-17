import { Recovery, type capture } from '@puzlwerk/capture-recovery'
import { useRef, useState } from 'preact/hooks'
import { CapturePhotoBinding } from './photoProvenance'
import {
  recoveryChecker,
  recoveryRequest,
  type CapturedPhotos,
} from './recoverySearchAdapter'

interface SearchState {
  capture: capture
  session: Recovery.session
  review: Recovery.review
  faces: CapturedPhotos
  origin: CapturedPhotos
  issue: string | null
  budget: number
}

export function useExplicitCaptureRecovery({
  captured,
  size,
  commit,
  initialBudget = 5000,
  sourceBinding,
}: {
  captured: CapturedPhotos
  size: number
  initialBudget?: number
  sourceBinding: () => CapturePhotoBinding
  commit: (confirmed: Recovery.confirmation, faces: CapturedPhotos) => boolean
}) {
  const binding = useRef(new CapturePhotoBinding())
  const sourceCapture = (faces: CapturedPhotos) =>
    binding.current.update(faces, size)
  const [state, setState] = useState<SearchState | null>(null)
  const latest = useRef(state)
  latest.current = state
  const publish = (value: SearchState | null) => {
    latest.current = value
    setState(value)
  }
  const find = () => {
    binding.current = sourceBinding()
    const current = sourceCapture(captured)
    if (!current) return
    const result = Recovery.findMatchingCube(
      current,
      recoveryRequest(current, captured, 'findMatchingCube', initialBudget),
      recoveryChecker(captured, size),
    )
    if (result.ok)
      publish({
        capture: current,
        session: result.value,
        review: Recovery.beginReview(result.value),
        faces: captured,
        origin: captured,
        issue: null,
        budget: initialBudget,
      })
  }
  const cancel = () => {
    const current = latest.current
    if (current)
      Recovery.cancel(current.review, Recovery.revision(current.review))
    publish(null)
  }
  const choose = (placement: Parameters<typeof Recovery.select>[2]) => {
    const current = latest.current
    if (!current || current.origin !== captured) return
    const result = Recovery.select(
      current.review,
      Recovery.revision(current.review),
      placement,
    )
    if (result.ok) publish({ ...current, review: result.value })
  }
  const resume = (faces: CapturedPhotos, back = false, budget?: number) => {
    const current = latest.current
    if (!current || current.origin !== captured) return
    const next = sourceCapture(faces)
    if (!next) return
    const action = back ? 'backAndResumeReview' : 'resumeReview'
    const result = (
      back ? Recovery.backAndResumeReview : Recovery.resumeReview
    )(
      next,
      current.review,
      Recovery.revision(current.review),
      recoveryRequest(next, faces, action, budget ?? current.budget),
      recoveryChecker(faces, size),
    )
    if (result.ok)
      publish({
        ...current,
        capture: next,
        budget: budget ?? current.budget,
        faces,
        session: result.value.session,
        review: result.value.review,
        issue:
          result.value.conflicts.map((item) => item.reason).join(' ') || null,
      })
  }
  const use = () => {
    const current = latest.current
    if (!current || current.origin !== captured) return
    const candidate = Recovery.selectedCandidate(current.review)
    const actual = sourceCapture(current.faces)
    if (!candidate || !actual) return
    const result = Recovery.useCandidate(
      actual,
      current.review,
      Recovery.revision(current.review),
      candidate.candidateId,
      recoveryChecker(current.faces, size),
    )
    if (!result.ok) {
      publish({ ...current, issue: result.error })
      return
    }
    // Install the exact Core confirmation once. A stale/closed review cannot
    // pass the next invocation, even before Preact publishes the state update.
    latest.current = null
    if (!commit(result.value.confirmed, current.faces)) {
      publish({
        ...current,
        review: result.value.review,
        issue: 'Capture changed. Cancel and start a new search.',
      })
      return
    }
    setState(null)
  }
  return {
    state: state?.origin === captured ? state : null,
    find,
    cancel,
    choose,
    use,
    resume,
    continueSearch: () => {
      const current = latest.current
      if (current)
        resume(
          current.faces,
          false,
          Math.min(20000, Math.max(5000, current.budget * 2)),
        )
    },
    back: () => {
      if (state) resume(state.faces, true)
    },
  }
}

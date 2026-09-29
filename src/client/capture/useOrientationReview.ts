import { useState } from 'preact/hooks'
import {
  answerWizard,
  wizardAfterRejection,
} from '../../core/capture/CaptureReviewRouting.gen'
import type {
  FaceKey,
  OrientedCandidate,
  OrientationSolution,
} from '../../cube/cubeAssembly'
import { FACE_ORDER, describeCenterIssue } from './captureSteps'
import { planCaptureReview, type CaptureApproval } from './captureReviewRouting'
import type { FaceCaptureData } from './captureTypes'
import { morphInto } from './flyAnimation'
import type { OrientationWizardState } from './orientationWizardDialog'

// How the captured faces fit together: the arrangement waiting for the
// customer's approval, the wizard that narrows several down to one, and a
// problem to show in the review. Choosing one arrangement is App's job,
// since it assembles the cube and learns the capture's colors.
export function useOrientationReview({
  capturedFaces,
  isGuidedCapture,
  onChoose,
}: {
  capturedFaces: Record<string, FaceCaptureData>
  isGuidedCapture: () => boolean
  onChoose: (candidate: OrientedCandidate) => void | Promise<void>
}) {
  // Non-null only when solveFaceOrientations found genuine ambiguity (see
  // its alternatives field) - drives the step-by-step orientation wizard
  // (see pickWizardFace/groupWizardOptions above) that narrows `remaining`
  // down to one candidate before assembly can proceed, instead of dumping
  // every alternative in one overwhelming grid. `truncated` mirrors
  // OrientationSolution.truncated: more genuinely-distinct ties existed
  // than the solver could keep, so `remaining` may not include every
  // possibility - shown to the customer rather than silently hidden.
  // `picked` lists the faces the customer answered directly; every other
  // settled face was inferred (see the progress net's dimming).
  const [orientationWizard, setOrientationWizard] =
    useState<OrientationWizardState | null>(null)
  // True while a picked option is animating into the net - blocks a second
  // pick from landing mid-flight.
  const [wizardMorphing, setWizardMorphing] = useState(false)
  // The arrangement(s) of the captured faces waiting for the customer's
  // OK (see handleConfirmReview): one to approve, a few to pick from, or a
  // closest match that isn't a valid cube. `fallback` feeds the wizard if
  // they say no.
  const [orientationApproval, setOrientationApproval] =
    useState<CaptureApproval | null>(null)
  // A problem with the capture shown in the review dialog.
  const [reviewNotice, setReviewNotice] = useState<string | null>(null)

  const clearOrientationReview = () => {
    setOrientationWizard(null)
    setOrientationApproval(null)
    setReviewNotice(null)
  }

  // After color review, or automatically for a high-confidence valid cube:
  // works out how the 6 photos fit together and
  // asks the customer to approve it, falling back step by step -
  //   guided capture (camera, sides then top/bottom): the 64 arrangements
  //   the turning pattern allows (solveGuidedCapture);
  //   otherwise, or if none of those is a valid cube: any arrangement at
  //   all (solveFaceOrientations), which also catches a capture that
  //   didn't follow the pattern;
  //   if nothing is a valid cube: the closest match, flagged, which can
  //   still be used or rejected.
  // Rejecting an arrangement opens the "Which way is your ... face?"
  // wizard with the remaining ones.
  const handleConfirmReview = (
    precomputedFree?: OrientationSolution | null,
  ) => {
    setReviewNotice(null)
    const faceData = Object.fromEntries(
      FACE_ORDER.map((face) => [face, capturedFaces[face].colors]),
    )
    const plan = planCaptureReview(
      faceData,
      FACE_ORDER,
      isGuidedCapture(),
      describeCenterIssue,
      precomputedFree,
    )
    switch (plan.kind) {
      case 'approval':
        setOrientationApproval(plan.approval)
        break
      case 'wizard':
        setOrientationWizard({
          remaining: plan.remaining,
          truncated: plan.truncated,
          picked: [],
        })
        break
      case 'notice':
        setReviewNotice(plan.message)
        break
      case 'choose':
        void onChoose(plan.candidate)
        break
    }
  }

  // "No, let me choose each side" (see wizardAfterRejection).
  const handleRejectOrientation = () => {
    if (!orientationApproval) return
    const wizard = wizardAfterRejection(orientationApproval)
    if (!wizard) return
    setOrientationApproval(null)
    setOrientationWizard(wizard as OrientationWizardState)
  }

  // Advances the orientation wizard by one answer (see answerWizard): the
  // next most informative question, or assembly once every face agrees.
  const handleWizardAnswer = (matched: OrientedCandidate[], face: FaceKey) => {
    const answer = answerWizard(null, matched, face)
    if (answer.kind === 'chosen') {
      void onChoose(answer.candidate)
      return
    }
    // Narrowed from the latest wizard state, not this render's.
    setOrientationWizard((prev) => {
      const next = answerWizard(prev, matched, face)
      return next.kind === 'narrowed'
        ? (next.wizard as OrientationWizardState | null)
        : prev
    })
  }

  // Clicking an option face flies it into the framed slot in the progress
  // net before the answer is applied, so the customer sees exactly where
  // their pick landed. The flying clone is removed in the next task, after
  // Preact's microtask re-render has already filled the slot - so the slot
  // never flashes back to its hatched placeholder in between. (A timer,
  // not requestAnimationFrame, since rAF doesn't fire in background tabs.)
  const handleWizardPick = async (
    optionEl: HTMLElement,
    candidates: OrientedCandidate[],
    face: FaceKey,
  ) => {
    if (wizardMorphing) return
    const source = optionEl.querySelector<HTMLElement>('.orientation-net-face')
    const target = document.querySelector<HTMLElement>(
      '.orientation-picker .orientation-net-face-current',
    )
    let removeClone = () => {}
    if (source && target) {
      setWizardMorphing(true)
      try {
        removeClone = await morphInto(source, target)
      } finally {
        setWizardMorphing(false)
      }
    }
    handleWizardAnswer(candidates, face)
    setTimeout(removeClone, 0)
  }

  return {
    orientationWizard,
    setOrientationWizard,
    wizardMorphing,
    orientationApproval,
    setOrientationApproval,
    reviewNotice,
    setReviewNotice,
    clearOrientationReview,
    handleConfirmReview,
    handleRejectOrientation,
    handleWizardPick,
  }
}

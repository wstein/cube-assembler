// What the user sees after checking sticker colors - the guided and
// free-search fallback order: typed entry point for
// src/core/capture/CaptureReviewRouting.res.
export {
  canSkipColorReview,
  planCaptureReview,
  readyAssemblyAfterCapture,
  rejectAlternatives,
} from '../../core/capture/CaptureReviewRouting.gen'

export type {
  captureApproval as CaptureApproval,
  captureReviewFace as CaptureReviewFace,
  captureReviewPlan as CaptureReviewPlan,
} from '../../core/capture/CaptureReviewRouting.gen'

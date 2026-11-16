// Candidate generation and incremental decisions remain ReScript-owned.
export {
  generate,
  generateForProtocol,
  knownAlternatives,
  presentChoices,
  propose,
  previewChoice,
  retainsMapping,
  matchesDecision,
  preserveMapping,
  previewFaces,
  reconcile,
  remaining,
  options,
  nextSlot,
  select,
  previous,
} from '../../core/capture/SpatialOrientationWizard.gen'
export type {
  candidate as SpatialCandidate,
  protocolSession as SpatialProtocolSession,
  presentedChoice as SpatialPresentedChoice,
  session as SpatialSession,
  choice as SpatialChoice,
  decision as SpatialDecision,
} from '../../core/capture/SpatialOrientationWizard.gen'

// When a reviewed capture's learned colors may create or update a color
// profile, how Automatic picks a saved profile, and how that is reported.
// Typed entry point for src/core/profiles/ColorProfileLearning.res.
export {
  assessPalette,
  balancedPaletteDistance,
  blendColorProfile,
  canCreateProfileFromCapture,
  captureProfileFinding,
  matchColorProfile,
  matchPartialColorProfile,
  profileColorFitPercent,
  profileToUpdate,
  resolveAutomaticProfile,
  shouldBlendColorProfile,
  summarizePreviewProfiles,
  updateProfileFromCapture,
} from '../../core/profiles/ColorProfileLearning.gen'

export type {
  automaticResolution as AutomaticResolution,
  paletteEvidence as PaletteEvidence,
} from '../../core/profiles/ColorProfileLearning.gen'

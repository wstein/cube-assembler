import { useState } from 'preact/hooks'
import type { recalibrateCapture } from './captureFinalization'
import { glareFacesToWarn } from './captureSteps'
import type { AutomaticResolution } from './colorProfileLearning'
import type { LearnedColorClassificationResult, RGB } from './imageProcessing'
import type { FixtureUploadMetadata } from './readFixtureUpload'
import { recordedAutomaticResolution } from './captureFixture'
import type { UsedColorProfile } from './profileSettings'

const CALIBRATION_NOTE = 'Colors double-checked by comparing all 6 sides.'

type Recalibration = Awaited<ReturnType<typeof recalibrateCapture>>

export interface PendingPalette {
  colors: Record<string, RGB>
  confidentFraction: number
  recalibrated: boolean
}

// What the six-face calibration of the current capture found: the colors
// it learned, the backdrop gains it applied, the color profile it resolved
// and why, and the faces and colors to warn about in the review.
export function useCaptureCalibration() {
  // The 6 colors as learned from this capture's own stickers (null when the
  // cross-face recalibration didn't run) - what the color-fix picker scores
  // each alternative against.
  const [learnedPalette, setLearnedPalette] = useState<Record<
    string,
    RGB
  > | null>(null)
  // Learned colors whose cluster mixed two colors (see mixedUpClusters).
  const [mixedUpColors, setMixedUpColors] = useState<string[]>([])
  // Learned colors waiting for the review to approve the cube before they
  // may create or update a color profile.
  const [pendingPalette, setPendingPalette] = useState<PendingPalette | null>(
    null,
  )
  // The cube geometry and colors selected when this capture was taken.
  const [captureProfile, setCaptureProfile] = useState<{
    id?: string
    name: string
  } | null>(null)
  const [resolvedColorProfile, setResolvedColorProfile] =
    useState<UsedColorProfile | null>(null)
  const [resolvedColorReference, setResolvedColorReference] = useState<Record<
    string,
    RGB
  > | null>(null)
  // Why Automatic settled on its six-face profile (or on none).
  const [automaticResolution, setAutomaticResolution] =
    useState<AutomaticResolution | null>(null)
  const [globalWhiteBalanceNote, setGlobalWhiteBalanceNote] = useState<
    string | null
  >(null)
  // Faces with glare-washed stickers, when enough to warn (see glareStickers).
  const [glareFaces, setGlareFaces] = useState<string[]>([])
  // The per-face background-derived gains actually applied this capture
  // (see computeBackgroundGains) - recorded in saved fixtures, which
  // replay them.
  const [appliedBackgroundGains, setAppliedBackgroundGains] = useState<Record<
    string,
    RGB
  > | null>(null)

  // A cube typed in or picked as solved was read with no color profile.
  const forgetResolvedProfile = () => {
    setResolvedColorProfile(null)
    setAutomaticResolution(null)
  }

  const clearCalibration = () => {
    setGlobalWhiteBalanceNote(null)
    setGlareFaces([])
    setAppliedBackgroundGains(null)
    setLearnedPalette(null)
    setMixedUpColors([])
    setPendingPalette(null)
    setCaptureProfile(null)
    setResolvedColorReference(null)
    forgetResolvedProfile()
  }

  // Opening the camera drops the last calibration's findings; the resolved
  // profile only goes when the capture starts over.
  const startCapture = (startOver: boolean) => {
    if (startOver) forgetResolvedProfile()
    setGlobalWhiteBalanceNote(null)
    setGlareFaces([])
    setAppliedBackgroundGains(null)
    setResolvedColorReference(null)
  }

  // Before recalibrating six faces: a selected profile is known already,
  // Automatic's is not.
  const startRecalibration = (selected: UsedColorProfile | null) => {
    setPendingPalette(null)
    setResolvedColorProfile(selected)
    setAutomaticResolution(null)
    setResolvedColorReference(null)
  }

  const applyRecalibration = (
    result: Recalibration,
    profile: { id: string; name: string },
  ) => {
    setAutomaticResolution(result.resolution)
    setResolvedColorReference(result.reference)
    setResolvedColorProfile(result.resolvedProfile)
    setLearnedPalette(result.learnedPalette)
    setMixedUpColors(result.mixedUp)
    setPendingPalette(result.pendingPalette)
    setCaptureProfile({ id: profile.id, name: profile.name })
    setGlobalWhiteBalanceNote(result.applied ? CALIBRATION_NOTE : null)
    setGlareFaces(result.glare)
  }

  const failRecalibration = () => {
    setGlobalWhiteBalanceNote(null)
    setGlareFaces([])
    setLearnedPalette(null)
    setMixedUpColors([])
    setPendingPalette(null)
  }

  // An uploaded fixture brings the profiles and reasons it recorded; its
  // colors are learned again from its photos.
  const applyFixtureCalibration = (
    capture: FixtureUploadMetadata['capture'],
    wb: LearnedColorClassificationResult,
    recordedGains: Record<string, RGB> | null,
  ) => {
    setPendingPalette(null)
    const recordedProfile = capture?.profile
    setCaptureProfile(
      recordedProfile?.name
        ? { id: recordedProfile.id, name: recordedProfile.name }
        : null,
    )
    const recordedColors = capture?.colorProfile
    setResolvedColorProfile(
      recordedColors?.name && recordedColors.colors ? recordedColors : null,
    )
    // The recorded reason for it, where the fixture has one.
    setAutomaticResolution(
      recordedAutomaticResolution(capture?.colorResolution),
    )
    setResolvedColorReference(capture?.colorReference ?? null)
    setAppliedBackgroundGains(recordedGains)
    setGlareFaces(glareFacesToWarn(wb.glare))
    setGlobalWhiteBalanceNote(wb.applied ? CALIBRATION_NOTE : null)
    setLearnedPalette(wb.learned?.colors ?? null)
    setMixedUpColors(wb.learned?.mixedUpColors ?? [])
  }

  return {
    learnedPalette,
    mixedUpColors,
    pendingPalette,
    setPendingPalette,
    captureProfile,
    resolvedColorProfile,
    resolvedColorReference,
    automaticResolution,
    globalWhiteBalanceNote,
    glareFaces,
    appliedBackgroundGains,
    setAppliedBackgroundGains,
    forgetResolvedProfile,
    clearCalibration,
    startCapture,
    startRecalibration,
    applyRecalibration,
    failRecalibration,
    applyFixtureCalibration,
  }
}

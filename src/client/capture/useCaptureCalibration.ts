import { useReducer } from 'preact/hooks'
import {
  calibrationReducer,
  initialCalibration,
} from '../../core/capture/CaptureCalibration.gen'
import type { recalibrateCapture } from './captureFinalization'
import type { AutomaticResolution } from '../profiles/colorProfileLearning'
import type { LearnedColorClassificationResult } from './captureRecalibration'
import type { RGB } from '../vision/stickerColorGeometry'
import type { FixtureUploadMetadata } from '../fixtures/readFixtureUpload'
import type { UsedColorProfile } from '../profiles/profileSettings'

type Recalibration = Awaited<ReturnType<typeof recalibrateCapture>>
type Action = Parameters<typeof calibrationReducer>[1]

export interface PendingPalette {
  colors: Record<string, RGB>
  confidentFraction: number
  recalibrated: boolean
}

// What the six-face calibration of the current capture found: the colors
// it learned, the backdrop gains it applied, the color profile it resolved
// and why, and the faces and colors to warn about in the review. The state
// and its changes live in src/core/capture/CaptureCalibration.res.
export function useCaptureCalibration() {
  const [state, dispatch] = useReducer(
    calibrationReducer,
    undefined,
    initialCalibration,
  )
  const act = (action: Action) => dispatch(action)

  return {
    learnedPalette: state.learnedPalette as Record<string, RGB> | null,
    mixedUpColors: state.mixedUpColors as string[],
    pendingPalette: state.pendingPalette as PendingPalette | null,
    setPendingPalette: (palette: PendingPalette | null) =>
      act({ kind: 'setPendingPalette', palette }),
    captureProfile: state.captureProfile,
    resolvedColorProfile: state.resolvedColorProfile as UsedColorProfile | null,
    resolvedColorReference: state.resolvedColorReference as Record<
      string,
      RGB
    > | null,
    automaticResolution:
      state.automaticResolution as AutomaticResolution | null,
    globalWhiteBalanceNote: state.globalWhiteBalanceNote,
    glareFaces: state.glareFaces as string[],
    appliedBackgroundGains: state.appliedBackgroundGains as Record<
      string,
      RGB
    > | null,
    setAppliedBackgroundGains: (gains: Record<string, RGB> | null) =>
      act({ kind: 'setAppliedBackgroundGains', gains }),
    // A cube typed in or picked as solved was read with no color profile.
    forgetResolvedProfile: () => act('forgetResolvedProfile'),
    clearCalibration: () => act('clear'),
    startCapture: (startOver: boolean) =>
      act({ kind: 'startCapture', startOver }),
    startRecalibration: (selected: UsedColorProfile | null) =>
      act({ kind: 'startRecalibration', selected }),
    applyRecalibration: (
      result: Recalibration,
      profile: { id: string; name: string },
    ) =>
      act({
        kind: 'applyRecalibration',
        result,
        profile: { id: profile.id, name: profile.name },
      }),
    failRecalibration: () => act('failRecalibration'),
    applyFixtureCalibration: (
      capture: FixtureUploadMetadata['capture'],
      classified: LearnedColorClassificationResult,
      recordedGains: Record<string, RGB> | null,
    ) =>
      act({
        kind: 'applyFixtureCalibration',
        capture,
        classified,
        recordedGains,
      }),
  }
}

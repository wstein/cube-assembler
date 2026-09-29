import { Fragment } from 'preact'
import type { CaptureMode } from './capturePhoto'
import { CaptureTurnOverlay } from './captureTurnCue'
import {
  stickerSampleRect,
  type ColorDetectionResult,
  type SamplingGeometry,
} from '../imageProcessing'

interface CaptureLiveViewProps {
  webcamRef: { current: HTMLVideoElement | null }
  mirrorPreview: boolean
  captureMode: CaptureMode
  liveDetection: ColorDetectionResult | null
  liveFaceVisible: boolean
  liveNeedsRecentering: boolean
  liveCapturedFace: string | null
  liveAutoColorProfileName?: string
  liveMedianWB: boolean
  automaticColors: boolean
  autoCapture: boolean
  autoCaptureFrames: number
  // Matching frames auto capture waits for.
  stableFrames: number
  autoCapturePaused: boolean
  captureFlash: boolean
  captureSound: boolean
  turnOverlay: {
    step: number
    startColors: string[][]
    viaColors?: string[][]
  } | null
  capturedColors: string[][][]
  sampling: SamplingGeometry
  stickerColors: Record<string, string>
  faceLabels: Record<string, string>
  onContinueTurn: () => void
  onMirrorChange: (enabled: boolean) => void
  onAutoCaptureChange: (enabled: boolean) => void
  onSoundChange: (enabled: boolean) => void
}

export function CaptureLiveView({
  webcamRef,
  mirrorPreview,
  captureMode,
  liveDetection,
  liveFaceVisible,
  liveNeedsRecentering,
  liveCapturedFace,
  liveAutoColorProfileName,
  liveMedianWB,
  automaticColors,
  autoCapture,
  autoCaptureFrames,
  stableFrames,
  autoCapturePaused,
  captureFlash,
  captureSound,
  turnOverlay,
  capturedColors,
  sampling,
  stickerColors,
  faceLabels,
  onContinueTurn,
  onMirrorChange,
  onAutoCaptureChange,
  onSoundChange,
}: CaptureLiveViewProps) {
  return (
    <div class="capture-live">
      <div class="capture-video-wrapper">
        <video
          ref={webcamRef}
          autoplay
          muted
          playsinline
          class={`webcam-feed ${mirrorPreview ? 'mirrored' : ''}`}
        />
        {liveDetection && liveFaceVisible && (
          // Positioned from stickerSampleRect in percent of the guide
          // square, so the overlay shows exactly what the detector
          // reads: thin cell lines, and each sampled zone outlined in the
          // color it reads as.
          <div
            class={`capture-grid-overlay ${mirrorPreview ? 'mirrored' : ''}`}
            style={
              liveDetection.gridOffset && {
                '--grid-x': liveDetection.gridOffset.x,
                '--grid-y': liveDetection.gridOffset.y,
                '--grid-scale': liveDetection.gridOffset.scale,
                '--grid-angle': liveDetection.gridOffset.angle,
              }
            }
          >
            {liveDetection.colors.map((row, r) =>
              row.map((color, c) => {
                const n = liveDetection.colors.length
                const outer = liveDetection.outerCellRatio ?? 1
                const cell = stickerSampleRect(
                  r,
                  c,
                  n,
                  100,
                  100,
                  { ...sampling, stickerCore: 1 },
                  outer,
                )
                const zone = stickerSampleRect(
                  r,
                  c,
                  n,
                  100,
                  100,
                  sampling,
                  outer,
                )
                return (
                  <Fragment key={`${r}-${c}`}>
                    <div
                      class="capture-grid-cell"
                      style={{
                        left: `${cell.x}%`,
                        top: `${cell.y}%`,
                        width: `${cell.width}%`,
                        height: `${cell.height}%`,
                      }}
                    />
                    <div
                      class="capture-sample-zone"
                      style={{
                        left: `${zone.x}%`,
                        top: `${zone.y}%`,
                        width: `${zone.width}%`,
                        height: `${zone.height}%`,
                        borderColor: stickerColors[color] ?? '#888',
                      }}
                    />
                  </Fragment>
                )
              }),
            )}
          </div>
        )}
        {/* Guide mode frames the exact sample square. Detect face shows
        the wider seam search area; its moving grid marks the crop. */}
        <div
          class={`capture-scan-frame ${captureMode === 'cv' ? 'cv-search-frame' : ''} ${liveCapturedFace ? 'pattern-match' : ''} ${autoCapture && autoCaptureFrames > 0 ? 'capture-holding' : ''} ${captureFlash ? 'capture-flashed' : ''}`}
        >
          <span class="capture-scan-label">
            {captureMode === 'cv'
              ? liveNeedsRecentering
                ? 'Move face toward center'
                : 'Show one face in this area'
              : 'Fit face in this square'}
          </span>
          {captureMode === 'cv' && autoCapture && autoCaptureFrames > 0 && (
            <svg
              class={`capture-progress-ring ${autoCapturePaused ? 'paused' : ''}`}
              viewBox="0 0 40 40"
              aria-hidden="true"
            >
              <circle class="capture-progress-track" cx="20" cy="20" r="16" />
              <circle
                class="capture-progress-fill"
                cx="20"
                cy="20"
                r="16"
                style={{
                  strokeDashoffset: `${100.53 * (1 - autoCaptureFrames / stableFrames)}`,
                }}
              />
            </svg>
          )}
        </div>
        {captureFlash && <div class="capture-flash" aria-hidden="true" />}
        {turnOverlay && (
          <CaptureTurnOverlay
            stickerColors={stickerColors}
            step={turnOverlay.step}
            startColors={turnOverlay.startColors}
            viaColors={turnOverlay.viaColors}
            capturedColors={capturedColors}
            mirrored={mirrorPreview}
            onContinue={onContinueTurn}
          />
        )}
        <span
          class={`capture-live-badge ${liveCapturedFace ? 'pattern-match' : ''}`}
          role="status"
        >
          <span class="capture-live-dot" />
          Live ·{' '}
          {liveCapturedFace
            ? `Looks like ${faceLabels[liveCapturedFace]} · capture allowed`
            : captureMode === 'cv' && liveNeedsRecentering
              ? 'Move face toward center'
              : liveDetection
                ? liveFaceVisible
                  ? `${(liveDetection.confidence * 100).toFixed(0)}% color match`
                  : captureMode === 'cv'
                    ? 'Align face in view'
                    : 'Align face in guide'
                : '—'}
          {automaticColors &&
            liveAutoColorProfileName &&
            ` · ${liveAutoColorProfileName}`}
          {liveMedianWB && ' · median WB'}
        </span>
      </div>
      <div class="capture-live-options">
        <label class="mirror-toggle">
          <input
            type="checkbox"
            checked={mirrorPreview}
            onChange={(e) => onMirrorChange(e.currentTarget.checked)}
          />
          Mirror
        </label>
        {captureMode === 'cv' && (
          <>
            <label class="auto-capture-toggle">
              <input
                type="checkbox"
                checked={autoCapture}
                onChange={(e) => onAutoCaptureChange(e.currentTarget.checked)}
              />
              <span>
                {autoCapture
                  ? `Auto capture · matching frames ${autoCaptureFrames}/${stableFrames}${autoCapturePaused ? ' · paused' : ''}`
                  : 'Auto capture'}
              </span>
            </label>
            <label class="capture-sound-toggle">
              <input
                type="checkbox"
                checked={captureSound}
                onChange={(e) => {
                  const enabled = e.currentTarget.checked
                  onSoundChange(enabled)
                }}
              />
              Sound
            </label>
          </>
        )}
      </div>
    </div>
  )
}

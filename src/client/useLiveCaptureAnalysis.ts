import { useEffect, useRef } from 'preact/hooks'
import { liveFrameStep, startState } from '../core/capture/LiveCapture.gen'
import type { TurnCuePose } from './autoCapture'
import { scaleBounds, type LiveAnalysisRequest } from './liveAnalysis'
import type { LiveFrameMessage, LiveResultMessage } from './liveAnalysis.worker'
import {
  captureAndProcessCanvas,
  type ColorDetectionResult,
  type FaceCaptureResult,
  type RGB,
  type SamplingGeometry,
} from './imageProcessing'
import type { ColorProfile } from './profileSettings'
import type { CaptureMode } from './capturePhoto'

// Live reads use 720p copies of 1080p frames at much lower cost; captures
// still process the checked frame at full resolution.
const LIVE_ANALYSIS_HEIGHT = 720

interface LiveCaptureOptions {
  open: boolean
  loading: boolean
  turnCueShowing: boolean
  face: string
  faceOrder: readonly string[]
  size: number
  mode: CaptureMode
  sampling: SamplingGeometry
  palette?: Record<string, RGB>
  autoProfiles: ColorProfile[]
  autoColorsSelected: boolean
  provisionalProfileId: string | null
  autoCapture: boolean
  // Matching frames before auto capture takes the photo.
  stableFrames: number
  capturedFaces: Record<
    string,
    { colors: string[][]; backgroundColor?: RGB | null }
  >
  videoRef: { current: HTMLVideoElement | null }
  lastCapturedColors: { current: string[][] | null }
  lastCapturedPose: { current: TurnCuePose | null }
  pendingFlyIn: { current: { slot: string; from: DOMRect } | null }
  setAutoCaptureFrames: (frames: number) => void
  setAutoCapturePaused: (paused: boolean) => void
  setLiveDetection: (detection: ColorDetectionResult | null) => void
  setLiveFaceVisible: (visible: boolean) => void
  setLiveNeedsRecentering: (needed: boolean) => void
  setLiveMedianWB: (available: boolean) => void
  setLiveAutoColorProfileId: (id: string | null) => void
  setLiveCapturedFace: (face: string | null) => void
  setCaptureMessage: (message: string) => void
  onTurnCueCleared: () => void
  onCaptureSignal: () => void
  onAutoCapture: (
    result: FaceCaptureResult,
    profileId: string | null,
  ) => Promise<void>
}

export function useLiveCaptureAnalysis(options: LiveCaptureOptions) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const workerRef = useRef<Worker | null>(null)
  const autoCaptureInFlight = useRef(false)
  // Callbacks read the latest app state without resetting the five-frame hold.
  const actions = useRef({
    onTurnCueCleared: options.onTurnCueCleared,
    onCaptureSignal: options.onCaptureSignal,
    onAutoCapture: options.onAutoCapture,
  })
  actions.current = {
    onTurnCueCleared: options.onTurnCueCleared,
    onCaptureSignal: options.onCaptureSignal,
    onAutoCapture: options.onAutoCapture,
  }

  useEffect(
    () => () => {
      workerRef.current?.terminate()
    },
    [],
  )

  const {
    open,
    loading,
    turnCueShowing,
    face,
    faceOrder,
    size,
    mode,
    sampling,
    palette,
    autoProfiles,
    autoColorsSelected,
    provisionalProfileId,
    autoCapture,
    stableFrames,
    capturedFaces,
    videoRef,
    lastCapturedColors,
    lastCapturedPose,
    pendingFlyIn,
    setAutoCaptureFrames,
    setAutoCapturePaused,
    setLiveDetection,
    setLiveFaceVisible,
    setLiveNeedsRecentering,
    setLiveMedianWB,
    setLiveAutoColorProfileId,
    setLiveCapturedFace,
    setCaptureMessage,
  } = options

  useEffect(() => {
    setAutoCaptureFrames(0)
    setAutoCapturePaused(false)
    if (!open) {
      setLiveDetection(null)
      setLiveFaceVisible(false)
      setLiveNeedsRecentering(false)
      setLiveMedianWB(false)
      setLiveAutoColorProfileId(null)
      setLiveCapturedFace(null)
      return
    }
    if (loading) return

    canvasRef.current ??= document.createElement('canvas')
    const canvas = canvasRef.current
    let state = startState()
    const capturedBackgrounds = Object.fromEntries(
      faceOrder.map((key) => [
        key,
        capturedFaces[key]?.backgroundColor ?? null,
      ]),
    )
    const worker = (workerRef.current ??= new Worker(
      new URL('./liveAnalysis.worker.ts', import.meta.url),
      { type: 'module' },
    ))
    let active = true
    let frameId = 0
    let inFlight: number | null = null

    const onResult = (event: MessageEvent<LiveResultMessage>) => {
      const full = event.data.frame
      if (!active || event.data.id !== inFlight) {
        full.close()
        return
      }
      try {
        if ('error' in event.data) throw new Error(event.data.error)
        const { result } = event.data
        const bounds = scaleBounds(result.bounds, event.data.scale)
        const step = liveFrameStep(
          state,
          {
            bounds,
            detection: result.detection,
            visible: result.visible,
            backgroundFound: result.backgroundColor !== null,
            colorProfileId: result.colorProfileId,
          },
          {
            detectFace: mode === 'cv',
            autoCapture,
            captureBusy: autoCaptureInFlight.current,
            stableFrames,
            turnCueShowing,
            provisionalProfileId,
            lastCapturedColors: lastCapturedColors.current,
            lastCapturedPose: lastCapturedPose.current,
            capturedColors: faceOrder.map((key) => capturedFaces[key]?.colors),
            faceIndex: faceOrder.indexOf(face),
          },
        )
        state = step.state
        setLiveNeedsRecentering(step.needsRecentering)
        setLiveMedianWB(step.medianWhiteBalance)
        setLiveAutoColorProfileId(step.autoColorProfileId)
        if (step.turnCueCleared) {
          lastCapturedColors.current = null
          lastCapturedPose.current = null
          if (turnCueShowing) actions.current.onTurnCueCleared()
        }
        if (step.view) {
          setLiveDetection(step.view.detection)
          setLiveFaceVisible(step.view.visible)
          setLiveCapturedFace(
            step.view.matchedSlot === null
              ? null
              : faceOrder[step.view.matchedSlot],
          )
        }
        if (step.autoCaptureView) {
          setAutoCaptureFrames(step.autoCaptureView.frames)
          setAutoCapturePaused(step.autoCaptureView.paused)
        }
        if (step.capture) {
          autoCaptureInFlight.current = true
          const frame = document
            .querySelector('.capture-scan-frame')
            ?.getBoundingClientRect()
          if (frame) pendingFlyIn.current = { slot: face, from: frame }
          try {
            // Read the frame whose grid was checked, at its full resolution.
            canvas.width = full.width
            canvas.height = full.height
            canvas.getContext('2d')?.drawImage(full, 0, 0)
            const autoPalette = autoProfiles.find(
              (candidate) => candidate.id === result.colorProfileId,
            )?.colors
            const captured = captureAndProcessCanvas(
              canvas,
              size,
              result.gains,
              sampling,
              palette ?? autoPalette,
              'aligned',
              bounds,
            )
            actions.current.onCaptureSignal()
            void actions.current
              .onAutoCapture(captured, result.colorProfileId ?? null)
              .catch((error) =>
                setCaptureMessage(
                  `❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
                ),
              )
              .finally(() => {
                autoCaptureInFlight.current = false
              })
          } catch (error) {
            autoCaptureInFlight.current = false
            setCaptureMessage(
              `❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
            )
          }
        }
      } catch {
        setLiveDetection(null)
        setLiveFaceVisible(false)
        setLiveMedianWB(false)
        setLiveCapturedFace(null)
        setAutoCapturePaused(state.progress !== null)
      } finally {
        full.close()
        inFlight = null
      }
    }
    worker.addEventListener('message', onResult)

    const captureNextFrame = async () => {
      const video = videoRef.current
      if (
        inFlight ||
        !video ||
        video.videoWidth === 0 ||
        video.videoHeight === 0
      )
        return
      const id = ++frameId
      inFlight = id
      try {
        const frame = await createImageBitmap(video)
        if (!active || inFlight !== id) {
          frame.close()
          return
        }
        const request: LiveAnalysisRequest = {
          gridSize: size,
          mode: mode === 'cv' ? 'aligned' : 'fixed',
          requireOutline: mode === 'cv',
          sampling,
          palette,
          autoProfiles:
            autoColorsSelected && !palette ? autoProfiles : undefined,
          capturedBackgrounds,
        }
        worker.postMessage(
          {
            id,
            frame,
            maxHeight: LIVE_ANALYSIS_HEIGHT,
            request,
          } satisfies LiveFrameMessage,
          [frame],
        )
      } catch {
        if (inFlight === id) inFlight = null
      }
    }
    const intervalId = setInterval(() => {
      void captureNextFrame()
    }, 200)

    return () => {
      active = false
      clearInterval(intervalId)
      worker.removeEventListener('message', onResult)
      inFlight = null
    }
  }, [
    open,
    turnCueShowing,
    loading,
    face,
    faceOrder,
    size,
    sampling,
    palette,
    autoProfiles,
    autoColorsSelected,
    provisionalProfileId,
    mode,
    autoCapture,
    stableFrames,
    capturedFaces,
  ])
}

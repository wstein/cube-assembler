import { render, h, Fragment } from 'preact'
import { useState, useEffect, useRef } from 'preact/hooks'
import { TwistyPlayer } from 'cubing/twisty'
import '../../web/style.css'
import {
  captureAndProcessFace, captureAndProcessImage, extractCubeFaceColors,
  estimateGrayWorldGains, runGlobalWhiteBalance, WHITE_BALANCE_PRESETS, NEUTRAL_GAINS,
  rgbToOKLCH, formatOKLCHValues, hueCircularRange, hueRangesOverlap, linearRange,
  type ColorDetectionResult, type FaceCaptureResult, type RGB,
} from './imageProcessing'
import { assembleCubeFromFaces, validateFaceColors, createSolvedCube, toCubeIR, solveFaceOrientations } from './cubeAssembly'
import { toWRGFacelets, fromWRGFacelets, toURFFacelets, fromURFFacelets, detectNotationFormat } from './notationOutput'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface CubeState {
  size: number
  captured: Record<string, boolean>
  colors?: Record<string, string[]>
}

interface FaceCaptureData {
  colors: string[][]
  cellConfidences?: number[][]
  cellColors?: RGB[][]
  confidence: number
  croppedImage?: string
  timestamp: number
}

interface AssemblyResult {
  type: 'start' | 'stage' | 'result' | 'error'
  total?: number
  stage?: string
  count?: number
  tested?: number
  states?: any[]
  message?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// API Calls
// ─────────────────────────────────────────────────────────────────────────────

async function generateScramble(size: number): Promise<string> {
  const res = await fetch(`/api/scramble?size=${size}`)
  const data = await res.json()
  return data.scramble || 'Failed to generate scramble'
}

async function applyAlgorithm(cube: any, alg: string, size: number): Promise<any> {
  const res = await fetch('/api/apply-alg', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cube: toCubeIR(cube, size), alg }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Apply algorithm failed (${res.status}): ${text.slice(0, 200)}`)
  }
  return res.json()
}

async function checkParity(cube: any, size: number): Promise<any> {
  const res = await fetch('/api/parity', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cube: toCubeIR(cube, size) }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Parity check failed (${res.status}): ${text.slice(0, 200)}`)
  }
  return res.json()
}

function streamAssembly(faces: any, size: number): EventSource {
  return new EventSource(
    `/api/assemble?faces=${encodeURIComponent(JSON.stringify(faces))}&size=${size}`
  )
}

// /api/apply-alg currently returns raw KPatternData (the ReScript
// kPatternDataToIR bridge is an unimplemented stub), not a usable cube
// state. Reject rather than silently corrupting `cube` with a non-cube
// object.
function extractCubeFromApplyAlgResult(result: any): any {
  if (result && result.cube && result.cube.u && result.cube.r) {
    return result.cube
  }
  throw new Error(
    'Applying algorithms is not fully implemented yet: the server returns raw ' +
    'kPatternData instead of face colors. The cube state was left unchanged.'
  )
}

const FACE_ORDER = ['U', 'R', 'F', 'D', 'L', 'B']

// Face identity (which physical face is U vs R vs F...) can't actually be
// determined from a photo — it depends on how the user is holding the cube,
// which this app has no way to verify. So capture asks for 6 neutral faces
// in a fixed order rather than claiming to know which is "the U face";
// FACE_ORDER's positions still map 1:1 to U/R/F/D/L/B internally, since
// cube assembly/notation/the server API all key off those letters.
const FACE_DISPLAY_LABEL: Record<string, string> = Object.fromEntries(
  FACE_ORDER.map((face, i) => [face, String(i + 1)])
)

const STICKER_HEX: Record<string, string> = {
  W: '#ffffff', O: '#ff8000', G: '#44ee00', R: '#ff0000', B: '#2266ff', Y: '#f4f400',
}

function confidenceTier(c: number): 'high' | 'medium' | 'low' {
  return c >= 0.8 ? 'high' : c >= 0.5 ? 'medium' : 'low'
}

// Renders a sample's OKLCH components as 3 stacked lines (L%, C%, Hdeg)
// rather than formatOKLCHValues' single space-separated line - meant for
// small sticker-grid cells, where 3 short lines fit and read more clearly
// than one long wrapped one.
function OklchLines({ oklch, class: className }: { oklch: { l: number; c: number; h: number }; class?: string }) {
  const lPct = Math.round(oklch.l * 100)
  const cPct = Math.round((oklch.c / 0.4) * 100)
  const h = Math.round(oklch.h)
  return (
    <span class={className}>
      <span class="oklch-line">{lPct}%</span>
      <span class="oklch-line">{cPct}%</span>
      <span class="oklch-line">{h}deg</span>
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// App Component
// ─────────────────────────────────────────────────────────────────────────────

function App() {
  const [puzzleSize, setPuzzleSize] = useState(3)
  const [cube, setCube] = useState<any>(null)
  const [scramble, setScramble] = useState('')
  const [algorithm, setAlgorithm] = useState('')
  const [assemblyResults, setAssemblyResults] = useState<any[]>([])
  const [parity, setParity] = useState<any>(null)
  const [webcamOpen, setWebcamOpen] = useState(false)
  const [webcamFace, setWebcamFace] = useState('U')
  const [capturedFaces, setCapturedFaces] = useState<Record<string, FaceCaptureData>>({})
  const [faceConfidence, setFaceConfidence] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(false)
  const [captureMessage, setCaptureMessage] = useState('')
  const [fixtureSaveMessage, setFixtureSaveMessage] = useState('')
  const [manualColorInput, setManualColorInput] = useState('')
  const [showColorInput, setShowColorInput] = useState(false)
  const [notationFormat, setNotationFormat] = useState<'wrg' | 'urf'>('wrg')
  const [liveDetection, setLiveDetection] = useState<ColorDetectionResult | null>(null)
  const [showReviewDialog, setShowReviewDialog] = useState(false)
  const [reviewEditingCell, setReviewEditingCell] = useState<{ face: string; row: number; col: number } | null>(null)
  const [whiteBalanceMode, setWhiteBalanceMode] = useState<'auto' | keyof typeof WHITE_BALANCE_PRESETS>('auto')
  const [autoWhiteBalance, setAutoWhiteBalance] = useState<{ gains: RGB; lightSource: string } | null>(null)
  // "Auto" white balance is estimated live while framing face 1, then
  // locked to whatever it was AT THE MOMENT face 1 was captured - faces
  // 2-6 reuse that same gain rather than each re-estimating from
  // scratch, so a composition change between shots (more/less of the
  // background in frame, etc) can't quietly shift the correction
  // face-to-face. Reset whenever a fresh 6-face session starts.
  const [lockedAutoGains, setLockedAutoGains] = useState<{ gains: RGB; lightSource: string } | null>(null)
  // Most laptop/webcam feeds are shown mirrored by convention (like a
  // physical mirror), which is what most users expect; default on but
  // let it be turned off for cameras that don't need it (e.g. a rear
  // phone camera fed in via some capture setups).
  const [mirrorPreview, setMirrorPreview] = useState(true)
  const [globalWhiteBalanceNote, setGlobalWhiteBalanceNote] = useState<string | null>(null)
  const [reviewStep, setReviewStep] = useState(0)
  const webcamRef = useRef<HTMLVideoElement>(null)
  const sampleCanvasRef = useRef<HTMLCanvasElement | null>(null)

  // ─────────────────────────────────────────────────────────────────────────
  // Webcam Capture
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!webcamOpen || !webcamRef.current) return

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' } })
      .then((stream) => {
        if (webcamRef.current) {
          webcamRef.current.srcObject = stream
        }
      })
      .catch((err) => console.error('Webcam error:', err))

    return () => {
      if (webcamRef.current?.srcObject) {
        (webcamRef.current.srcObject as MediaStream).getTracks().forEach((t) => t.stop())
      }
    }
  }, [webcamOpen])

  // Live sticker-color preview: sample the video feed a few times a second
  // so the grid overlay shows detected colors before the user commits to a
  // capture, instead of only finding out the result afterward.
  useEffect(() => {
    if (!webcamOpen) {
      setLiveDetection(null)
      return
    }

    if (!sampleCanvasRef.current) {
      sampleCanvasRef.current = document.createElement('canvas')
    }
    const canvas = sampleCanvasRef.current

    const intervalId = setInterval(() => {
      const video = webcamRef.current
      if (!video || video.videoWidth === 0 || video.videoHeight === 0) return

      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      ctx.drawImage(video, 0, 0)

      let gains = NEUTRAL_GAINS
      if (whiteBalanceMode === 'auto') {
        if (lockedAutoGains) {
          // Faces 2-6: reuse face 1's locked estimate instead of
          // re-estimating from this frame's (possibly different) framing.
          gains = lockedAutoGains.gains
        } else {
          try {
            const estimate = estimateGrayWorldGains(canvas)
            setAutoWhiteBalance(estimate)
            if (estimate) gains = estimate.gains
          } catch {
            // Leave the previous auto estimate in place on a transient failure.
          }
        }
      } else {
        gains = WHITE_BALANCE_PRESETS[whiteBalanceMode]
      }

      try {
        setLiveDetection(extractCubeFaceColors(canvas, puzzleSize, gains))
      } catch {
        // Transient frame read failure (e.g. camera still warming up) — skip this tick.
      }
    }, 200)

    return () => clearInterval(intervalId)
  }, [webcamOpen, puzzleSize, whiteBalanceMode, lockedAutoGains])

  const twistyPlayerRef = useRef<TwistyPlayer | null>(null)

  useEffect(() => {
    const container = document.getElementById('twisty-player-container')
    if (!container) return

    const player = new TwistyPlayer({
      puzzle: `${puzzleSize}x${puzzleSize}x${puzzleSize}` as any,
      visualization: '3D',
      background: 'checkered',
      controlPanel: 'bottom-row',
      alg: algorithm || '',
      experimentalSetupAlg: scramble || '',
    })

    container.innerHTML = ''
    container.appendChild(player)
    twistyPlayerRef.current = player

    return () => {
      twistyPlayerRef.current = null
      container.innerHTML = ''
    }
  }, [puzzleSize])

  // TwistyPlayer visualizes puzzles via move sequences (alg /
  // experimentalSetupAlg), not arbitrary facelet colors — there's no API to
  // feed it an assembled cube state directly (that would need a solver to
  // find an equivalent setup alg). So the viewer reflects the entered
  // scramble/algorithm rather than the photo-captured/manual cube state.
  useEffect(() => {
    if (twistyPlayerRef.current) {
      twistyPlayerRef.current.experimentalSetupAlg = scramble || ''
    }
  }, [scramble])

  useEffect(() => {
    if (twistyPlayerRef.current) {
      twistyPlayerRef.current.alg = algorithm || ''
    }
  }, [algorithm])

  // ─────────────────────────────────────────────────────────────────────────
  // Features: Scramble Generation (#8)
  // ─────────────────────────────────────────────────────────────────────────

  const handleGenerateScramble = async () => {
    setLoading(true)
    try {
      const newScramble = await generateScramble(puzzleSize)
      setScramble(newScramble)
    } finally {
      setLoading(false)
    }
  }

  const handleApplyScramble = async () => {
    if (!scramble || !cube) return
    setLoading(true)
    try {
      const result = await applyAlgorithm(cube, scramble, puzzleSize)
      setCube(extractCubeFromApplyAlgResult(result))
      setScramble('')
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Features: Algorithm Execution (#7)
  // ─────────────────────────────────────────────────────────────────────────

  const handleApplyAlgorithm = async () => {
    if (!algorithm || !cube) return
    setLoading(true)
    try {
      const result = await applyAlgorithm(cube, algorithm, puzzleSize)
      const newCube = extractCubeFromApplyAlgResult(result)
      setCube(newCube)
      await updateParityStatus(newCube)
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }

  const handleInvertAlgorithm = async () => {
    if (!algorithm || !cube) return
    setLoading(true)
    try {
      const inverted = algorithm
        .split(/\s+/)
        .map((m) => (m.endsWith("'") ? m.slice(0, -1) : m + "'"))
        .reverse()
        .join(' ')
      const result = await applyAlgorithm(cube, inverted, puzzleSize)
      const newCube = extractCubeFromApplyAlgResult(result)
      setCube(newCube)
      await updateParityStatus(newCube)
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }

  const handlePresetAlgorithm = (algo: string) => {
    setAlgorithm(algo)
  }

  const handleApplySolved = async () => {
    const solved = createSolvedCube(puzzleSize)
    setCube(solved)

    const solvedFaceGrid = (color: string): string[][] =>
      Array.from({ length: puzzleSize }, () => Array(puzzleSize).fill(color))
    const solvedColors: Record<string, string> = { U: 'W', R: 'R', F: 'G', D: 'Y', L: 'O', B: 'B' }

    const newCapturedFaces: Record<string, FaceCaptureData> = {}
    for (const face of FACE_ORDER) {
      newCapturedFaces[face] = {
        colors: solvedFaceGrid(solvedColors[face]),
        confidence: 1.0,
        timestamp: Date.now(),
      }
    }
    setCapturedFaces(newCapturedFaces)
    await updateParityStatus(solved)
  }

  const handleApplyFacelets = async () => {
    if (!manualColorInput.trim()) {
      alert('Please enter facelet data')
      return
    }

    setLoading(true)
    try {
      // The textarea's onInput already keeps notationFormat in sync with
      // pasted content via detectNotationFormat, but fall back to it here
      // too in case content ever reaches this handler without going
      // through that path (e.g. a fast paste-and-submit).
      const effectiveFormat = detectNotationFormat(manualColorInput) ?? notationFormat
      const newCube = effectiveFormat === 'wrg'
        ? fromWRGFacelets(manualColorInput)
        : fromURFFacelets(manualColorInput)
      if (!newCube) {
        alert(
          effectiveFormat === 'wrg'
            ? 'Invalid facelets. Must be 6 space-separated blocks of equal, perfect-square length (9 for 3×3, 25 for 5×5, ...) using colors W, O, G, R, B, Y, in U R F D L B order.'
            : 'Invalid facelets. Must be 6 space-separated blocks of equal, perfect-square length (9 for 3×3, 25 for 5×5, ...) using letters U, R, F, D, L, B (the face each sticker matches when solved), in U R F D L B order.'
        )
        return
      }
      if (effectiveFormat !== notationFormat) setNotationFormat(effectiveFormat)

      const size = Math.sqrt(newCube.u.length)
      setPuzzleSize(size)
      setCube(newCube)

      const toGrid = (data: string[]): string[][] =>
        Array.from({ length: size }, (_, r) => data.slice(r * size, r * size + size))
      const newCapturedFaces: Record<string, FaceCaptureData> = {}
      for (const [face, data] of Object.entries(newCube)) {
        newCapturedFaces[face.toUpperCase()] = { colors: toGrid(data), confidence: 1.0, timestamp: Date.now() }
      }
      setCapturedFaces(newCapturedFaces)

      await updateParityStatus(newCube, size)
      setManualColorInput('')
      setShowColorInput(false)
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Features: Parity Validation (#10)
  // ─────────────────────────────────────────────────────────────────────────

  const updateParityStatus = async (cubeState: any, sizeOverride?: number) => {
    try {
      const result = await checkParity(cubeState, sizeOverride ?? puzzleSize)
      setParity(result)
    } catch (err) {
      console.error('Parity check error:', err)
      setParity({
        valid: false,
        result: err instanceof Error ? err.message : 'Parity check failed',
        checks: {},
      })
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Features: WRG Notation Parser (#5, #6 partial)
  // ─────────────────────────────────────────────────────────────────────────

  const handleParseWRG = async (notation: string) => {
    if (!notation.trim()) return
    const res = await fetch('/api/parse-wrg', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notation, size: puzzleSize }),
    })
    const data = await res.json()
    if (data.cube) {
      setCube(data.cube)
      await updateParityStatus(data.cube)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Features: Assembly Pipeline (#6)
  // ─────────────────────────────────────────────────────────────────────────

  const handleRunAssembly = async () => {
    if (!cube) return

    const eventSource = streamAssembly([cube.u, cube.r, cube.f, cube.d, cube.l, cube.b], puzzleSize)

    eventSource.onmessage = (e) => {
      const msg = JSON.parse(e.data) as AssemblyResult
      setAssemblyResults((prev) => [...prev, msg])

      if (msg.type === 'result' && msg.states && msg.states.length > 0) {
        setCube(msg.states[0])
        updateParityStatus(msg.states[0])
      }

      if (msg.type === 'error') {
        console.error('Assembly error:', msg.message)
      }
    }

    eventSource.onerror = () => {
      eventSource.close()
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Features: Face Capture Modal (#5)
  // ─────────────────────────────────────────────────────────────────────────

  // Single capture entry point: resume at the first uncaptured face, or -
  // once all 6 are already done - clear every prior capture and start
  // completely over from U, so "Recapture Faces" actually re-walks all 6
  // faces instead of silently reusing the other 5's stale data.
  const handleOpenCapture = () => {
    const allCaptured = FACE_ORDER.every((f) => f in capturedFaces)
    if (allCaptured) {
      setCapturedFaces({})
      setFaceConfidence({})
      setLockedAutoGains(null)
    }
    const nextFace = allCaptured ? FACE_ORDER[0] : FACE_ORDER.find((f) => !(f in capturedFaces))!
    setWebcamFace(nextFace)
    setCaptureMessage('')
    setGlobalWhiteBalanceNote(null)
    setWebcamOpen(true)
  }

  // Stores a capture result for `face`, opens the review dialog once all 6
  // faces are in (so the user can fix any misdetected colors before the
  // cube is assembled), and otherwise auto-advances the modal to the next
  // uncaptured face so the user doesn't have to close/reopen it per face.
  const applyFaceCapture = async (
    face: string,
    result: {
      colors: string[][]
      confidence: number
      cellConfidences?: number[][]
      cellColors?: RGB[][]
      croppedImage?: string
    }
  ) => {
    if (!validateFaceColors(result.colors, puzzleSize)) {
      setCaptureMessage(`❌ Invalid colors detected. Confidence: ${(result.confidence * 100).toFixed(0)}%`)
      return
    }

    const newCapturedFaces = {
      ...capturedFaces,
      [face]: {
        colors: result.colors,
        cellConfidences: result.cellConfidences,
        cellColors: result.cellColors,
        confidence: result.confidence,
        croppedImage: result.croppedImage,
        timestamp: Date.now(),
      },
    }

    setCapturedFaces(newCapturedFaces)
    setFaceConfidence({ ...faceConfidence, [face]: result.confidence })
    setCaptureMessage(`✓ Face ${FACE_DISPLAY_LABEL[face]} captured (${(result.confidence * 100).toFixed(0)}% confidence)`)

    const allFacesCaptured = FACE_ORDER.every(f => f in newCapturedFaces)
    if (allFacesCaptured) {
      setCaptureMessage('✓ All faces captured! Checking white balance across all stickers...')
      setLoading(true)

      const canRecalibrate = FACE_ORDER.every((f) => newCapturedFaces[f].croppedImage)
      if (canRecalibrate) {
        try {
          const images: Record<string, string> = {}
          for (const f of FACE_ORDER) images[f] = newCapturedFaces[f].croppedImage!

          const wb = await runGlobalWhiteBalance(images, puzzleSize)
          if (wb.applied) {
            const recalibrated = { ...newCapturedFaces }
            for (const f of FACE_ORDER) {
              const det = wb.faces[f]
              recalibrated[f] = { ...recalibrated[f], colors: det.colors, cellConfidences: det.cellConfidences, cellColors: det.cellColors, confidence: det.confidence }
            }
            setCapturedFaces(recalibrated)
            setGlobalWhiteBalanceNote('Colors re-checked by learning each sticker color from all 6 faces together, instead of fixed reference values.')
          } else {
            setGlobalWhiteBalanceNote(null)
          }
        } catch (err) {
          console.error('Global white balance error:', err)
          setGlobalWhiteBalanceNote(null)
        }
      }

      setLoading(false)
      setWebcamOpen(false)
      setReviewStep(0)
      setShowReviewDialog(true)
    } else {
      const nextFace = FACE_ORDER.find(f => !(f in newCapturedFaces))
      if (nextFace) {
        setTimeout(() => {
          setWebcamFace(nextFace)
          setCaptureMessage('')
        }, 900)
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Features: Post-Capture Review & Color Fix
  // ─────────────────────────────────────────────────────────────────────────

  const handleFixCellColor = (face: string, row: number, col: number, newColor: string) => {
    setCapturedFaces((prev) => {
      const faceData = prev[face]
      if (!faceData) return prev

      const newColors = faceData.colors.map((r) => [...r])
      newColors[row][col] = newColor

      const newCellConfidences = faceData.cellConfidences?.map((r) => [...r])
      if (newCellConfidences) newCellConfidences[row][col] = 1

      return {
        ...prev,
        [face]: { ...faceData, colors: newColors, cellConfidences: newCellConfidences },
      }
    })
    setReviewEditingCell(null)
  }

  const handleRetakeFace = (face: string) => {
    setShowReviewDialog(false)
    setWebcamFace(face)
    setCaptureMessage('')
    setWebcamOpen(true)
  }

  const handleConfirmReview = async () => {
    const faceData: Record<string, string[][]> = {}
    for (const [f, data] of Object.entries(capturedFaces)) {
      faceData[f] = data.colors
    }

    // Capture order tells us nothing about which physical face is U vs R
    // vs F etc, or which way up each was held. Odd sizes get identity for
    // free from each face's fixed center sticker; even sizes search for
    // identity jointly with rotation instead (see solveFaceOrientations).
    // Either way, use the solved result (identity by validity, not
    // capture order) instead of trusting capture order as identity.
    let orientedFaceData = faceData
    const solved = solveFaceOrientations(faceData)
    if (solved) {
      orientedFaceData = solved.faces
      if (solved.cornerScore < 8 || solved.edgeScore < 12) {
        alert(
          `⚠️ Orientation solved with ${solved.cornerScore}/8 corners and ${solved.edgeScore}/12 edges valid — some captured colors may be misdetected. Check the assembled cube.`
        )
      }
    } else {
      alert(
        '⚠️ Could not resolve face identity/orientation (need exactly 6 captured faces, or for odd sizes a duplicate/unreadable center) — used capture order as-is; verify results carefully.'
      )
    }

    const cubeState = assembleCubeFromFaces(orientedFaceData, puzzleSize)
    setCube(cubeState)
    await updateParityStatus(cubeState)
    setShowReviewDialog(false)
  }

  // Saves this capture - each face's actual photo plus its (human-
  // reviewed/corrected) color grid - as a permanent regression fixture on
  // the server (test/fixtures/<name>/, see server/Server.ts's
  // POST /api/fixtures and test/fixtures.test.ts). Only meaningful once a
  // cube has actually been confirmed: that's the point at which
  // capturedFaces' colors reflect whatever corrections were made in the
  // review wizard, not just the raw first-pass detection.
  const handleSendFixtureToServer = async () => {
    const allCaptured = FACE_ORDER.every((f) => capturedFaces[f]?.croppedImage)
    if (!allCaptured) {
      setFixtureSaveMessage('❌ Capture and confirm all 6 faces first.')
      return
    }
    setLoading(true)
    setFixtureSaveMessage('Sending...')
    try {
      const faces: Record<string, { photo: string; colors: string[][] }> = {}
      for (const f of FACE_ORDER) {
        faces[f] = { photo: capturedFaces[f].croppedImage!, colors: capturedFaces[f].colors }
      }
      const res = await fetch('/api/fixtures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gridSize: puzzleSize, faces }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error ?? `Failed (${res.status})`)
      setFixtureSaveMessage(`✓ Saved as regression fixture: ${result.path}`)
    } catch (err) {
      setFixtureSaveMessage(`❌ Failed to save fixture: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setLoading(false)
    }
  }

  // The gain the user has actually chosen right now — in Auto mode,
  // face 1's locked estimate once it exists (see lockedAutoGains), else
  // the live estimate (falls back to neutral if none exists yet, e.g.
  // camera still warming up); a fixed preset otherwise.
  const getCurrentGains = (): RGB =>
    whiteBalanceMode === 'auto'
      ? lockedAutoGains?.gains ?? autoWhiteBalance?.gains ?? NEUTRAL_GAINS
      : WHITE_BALANCE_PRESETS[whiteBalanceMode]

  // Locks in Auto mode's gain the moment face 1 is captured, so faces
  // 2-6 reuse it instead of each re-estimating from their own frame.
  const lockAutoGainsIfFirstFace = (face: string) => {
    if (whiteBalanceMode === 'auto' && face === FACE_ORDER[0] && !lockedAutoGains && autoWhiteBalance) {
      setLockedAutoGains(autoWhiteBalance)
    }
  }

  const handleCapturePhoto = async () => {
    if (!webcamRef.current) return

    try {
      setLoading(true)
      setCaptureMessage('Processing image...')
      lockAutoGainsIfFirstFace(webcamFace)
      const result = captureAndProcessFace(webcamRef.current, puzzleSize, getCurrentGains())
      await applyFaceCapture(webcamFace, result)
    } catch (err) {
      console.error('Capture error:', err)
      setCaptureMessage(`❌ Error: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }

  const handleImportImage = async (e: Event) => {
    const input = e.currentTarget as HTMLInputElement
    const file = input.files?.[0]
    if (!file) return

    try {
      setLoading(true)
      setCaptureMessage('Processing image...')

      const url = URL.createObjectURL(file)
      try {
        const img = new Image()
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve()
          img.onerror = () => reject(new Error('Could not load image file'))
          img.src = url
        })
        lockAutoGainsIfFirstFace(webcamFace)
        const result = captureAndProcessImage(img, puzzleSize, getCurrentGains())
        await applyFaceCapture(webcamFace, result)
      } finally {
        URL.revokeObjectURL(url)
      }
    } catch (err) {
      console.error('Image import error:', err)
      setCaptureMessage(`❌ Error: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
      input.value = ''
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Features: Copy to Clipboard (#11)
  // ─────────────────────────────────────────────────────────────────────────

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      alert('Copied to clipboard!')
    } catch (err) {
      console.error('Copy failed:', err)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // UI: Preset Algorithms
  // ─────────────────────────────────────────────────────────────────────────

  const presets = {
    Trigger: "R U R' U'",
    Sune: "R U R' U R U2 R'",
    Slices: "M' U M U2 M' U M",
    Rotations: "x y z",
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  const getNotationOutput = () => {
    if (!cube) return 'null'
    return notationFormat === 'wrg' ? toWRGFacelets(cube) : toURFFacelets(cube)
  }

  return (
    <div id="app">
      {/* Header */}
      <header class="app-header">
        <div class="header-content">
          <h1>CubeAssembler</h1>
          <p>Assemble, validate, and solve Rubik's Cubes from face photos</p>
        </div>
      </header>

      {/* 3D Viewer */}
      <div class="viewer-region">
        <div class="viewer-controls">
          <h3>Puzzle Size</h3>
          <div class="size-selector">
            {[2, 3, 4, 5, 6, 7].map((size) => (
              <button
                key={size}
                class={`size-btn ${puzzleSize === size ? 'active' : ''}`}
                onClick={() => setPuzzleSize(size)}
              >
                {size}×{size}
              </button>
            ))}
          </div>
        </div>
        <div class="viewer-canvas">
          <div id="twisty-player-container" style={{ width: '100%', height: '100%' }}></div>
        </div>
      </div>

      {/* Cube Net */}
      {cube && (
        <div class="net-region">
          <h3>Cube Net</h3>
          <div class="cube-net">
            {(
              [
                ['U', cube.u, 'net-u'],
                ['L', cube.l, 'net-l'],
                ['F', cube.f, 'net-f'],
                ['R', cube.r, 'net-r'],
                ['B', cube.b, 'net-b'],
                ['D', cube.d, 'net-d'],
              ] as [string, string[], string][]
            ).map(([label, data, cls]) => (
              <div class={`net-face ${cls}`} key={label}>
                <div
                  class="net-face-grid"
                  style={{ gridTemplateColumns: `repeat(${puzzleSize}, 1fr)` }}
                >
                  {data.map((color, i) => (
                    <div
                      class="net-cell"
                      key={i}
                      style={{ background: STICKER_HEX[color] || '#888' }}
                    ></div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Face Capture Panel */}
      <section class="face-capture-panel">
        <div class="face-capture-header">
          <h2>Capture Cube Faces</h2>
          <div class="face-capture-actions">
            <button class="btn btn-secondary btn-sm" onClick={handleApplySolved}>
              Reset to Solved
            </button>
            <button class="btn btn-secondary btn-sm" onClick={() => setShowColorInput(!showColorInput)}>
              {showColorInput ? '✕ Close' : '+ Manual Input'}
            </button>
          </div>
        </div>
        <div class="face-capture-entry">
          <button class="btn btn-primary" onClick={handleOpenCapture}>
            {FACE_ORDER.every((f) => f in capturedFaces)
              ? 'Recapture Faces'
              : FACE_ORDER.some((f) => f in capturedFaces)
              ? `Continue Capturing (${FACE_ORDER.filter((f) => f in capturedFaces).length}/${FACE_ORDER.length})`
              : 'Capture Faces'}
          </button>
          {FACE_ORDER.every((f) => f in capturedFaces) && (
            <button
              class="btn btn-secondary"
              onClick={() => {
                setReviewStep(0)
                setShowReviewDialog(true)
              }}
            >
              ✎ Edit Colors
            </button>
          )}
          <div class="face-status-dots">
            {FACE_ORDER.map((face) => (
              <span
                key={face}
                class={`progress-dot ${capturedFaces[face] ? 'done' : ''}`}
                title={`Face ${FACE_DISPLAY_LABEL[face]}${capturedFaces[face] ? ' (captured)' : ' (not captured)'}`}
              >
                {FACE_DISPLAY_LABEL[face]}
              </span>
            ))}
          </div>
        </div>
        {showColorInput && (
          <div class="color-input-panel">
            <div class="notation-format-toggle">
              <button
                class={`wb-btn ${notationFormat === 'wrg' ? 'active' : ''}`}
                onClick={() => setNotationFormat('wrg')}
              >
                WRG Facelets
              </button>
              <button
                class={`wb-btn ${notationFormat === 'urf' ? 'active' : ''}`}
                onClick={() => setNotationFormat('urf')}
              >
                URF Facelets
              </button>
            </div>
            <label>
              {notationFormat === 'wrg'
                ? `Enter WRG facelets: 6 blocks of ${puzzleSize * puzzleSize} colors (W, O, G, R, B, Y), space-separated, in U R F D L B order`
                : `Enter URF facelets: 6 blocks of ${puzzleSize * puzzleSize} letters (U, R, F, D, L, B - the face each sticker's color matches when solved), space-separated, in U R F D L B order`}
            </label>
            <textarea
              value={manualColorInput}
              onInput={(e) => {
                const value = e.currentTarget.value
                setManualColorInput(value)
                const detected = detectNotationFormat(value)
                if (detected && detected !== notationFormat) setNotationFormat(detected)
              }}
              placeholder={notationFormat === 'wrg'
                ? Array(6).fill('W'.repeat(puzzleSize * puzzleSize)).join(' ')
                : ['U', 'R', 'F', 'D', 'L', 'B'].map((l) => l.repeat(puzzleSize * puzzleSize)).join(' ')}
              rows={6}
              style={{ width: '100%', marginTop: '0.5rem' }}
            />
            <div class="input-actions">
              <button
                class="btn btn-primary btn-sm"
                onClick={handleApplyFacelets}
                disabled={loading}
              >
                {loading ? '⏳ Processing...' : 'Apply Facelets'}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Right Panel: Algorithms & Results */}
      <aside class="panel panel-controls">
        <h2>WCA Notation</h2>
        <label>Algorithm</label>
        <input
          type="text"
          placeholder="R U R' U'  F' U F  ..."
          value={algorithm}
          onInput={(e) => setAlgorithm(e.currentTarget.value)}
        />

        <div class="algo-presets">
          {Object.entries(presets).map(([name, algo]) => (
            <button
              class="preset-btn"
              onClick={() => handlePresetAlgorithm(algo)}
              key={name}
            >
              {name}
            </button>
          ))}
        </div>

        <button class="btn btn-primary" onClick={handleApplyAlgorithm} disabled={loading || !cube}>
          {loading ? '⏳ Applying...' : 'Apply Algorithm'}
        </button>
        <button class="btn btn-secondary" onClick={handleInvertAlgorithm} disabled={loading || !cube}>
          {loading ? '⏳ Inverting...' : 'Invert & Apply'}
        </button>

        <h2>Scramble</h2>
        <div class="scramble-display">{scramble || 'Press Generate to get a WCA scramble'}</div>
        <button class="btn btn-primary" onClick={handleGenerateScramble} disabled={loading}>
          {loading ? '⏳ Generating...' : 'Generate WCA Scramble'}
        </button>
        <button class="btn btn-secondary" onClick={handleApplyScramble} disabled={loading || !scramble || !cube}>
          {loading ? '⏳ Applying...' : 'Apply Scramble'}
        </button>

        <h2>Parity Status</h2>
        {parity ? (
          <>
            <div class={`status-line ${parity.valid ? 'success' : 'error'}`}>
              <span class={`status-dot ${parity.valid ? 'success' : 'error'}`}></span>
              {parity.result}
            </div>
            <div class="parity-checks">
              {Object.entries(parity.checks).map(([check, valid]: [string, any]) => (
                <div class="status-line" key={check}>
                  <span class={`status-dot ${valid ? 'success' : 'error'}`}></span>
                  {check}: {valid ? '✓' : '✗'}
                </div>
              ))}
            </div>
          </>
        ) : (
          <div class="status-line">No cube loaded. Capture all 6 faces to validate.</div>
        )}

        <h2>Notation Output</h2>
        <div class="notation-format-toggle">
          <button
            class={`wb-btn ${notationFormat === 'wrg' ? 'active' : ''}`}
            onClick={() => setNotationFormat('wrg')}
          >
            WRG Facelets
          </button>
          <button
            class={`wb-btn ${notationFormat === 'urf' ? 'active' : ''}`}
            onClick={() => setNotationFormat('urf')}
          >
            URF Facelets
          </button>
        </div>
        <p class="notation-hint">
          {notationFormat === 'wrg'
            ? `WRG facelets: 6 blocks of ${puzzleSize * puzzleSize} (W O G R B Y colors), space-separated.`
            : `URF facelets: 6 blocks of ${puzzleSize * puzzleSize} (U R F D L B letters), space-separated.`}
        </p>
        <textarea readonly value={getNotationOutput()} />
        <button class="btn btn-primary" onClick={() => cube && copyToClipboard(getNotationOutput())}>
          Copy to Clipboard
        </button>
        {cube && (
          <>
            <button
              class="btn btn-secondary"
              onClick={handleSendFixtureToServer}
              disabled={loading}
              title="Save this capture's photos + reviewed colors on the server as a permanent regression test fixture"
            >
              {loading ? '⏳ Sending...' : '💾 Send to Server (Save as Test Fixture)'}
            </button>
            {fixtureSaveMessage && (
              <div class={`capture-message ${fixtureSaveMessage.includes('✓') ? 'success' : fixtureSaveMessage.includes('❌') ? 'error' : ''}`}>
                {fixtureSaveMessage}
              </div>
            )}
          </>
        )}
      </aside>

      {/* Webcam Modal */}
      {webcamOpen && (
        <div class="modal open">
          <div class="modal-content capture-modal-content">
            <div class="modal-header">
              <h2>Capturing: Face {FACE_DISPLAY_LABEL[webcamFace]}</h2>
              <button class="modal-close" onClick={() => setWebcamOpen(false)}>×</button>
            </div>
            <div class="capture-progress">
              <span class="capture-progress-label">
                Face {FACE_ORDER.indexOf(webcamFace) + 1} of {FACE_ORDER.length}
              </span>
              <div class="capture-progress-dots">
                {FACE_ORDER.map((face) => (
                  <span
                    key={face}
                    class={`progress-dot ${capturedFaces[face] ? 'done' : ''} ${face === webcamFace ? 'current' : ''}`}
                    title={`Face ${FACE_DISPLAY_LABEL[face]}${capturedFaces[face] ? ' (captured)' : ''} — click to jump here`}
                    onClick={() => {
                      setWebcamFace(face)
                      setCaptureMessage('')
                    }}
                  >
                    {FACE_DISPLAY_LABEL[face]}
                  </span>
                ))}
              </div>
            </div>
            <div class="capture-size-row">
              <span class="capture-size-label">Cube size:</span>
              <div class="capture-size-buttons">
                {[2, 3, 4, 5, 6, 7].map((size) => (
                  <button
                    key={size}
                    class={`wb-btn ${puzzleSize === size ? 'active' : ''}`}
                    onClick={() => {
                      if (size === puzzleSize) return
                      if (Object.keys(capturedFaces).length > 0) {
                        setCapturedFaces({})
                        setFaceConfidence({})
                        setWebcamFace(FACE_ORDER[0])
                      }
                      setPuzzleSize(size)
                    }}
                  >
                    {size}×{size}
                  </button>
                ))}
              </div>
            </div>
            <div class="white-balance-row">
              <span class="white-balance-label">White balance:</span>
              <div class="white-balance-buttons">
                {(['auto', 'daylight', 'cloudy', 'tungsten', 'fluorescent'] as const).map((mode) => (
                  <button
                    key={mode}
                    class={`wb-btn ${whiteBalanceMode === mode ? 'active' : ''}`}
                    onClick={() => setWhiteBalanceMode(mode)}
                  >
                    {mode === 'auto' ? 'Auto' : mode[0].toUpperCase() + mode.slice(1)}
                  </button>
                ))}
              </div>
              {whiteBalanceMode === 'auto' && (
                <span class="white-balance-detected">
                  {lockedAutoGains
                    ? `Locked from Face ${FACE_DISPLAY_LABEL[FACE_ORDER[0]]}: ${lockedAutoGains.lightSource}`
                    : autoWhiteBalance
                    ? `Detected: ${autoWhiteBalance.lightSource}`
                    : 'Detecting light source…'}
                </span>
              )}
              <label class="mirror-toggle">
                <input
                  type="checkbox"
                  checked={mirrorPreview}
                  onChange={(e) => setMirrorPreview(e.currentTarget.checked)}
                />
                Mirror
              </label>
            </div>
            <div class="capture-video-wrapper">
              <video
                ref={webcamRef}
                autoplay
                muted
                playsinline
                class={`webcam-feed ${mirrorPreview ? 'mirrored' : ''}`}
              />
              {liveDetection && (
                <div
                  class={`capture-grid-overlay ${mirrorPreview ? 'mirrored' : ''}`}
                  style={{
                    gridTemplateColumns: `repeat(${puzzleSize}, 1fr)`,
                    gridTemplateRows: `repeat(${puzzleSize}, 1fr)`,
                  }}
                >
                  {liveDetection.colors.map((row, r) =>
                    row.map((color, c) => (
                      <div
                        key={`${r}-${c}`}
                        class={`capture-grid-cell confidence-${confidenceTier(liveDetection.cellConfidences[r][c])}`}
                        style={{ background: `${STICKER_HEX[color] || '#888'}66` }}
                      >
                        <OklchLines class="capture-grid-hue" oklch={rgbToOKLCH(liveDetection.cellColors[r][c])} />
                      </div>
                    ))
                  )}
                </div>
              )}
              {/* Always-visible guide framing exactly what region gets
                  analyzed, on top of the grid so its border/dimming stays
                  visible even once per-cell colors are drawn underneath. */}
              <div class="capture-scan-frame">
                <span class="capture-scan-label">Fit face in this square</span>
              </div>
            </div>
            <p class="capture-hint-text">
              Align cube face in center
              {' — live confidence: '}
              {liveDetection ? `${(liveDetection.confidence * 100).toFixed(0)}%` : '—'}
            </p>
            <div
              class={`capture-message ${captureMessage ? (captureMessage.includes('✓') ? 'success' : captureMessage.includes('❌') ? 'error' : '') : 'is-empty'}`}
            >
              {captureMessage || '—'}
            </div>
            <button
              class="btn btn-primary"
              onClick={handleCapturePhoto}
              disabled={loading}
            >
              {loading ? '⏳ Processing...' : 'Capture Photo'}
            </button>

            <label>Import from image file</label>
            <input type="file" accept="image/*" onChange={handleImportImage} disabled={loading} />
          </div>
        </div>
      )}

      {/* Post-Capture Review Wizard: step through faces one at a time,
          photo on the left (clean, undecorated) and the detected colors as
          a separate interactive grid on the right — not overlaid on the
          photo, so there's always a clear, unobstructed original to check
          the detection against. */}
      {showReviewDialog && (() => {
        const face = FACE_ORDER[reviewStep]
        const data = capturedFaces[face]
        const isLast = reviewStep === FACE_ORDER.length - 1
        // Recomputed from capturedFaces on every render (not stored state)
        // so it never goes stale - it has to reflect manual per-sticker
        // fixes immediately, since seeing the count move is the whole
        // point of a fix.
        const liveColorCounts: Record<string, number> = { W: 0, O: 0, G: 0, R: 0, B: 0, Y: 0 }
        const liveColorOKLCH: Record<string, { l: number; c: number; h: number }[]> = { W: [], O: [], G: [], R: [], B: [], Y: [] }
        for (const f of FACE_ORDER) {
          const grid = capturedFaces[f]?.colors
          const cellColors = capturedFaces[f]?.cellColors
          if (!grid) continue
          grid.forEach((row, r) => row.forEach((color, c) => {
            if (!(color in liveColorCounts)) return
            liveColorCounts[color]++
            const rgb = cellColors?.[r]?.[c]
            if (rgb) liveColorOKLCH[color].push(rgbToOKLCH(rgb))
          }))
        }
        return (
          <div class="modal open">
            <div class="modal-content review-modal-content">
              <div class="modal-header">
                <h2>Approve Face {FACE_DISPLAY_LABEL[face]} of {FACE_ORDER.length}</h2>
                <button class="modal-close" onClick={() => setShowReviewDialog(false)}>×</button>
              </div>
              <div class="review-progress-dots">
                {FACE_ORDER.map((f, i) => (
                  <span
                    key={f}
                    class={`progress-dot ${i < reviewStep ? 'done' : ''} ${i === reviewStep ? 'current' : ''}`}
                    onClick={() => setReviewStep(i)}
                    title={`Face ${FACE_DISPLAY_LABEL[f]}`}
                  >
                    {FACE_DISPLAY_LABEL[f]}
                  </span>
                ))}
              </div>
              {globalWhiteBalanceNote && (
                <div class="global-wb-note">✓ {globalWhiteBalanceNote}</div>
              )}
              {(() => {
                const colorOrder = ['W', 'O', 'G', 'R', 'B', 'Y']
                // Computed once for all 6 colors up front (rather than
                // per-row) so each color's hue range can be cross-checked
                // against every OTHER color's - a color whose range
                // overlaps a neighbor's is exactly the situation that
                // produces boundary misclassifications between the two,
                // and is worth surfacing before it shows up as a wrong
                // sticker instead of just a number.
                const hRangesByColor: Record<string, ReturnType<typeof hueCircularRange>> = {}
                for (const color of colorOrder) {
                  hRangesByColor[color] = hueCircularRange(liveColorOKLCH[color].map((o) => o.h))
                }
                const overlapsByColor: Record<string, string[]> = {}
                for (const color of colorOrder) {
                  const range = hRangesByColor[color]
                  overlapsByColor[color] = range
                    ? colorOrder.filter((other) => {
                        if (other === color) return false
                        const otherRange = hRangesByColor[other]
                        return otherRange !== null && hueRangesOverlap(range, otherRange)
                      })
                    : []
                }

                return (
                  <table class="color-stats-table">
                    <thead>
                      <tr>
                        <th>Color</th>
                        <th class="color-stats-numeric-cell">Count</th>
                        <th class="color-stats-numeric-cell">Lightness</th>
                        <th class="color-stats-numeric-cell">Chroma</th>
                        <th class="color-stats-numeric-cell">Hue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {colorOrder.map((color) => {
                        const expected = puzzleSize * puzzleSize
                        const count = liveColorCounts[color]
                        const samples = liveColorOKLCH[color]
                        const lRange = linearRange(samples.map((o) => o.l))
                        const cRange = linearRange(samples.map((o) => o.c))
                        const hRange = hRangesByColor[color]
                        const overlaps = overlapsByColor[color]
                        return (
                          <tr key={color} class={count !== expected ? 'mismatch' : ''}>
                            <td class="color-stats-swatch-cell">
                              <span class="color-stat-swatch" style={{ background: STICKER_HEX[color] }} />
                            </td>
                            <td class="color-stats-numeric-cell">{count}/{expected}</td>
                            <td class="color-stats-numeric-cell">
                              {lRange ? `${Math.round(lRange.min * 100)}%–${Math.round(lRange.max * 100)}%` : '—'}
                            </td>
                            <td class="color-stats-numeric-cell">
                              {cRange ? `${Math.round((cRange.min / 0.4) * 100)}%–${Math.round((cRange.max / 0.4) * 100)}%` : '—'}
                            </td>
                            <td
                              class={`color-stats-numeric-cell ${overlaps.length > 0 ? 'color-stats-hue-overlap' : ''}`}
                              title={overlaps.length > 0 ? `Hue range overlaps ${overlaps.join(', ')} this capture — check for mixups between these colors` : undefined}
                            >
                              {hRange ? `${Math.round(hRange.min)}°–${Math.round(hRange.max)}°` : '—'}
                              {overlaps.length > 0 && <span class="color-stats-overlap-flag" aria-label={`overlaps ${overlaps.join(', ')}`}>⚠</span>}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )
              })()}
              {data && (
                <>
                  <div class="review-wizard-panes">
                    <div class="review-pane">
                      <div class="review-pane-label">Photo</div>
                      <div class="review-face-image-wrapper">
                        {data.croppedImage && <img src={data.croppedImage} class="review-face-image" />}
                      </div>
                    </div>
                    <div class="review-pane">
                      <div class="review-pane-label">Detected — tap a sticker to fix</div>
                      <div
                        class="review-detected-grid"
                        style={{
                          gridTemplateColumns: `repeat(${data.colors.length}, 1fr)`,
                          gridTemplateRows: `repeat(${data.colors.length}, 1fr)`,
                        }}
                      >
                        {data.colors.map((row, r) =>
                          row.map((color, c) => {
                            const rgb = data.cellColors?.[r]?.[c]
                            const oklch = rgb ? rgbToOKLCH(rgb) : null
                            return (
                              <button
                                key={`${r}-${c}`}
                                class={`review-detected-cell confidence-${confidenceTier(data.cellConfidences?.[r]?.[c] ?? 1)}`}
                                style={{ background: STICKER_HEX[color] || '#888' }}
                                onClick={() => setReviewEditingCell({ face, row: r, col: c })}
                                title={`Row ${r + 1}, Col ${c + 1}: ${color}${oklch ? ` (${formatOKLCHValues(oklch)})` : ''} — tap to fix`}
                              >
                                {oklch && <OklchLines class="review-detected-hue" oklch={oklch} />}
                              </button>
                            )
                          })
                        )}
                      </div>
                    </div>
                  </div>
                  <div class="review-wizard-nav">
                    <button class="btn btn-secondary btn-sm" onClick={() => handleRetakeFace(face)}>
                      Retake this face
                    </button>
                    <div class="review-wizard-nav-spacer" />
                    <button
                      class="btn btn-secondary btn-sm"
                      onClick={() => setReviewStep((s) => Math.max(0, s - 1))}
                      disabled={reviewStep === 0}
                    >
                      ← Previous
                    </button>
                    {isLast ? (
                      <button class="btn btn-primary" onClick={handleConfirmReview}>
                        ✓ Confirm & Assemble Cube
                      </button>
                    ) : (
                      <button class="btn btn-primary" onClick={() => setReviewStep((s) => s + 1)}>
                        Approve & Next →
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )
      })()}

      {/* Color-fix palette popup */}
      {reviewEditingCell && (
        <div class="modal open color-picker-modal" onClick={() => setReviewEditingCell(null)}>
          <div class="modal-content color-picker-content" onClick={(e) => e.stopPropagation()}>
            <h3>Fix color</h3>
            <div class="color-palette">
              {['W', 'Y', 'O', 'R', 'G', 'B'].map((color) => (
                <button
                  key={color}
                  class="color-btn"
                  style={{ background: STICKER_HEX[color] }}
                  onClick={() =>
                    handleFixCellColor(reviewEditingCell!.face, reviewEditingCell!.row, reviewEditingCell!.col, color)
                  }
                >
                  {color}
                </button>
              ))}
            </div>
            <button class="btn btn-secondary btn-sm" onClick={() => setReviewEditingCell(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Hydrate
// ─────────────────────────────────────────────────────────────────────────────

const app = document.querySelector('#app')
if (app) {
  render(<App />, app)
}